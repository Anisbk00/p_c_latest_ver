/**
 * Food Photo Analysis API
 * 
 * Uses Gemini Flash Vision to analyze food photos and extract:
 * - Food name/description
 * - Estimated macros (calories, protein, carbs, fat)
 * - Serving size estimation
 * 
 * @module api/analyze-food-photo
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateWithImage, MODEL_NAME } from '@/lib/ai/gemini-service'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface AnalyzedFood {
  name: string
  description: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sugar?: number
  servingSize: number
  servingUnit: string
  confidence: number
  detectedItems: string[]
}

// ═══════════════════════════════════════════════════════════════
// Food Analysis Prompt
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
    } catch (e) {
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
    body = parseResult.data
    // Sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    const image = body.image

    // Extract base64 data from the image URL
    let base64Data: string
    let mimeType: string = 'image/jpeg'

    if (image.startsWith('data:')) {
      // Extract mime type and base64 from data URL
      const matches = image.match(/^data:([^;]+);base64,(.+)$/)
      if (matches) {
        mimeType = matches[1]
        base64Data = matches[2]
      } else {
        return NextResponse.json(
          { error: 'Invalid image data URL format' },
          { status: 400 }
        )
      }
    } else {
      // For regular URLs, fetch and convert to base64 (with timeout)
      try {
        const response = await fetch(image, { signal: AbortSignal.timeout(8000) })
        if (!response.ok) {
          return NextResponse.json(
            { error: `Failed to fetch image: ${response.status}` },
            { status: 400 }
          )
        }
        const arrayBuffer = await response.arrayBuffer()
        base64Data = Buffer.from(arrayBuffer).toString('base64')
        mimeType = response.headers.get('content-type') || 'image/jpeg'
      } catch (fetchError) {
        return NextResponse.json(
          { error: 'Failed to fetch image from URL' },
          { status: 400 }
        )
      }
    }

    // Analyze the image using Gemini Vision
    const content = await generateWithImage(FOOD_ANALYSIS_PROMPT, base64Data, mimeType)

    if (!content) {
      return NextResponse.json(
        { error: 'Failed to analyze image' },
        { status: 500 }
      )
    }

    // Parse the JSON response
    let analyzedFood: AnalyzedFood
    
    try {
      // P2 FIX: More robust JSON extraction from AI response
      let cleanContent = content.trim()
      
      // Method 1: Remove markdown code blocks if present
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7)
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3)
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3)
      }
      cleanContent = cleanContent.trim()
      
      // Method 2: If still not valid JSON, try to extract JSON object
      if (!cleanContent.startsWith('{')) {
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          cleanContent = jsonMatch[0]
        }
      }
      
      // Method 3: Handle escaped newlines or extra whitespace
      cleanContent = cleanContent.replace(/[\r\n]+/g, ' ').trim()
      
      analyzedFood = JSON.parse(cleanContent)
    } catch (parseError) {
      console.error('[analyze-food-photo] JSON parse error:', parseError)
      console.error('[analyze-food-photo] Raw content:', content)
      
      // P2 FIX: Return partial data with low confidence instead of failing completely
      return NextResponse.json({
        success: true,
        food: {
          name: 'Unknown Food',
          description: 'Could not analyze this image',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          servingSize: 100,
          servingUnit: 'g',
          confidence: 0.1,
          detectedItems: [],
        },
        provider: 'gemini-2.5-flash',
        model: MODEL_NAME,
        parseWarning: 'AI response could not be parsed, returning defaults',
      })
    }

    // Validate and sanitize the response
    const result: AnalyzedFood = {
      name: String(analyzedFood.name || 'Unknown Food').slice(0, 100),
      description: String(analyzedFood.description || '').slice(0, 200),
      calories: Math.max(0, Number(analyzedFood.calories) || 0),
      protein: Math.max(0, Number(analyzedFood.protein) || 0),
      carbs: Math.max(0, Number(analyzedFood.carbs) || 0),
      fat: Math.max(0, Number(analyzedFood.fat) || 0),
      fiber: analyzedFood.fiber ? Math.max(0, Number(analyzedFood.fiber)) : undefined,
      sugar: analyzedFood.sugar ? Math.max(0, Number(analyzedFood.sugar)) : undefined,
      servingSize: Math.max(1, Number(analyzedFood.servingSize) || 100),
      servingUnit: ['g', 'ml', 'piece'].includes(analyzedFood.servingUnit) 
        ? analyzedFood.servingUnit 
        : 'g',
      confidence: Math.min(1, Math.max(0, Number(analyzedFood.confidence) || 0.5)),
      detectedItems: Array.isArray(analyzedFood.detectedItems) 
        ? analyzedFood.detectedItems.slice(0, 10).map(String)
        : [],
    }

    return NextResponse.json({
      success: true,
      food: result,
      provider: 'gemini-2.5-flash',
      model: MODEL_NAME,
    })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[analyze-food-photo] Error:', error)
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to analyze food photo' 
      },
      { status: 500 }
    )
  }
}
