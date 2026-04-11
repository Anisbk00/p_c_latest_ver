/**
 * Food Photo Analysis API
 * 
 * Strategy:
 * 1. Try Supabase Edge Function first (150s timeout, no Vercel limits)
 * 2. Fallback: Direct Gemini API call (works within 60s with compressed images)
 * 
 * @module api/analyze-food-photo
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

// Extend Vercel Hobby timeout from default 10s to 60s
export const maxDuration = 60

// ═══════════════════════════════════════════════════════════════
// Gemini Direct API Call (fallback when edge function unavailable)
// ═══════════════════════════════════════════════════════════════

const FOOD_ANALYSIS_PROMPT = `You are a nutrition expert analyzing food images. Analyze this food image and provide accurate nutritional information.

Respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks):
{
  "name": "Brief food name (2-4 words max)",
  "description": "Brief description of the food visible (1 sentence)",
  "calories": number (total calories estimated),
  "protein": number (grams of protein),
  "carbs": number (grams of carbohydrates),
  "fat": number (grams of fat),
  "fiber": number (grams of fiber, optional),
  "sugar": number (grams of sugar, optional),
  "servingSize": number (estimated serving size in grams),
  "servingUnit": "g" or "ml" or "piece",
  "confidence": number (0.0 to 1.0 - how confident in the analysis),
  "detectedItems": ["list", "of", "individual", "food", "items", "visible"]
}

Important:
- Be realistic with macro estimates based on typical portion sizes
- If multiple foods are visible, estimate combined macros
- If you cannot identify the food, set confidence to 0.3 or lower
- Always return valid JSON with all fields present
- Serving size should be in grams for solid foods, ml for liquids`

async function callGeminiDirect(imageBase64: string, mimeType: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('No Gemini API key configured')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`

  const payload = {
    contents: [{
      parts: [
        { text: FOOD_ANALYSIS_PROMPT },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 2048,
    },
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 50000) // 50s timeout (within 60s Vercel limit)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${errorText.substring(0, 200)}`)
    }

    const result = await response.json()
    const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!textContent) {
      throw new Error('No content in Gemini response')
    }

    // Parse JSON from response
    let cleanContent = textContent.trim()
    if (cleanContent.startsWith('```json')) cleanContent = cleanContent.slice(7)
    else if (cleanContent.startsWith('```')) cleanContent = cleanContent.slice(3)
    if (cleanContent.endsWith('```')) cleanContent = cleanContent.slice(0, -3)
    cleanContent = cleanContent.trim()
    if (!cleanContent.startsWith('{')) {
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) cleanContent = jsonMatch[0]
    }
    cleanContent = cleanContent.replace(/[\r\n]+/g, ' ').trim()

    return JSON.parse(cleanContent)
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseImage(body: { image: string }): { base64Data: string; mimeType: string } {
  const image = body.image
  let base64Data: string
  let mimeType = 'image/jpeg'

  if (image.startsWith('data:')) {
    const matches = image.match(/^data:([^;]+);base64,(.+)$/)
    if (!matches) throw new Error('Invalid image data URL format')
    mimeType = matches[1]
    base64Data = matches[2]
  } else {
    throw new Error('Only base64 data URLs are supported')
  }

  return { base64Data, mimeType }
}

function buildFoodResponse(food: any) {
  return {
    success: true,
    food: {
      name: String(food.name || 'Unknown Food').slice(0, 100),
      description: String(food.description || '').slice(0, 200),
      calories: Math.max(0, Number(food.calories) || 0),
      protein: Math.max(0, Number(food.protein) || 0),
      carbs: Math.max(0, Number(food.carbs) || 0),
      fat: Math.max(0, Number(food.fat) || 0),
      fiber: food.fiber ? Math.max(0, Number(food.fiber)) : undefined,
      sugar: food.sugar ? Math.max(0, Number(food.sugar)) : undefined,
      servingSize: Math.max(1, Number(food.servingSize) || 100),
      servingUnit: ['g', 'ml', 'piece'].includes(food.servingUnit) ? food.servingUnit : 'g',
      confidence: Math.min(1, Math.max(0, Number(food.confidence) || 0.5)),
      detectedItems: Array.isArray(food.detectedItems) ? food.detectedItems.slice(0, 10).map(String) : [],
    },
    provider: 'gemini-2.0-flash',
    model: 'gemini-2.0-flash',
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/analyze-food-photo
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const { user } = await getSupabaseUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { AnalyzeFoodPhotoSchema } = await import('@/lib/validation')
    const parseResult = AnalyzeFoodPhotoSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten()
      }, { status: 400 })
    }

    const { base64Data, mimeType } = parseImage(body)

    // ════════════════════════════════════════════════════
    // PATH 1: Supabase Edge Function (preferred, 150s timeout)
    // ════════════════════════════════════════════════════
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceKey) {
      try {
        const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-food`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ image: body.image }),
          signal: AbortSignal.timeout(120000), // 2 min timeout for edge function
        })

        if (edgeResponse.ok) {
          const result = await edgeResponse.json()
          return NextResponse.json(result)
        }

        // Edge function returned error - return its error to client
        const edgeError = await edgeResponse.json().catch(() => null)
        console.warn('[analyze-food-photo] Edge function returned:', edgeResponse.status, edgeError)
        if (edgeError?.error) {
          return NextResponse.json(
            { error: edgeError.error, edgeStatus: edgeResponse.status },
            { status: edgeResponse.status >= 500 ? 502 : edgeResponse.status }
          )
        }
      } catch (edgeError) {
        console.warn('[analyze-food-photo] Edge function unavailable, falling back to direct Gemini')
      }
    }

    // ════════════════════════════════════════════════════
    // PATH 2: Direct Gemini API call (fallback, within 60s)
    // ════════════════════════════════════════════════════
    try {
      const food = await callGeminiDirect(base64Data, mimeType)
      return NextResponse.json(buildFoodResponse(food))
    } catch (geminiError) {
      const msg = geminiError instanceof Error ? geminiError.message : String(geminiError)
      console.error('[analyze-food-photo] Gemini direct call failed:', msg)

      if (msg.includes('No Gemini API key')) {
        return NextResponse.json(
          { error: 'AI service not configured. Please set GEMINI_API_KEY.' },
          { status: 503 }
        )
      }

      return NextResponse.json(
        { error: `AI analysis failed: ${msg}` },
        { status: 502 }
      )
    }

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[analyze-food-photo] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze food photo' },
      { status: 500 }
    )
  }
}
