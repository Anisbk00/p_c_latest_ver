/**
 * Food Photo Analysis API
 * 
 * Uses Groq (llama-4-scout-17b-16e-instruct) for vision analysis.
 * Groq is ~10x faster than Gemini, completing in 1-3 seconds.
 * 
 * @module api/analyze-food-photo
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export const maxDuration = 10

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

async function callGroqVision(imageBase64: string, mimeType: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('No Groq API key configured')
  }

  const dataUrl = `data:${mimeType};base64,${imageBase64}`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: FOOD_ANALYSIS_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      temperature: 0.35,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 429) throw new Error('RATE_LIMIT')
    if (response.status === 401) throw new Error('API_KEY_INVALID')
    throw new Error(`Groq API error ${response.status}: ${errorText.substring(0, 200)}`)
  }

  const result = await response.json()
  const textContent = result.choices?.[0]?.message?.content

  if (!textContent) throw new Error('No content in Groq response')

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
}

function parseImage(body: { image: string }): { base64Data: string; mimeType: string } {
  const image = body.image
  if (image.startsWith('data:')) {
    const matches = image.match(/^data:([^;]+);base64,(.+)$/)
    if (!matches) throw new Error('Invalid image data URL format')
    return { base64Data: matches[2], mimeType: matches[1] }
  }
  throw new Error('Only base64 data URLs are supported')
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
    provider: 'groq',
    model: 'llama-4-scout-17b-16e-instruct',
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.flatten() }, { status: 400 })
    }

    const { base64Data, mimeType } = parseImage(body)

    console.log('[analyze-food-photo] Calling Groq Vision API, base64 length:', base64Data.length)
    try {
      const food = await callGroqVision(base64Data, mimeType)
      return NextResponse.json(buildFoodResponse(food))
    } catch (groqError) {
      const msg = groqError instanceof Error ? groqError.message : String(groqError)
      console.error('[analyze-food-photo] Groq error:', msg)

      if (msg === 'RATE_LIMIT') {
        return NextResponse.json(
          { error: 'AI quota exceeded. Please try again in a minute.' },
          { status: 429 }
        )
      }
      if (msg === 'API_KEY_INVALID') {
        return NextResponse.json({ error: 'AI API key is invalid.' }, { status: 503 })
      }
      if (msg.includes('No Groq API key')) {
        return NextResponse.json({ error: 'AI service not configured.' }, { status: 503 })
      }

      return NextResponse.json({ error: 'Food analysis failed. Please try again.' }, { status: 502 })
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
