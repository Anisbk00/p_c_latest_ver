/**
 * Food Photo Analysis API
 * 
 * PROXY: Forwards image analysis to Supabase Edge Function (150s timeout)
 * instead of calling Gemini directly (which exceeds Vercel Hobby 10s timeout).
 * 
 * @module api/analyze-food-photo
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Try Supabase Edge Function first (no timeout issues)
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

        // Edge function returned error - fall through to direct Gemini call
        console.warn('[analyze-food-photo] Edge function returned:', edgeResponse.status)
      } catch (edgeError) {
        console.warn('[analyze-food-photo] Edge function unavailable, using direct call')
      }
    }

    // Fallback: Direct Gemini call (may timeout on Vercel Hobby)
    const { generateWithImage, MODEL_NAME } = await import('@/lib/ai/gemini-service')

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

    const image = body.image
    let base64Data: string
    let mimeType: string = 'image/jpeg'

    if (image.startsWith('data:')) {
      const matches = image.match(/^data:([^;]+);base64,(.+)$/)
      if (matches) {
        mimeType = matches[1]
        base64Data = matches[2]
      } else {
        return NextResponse.json({ error: 'Invalid image data URL format' }, { status: 400 })
      }
    } else {
      try {
        const response = await fetch(image, { signal: AbortSignal.timeout(8000) })
        if (!response.ok) {
          return NextResponse.json({ error: `Failed to fetch image: ${response.status}` }, { status: 400 })
        }
        const arrayBuffer = await response.arrayBuffer()
        base64Data = Buffer.from(arrayBuffer).toString('base64')
        mimeType = response.headers.get('content-type') || 'image/jpeg'
      } catch {
        return NextResponse.json({ error: 'Failed to fetch image from URL' }, { status: 400 })
      }
    }

    const content = await generateWithImage(FOOD_ANALYSIS_PROMPT, base64Data, mimeType)

    if (!content) {
      return NextResponse.json({ error: 'Failed to analyze image' }, { status: 500 })
    }

    // Parse JSON response
    try {
      let cleanContent = content.trim()
      if (cleanContent.startsWith('```json')) cleanContent = cleanContent.slice(7)
      else if (cleanContent.startsWith('```')) cleanContent = cleanContent.slice(3)
      if (cleanContent.endsWith('```')) cleanContent = cleanContent.slice(0, -3)
      cleanContent = cleanContent.trim()
      if (!cleanContent.startsWith('{')) {
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) cleanContent = jsonMatch[0]
      }
      cleanContent = cleanContent.replace(/[\r\n]+/g, ' ').trim()
      const food = JSON.parse(cleanContent)

      return NextResponse.json({
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
        model: MODEL_NAME,
      })
    } catch {
      return NextResponse.json({
        success: true,
        food: {
          name: 'Unknown Food', description: 'Could not analyze this image',
          calories: 0, protein: 0, carbs: 0, fat: 0,
          servingSize: 100, servingUnit: 'g', confidence: 0.1, detectedItems: [],
        },
        provider: 'gemini-2.0-flash', model: MODEL_NAME,
        parseWarning: 'AI response could not be parsed',
      })
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
