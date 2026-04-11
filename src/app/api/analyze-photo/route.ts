/**
 * Photo Analysis API — Optimized for speed & reliability
 * 
 * Key optimizations:
 * - Groq AI call (LPU inference, <2s typical)
 * - DB writes are non-blocking (fire-and-forget) to reduce response time
 * - Settings fetch runs in parallel with request validation
 * - Client receives AI results immediately; DB storage happens in background
 * 
 * Uses Groq (llama-4-scout-17b-16e-instruct) for AI analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 30;
import { analyzePhoto, type PhotoAnalysisType, MODEL_NAME } from '@/lib/ai/gemini-service';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import type { SupportedLocale } from '@/lib/ai/comprehensive-ai-service';

const ANALYSIS_PROMPTS: Record<PhotoAnalysisType, string> = {
  'body-composition': `Analyze this fitness progress photo and provide an estimated body composition assessment.

IMPORTANT: You must respond in JSON format:
{
  "bodyFatEstimate": { "value": number, "confidence": number (0-100), "rationale": "string" },
  "muscleMassEstimate": { "value": number, "confidence": number (0-100), "rationale": "string" },
  "weightEstimate": { "value": number, "confidence": number (0-100), "rationale": "string" },
  "overallConfidence": number (0-100),
  "analysisNotes": "string",
  "recommendations": ["string"]
}

Be honest about limitations. Provide realistic estimates.`,

  'meal': `Analyze this meal photo and identify all foods visible.

IMPORTANT: You must respond in JSON format:
{
  "foods": [
    {
      "name": "string",
      "estimatedPortion": "string",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "confidence": number (0-100)
    }
  ],
  "totalCalories": number,
  "totalProtein": number,
  "totalCarbs": number,
  "totalFat": number,
  "mealType": "breakfast|lunch|dinner|snack",
  "healthScore": number (0-100),
  "recommendations": ["string"]
}`,

  'food-label': `Analyze this nutrition label and extract all information.

IMPORTANT: You must respond in JSON format:
{
  "productName": "string",
  "brand": "string",
  "servingSize": number,
  "servingUnit": "string",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number,
  "sodium": number,
  "ingredients": ["string"],
  "allergens": ["string"],
  "confidence": number (0-100)
}`,

  'progress-photo': `Analyze this fitness progress photo for tracking purposes.

IMPORTANT: You must respond in JSON format:
{
  "estimatedBodyFat": number,
  "muscleDefinition": number (0-100),
  "progressIndicators": ["string"],
  "areasOfImprovement": ["string"],
  "overallAssessment": "string",
  "confidence": number (0-100),
  "recommendations": ["string"]
}`,
};

// ═══════════════════════════════════════════════════════════════
// POST /api/analyze-photo
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Step 1: Auth + request body parsing (parallel)
    const [{ supabase, user }, bodyRaw] = await Promise.all([
      getSupabaseUser(),
      request.json().catch(() => null),
    ]);

    if (!bodyRaw) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Step 2: Validate input
    const { AnalyzePhotoSchema } = await import('@/lib/validation');
    const parseResult = AnalyzePhotoSchema.safeParse(bodyRaw);
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten()
      }, { status: 400 });
    }
    const body = parseResult.data;
    
    const imageUrl = body.imageUrl;
    const imageBase64 = body.imageBase64;
    const mimeType = body.mimeType || 'image/jpeg';
    const analysisType = (body.analysisType || 'body-composition') as PhotoAnalysisType;
    const locale = body.locale || 'en';

    // Step 3: Prepare image URL
    const finalImageUrl = imageBase64
      ? `data:${mimeType};base64,${imageBase64}`
      : imageUrl;

    if (!finalImageUrl) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Step 4: Run Groq AI analysis with an outer timeout to prevent
    // retry-with-backoff from exceeding Vercel gateway timeout.
    // Groq is typically <2s, but this guard prevents runaway retries.
    const OUTER_TIMEOUT_MS = 18000;
    const result = await Promise.race([
      analyzePhoto(finalImageUrl, analysisType),
      new Promise<ReturnType<typeof analyzePhoto>>((resolve) =>
        setTimeout(() => resolve({
          success: false,
          analysis: {},
          provenance: {
            source: 'timeout-guard',
            modelName: MODEL_NAME,
            timestamp: new Date().toISOString(),
            analysisType,
          },
          error: 'AI analysis timed out — please try again or upload without analysis',
        }), OUTER_TIMEOUT_MS)
      ),
    ]);

    if (!result.success) {
      const errorMsg = result.error || 'Analysis failed';
      // If it's a timeout or rate limit error, return 504-compatible response
      if (errorMsg.includes('timed out') || errorMsg.includes('busy') || errorMsg.includes('rate limit')) {
        return NextResponse.json(
          { success: false, error: 'AI analysis is taking too long. Please try again.', code: 'TIMEOUT' },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 500 }
      );
    }

    const analysisResult = result.analysis;
    const confidence = (analysisResult.confidence as number) ||
                       (analysisResult.overallConfidence as number) || 0.75;

    const timestamp = new Date().toISOString();
    const provenance = {
      source: 'ai-vlm',
      model: MODEL_NAME,
      timestamp,
      analysisType,
      confidence,
    };

    // Step 5: Return response IMMEDIATELY to the client
    // DB writes happen in background (non-blocking)
    const clientResponse = NextResponse.json({
      success: true,
      analysis: analysisResult,
      provenance,
      confidence,
    });

    // Step 6: Background DB writes (fire-and-forget, non-blocking)
    // This runs AFTER we've sent the response to the client
    storeAnalysisResults(supabase, user.id, analysisType, analysisResult, confidence, timestamp, locale).catch(err => {
      console.error('[analyze-photo] Background DB write failed:', err);
    });

    return clientResponse;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Photo analysis error:', msg);
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    // Check for timeout errors
    if (msg.includes('timed out') || msg.includes('timeout')) {
      return NextResponse.json(
        { success: false, error: 'AI analysis timed out. Please try with a smaller image.', code: 'TIMEOUT' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

/**
 * Store analysis results in the database (runs in background after response is sent)
 * This is fire-and-forget — failures are logged but don't affect the user
 */
async function storeAnalysisResults(
  supabase: any,
  userId: string,
  analysisType: PhotoAnalysisType,
  analysisResult: Record<string, unknown>,
  confidence: number,
  timestamp: string,
  locale: string,
) {
  try {
    // ─── Body Composition → body_metrics ───────────────────────
    if (analysisType === 'body-composition') {
      const bodyFat = analysisResult.bodyFatEstimate as Record<string, unknown>;
      const muscleMass = analysisResult.muscleMassEstimate as Record<string, unknown>;
      const weight = analysisResult.weightEstimate as Record<string, unknown>;

      const metrics = [];

      if (bodyFat?.value) {
        metrics.push({
          user_id: userId,
          metric_type: 'body_fat',
          value: bodyFat.value,
          unit: '%',
          source: 'photo_analysis',
          confidence: bodyFat.confidence || confidence,
          captured_at: timestamp,
        });
      }

      if (weight?.value) {
        metrics.push({
          user_id: userId,
          metric_type: 'weight',
          value: weight.value,
          unit: 'kg',
          source: 'photo_analysis',
          confidence: weight.confidence || confidence,
          captured_at: timestamp,
        });
      }

      if (metrics.length > 0) {
        await supabase.from('body_metrics').insert(metrics);
      }

      if ((analysisResult.recommendations as string[])?.length > 0) {
        await supabase.from('ai_insights').insert({
          user_id: userId,
          insight_type: 'nutrition',
          title: 'Body Composition Analysis',
          content: (analysisResult.analysisNotes as string) || 'Photo analysis completed',
          confidence,
          actionable: true,
          actions: (analysisResult.recommendations as string[]).map(r => ({ action: r })),
          locale,
          translations: {
            en: (analysisResult.analysisNotes as string) || '',
            fr: '',
            ar: '',
          },
        });
      }
    }

    // ─── Meal Analysis → food_logs ──────────
    if (analysisType === 'meal' && (analysisResult.foods as Array<unknown>)?.length > 0) {
      const foods = analysisResult.foods as Array<Record<string, unknown>>;
      const foodRows = foods
        .filter(food => food.name && food.calories)
        .map(food => ({
          user_id: userId,
          food_name: food.name as string,
          quantity: (food.estimatedPortion as string) || '1 serving',
          calories: food.calories as number,
          protein: (food.protein as number) || 0,
          carbs: (food.carbs as number) || 0,
          fat: (food.fat as number) || 0,
          meal_type: analysisResult.mealType || 'snack',
          source: 'photo_analysis',
          logged_at: timestamp,
        }));
      if (foodRows.length > 0) {
        await supabase.from('food_logs').insert(foodRows);
      }
    }

    // ─── Food Label → foods table ───────────────────────────────
    if (analysisType === 'food-label' && analysisResult.productName) {
      await supabase.from('foods').insert({
        user_id: userId,
        name: analysisResult.productName as string,
        brand: (analysisResult.brand as string) || null,
        calories: (analysisResult.calories as number) || 0,
        protein: (analysisResult.protein as number) || 0,
        carbs: (analysisResult.carbs as number) || 0,
        fat: (analysisResult.fat as number) || 0,
        fiber: (analysisResult.fiber as number) || null,
        sugar: (analysisResult.sugar as number) || null,
        sodium: (analysisResult.sodium as number) || null,
        serving_size: (analysisResult.servingSize as number) || 100,
        serving_unit: (analysisResult.servingUnit as string) || 'g',
        source: 'photo_label_scan',
        verified: false,
      });
    }

    // ─── Training Signal (fire-and-forget) ─────────────────────
    await supabase.from('ai_training_signals').insert({
      user_id: userId,
      signal_type: 'photo_analysis',
      signal_data: {
        analysis_type: analysisType,
        confidence,
        foods_detected: (analysisResult.foods as Array<unknown>)?.length || 0,
        recommendations_count: (analysisResult.recommendations as string[])?.length || 0,
      },
      strength: confidence * 0.5,
    });
  } catch (err) {
    // Non-critical — just log
    console.error('[analyze-photo] Background storage error:', err instanceof Error ? err.message : err);
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/analyze-photo - API Documentation
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  return NextResponse.json({
    endpoint: 'Photo Analysis API',
    provider: 'AI',
    features: [
      'Multi-language support (EN, FR, AR)',
      'Automatic storage to database tables',
      'Training signals for adaptive learning',
      'Confidence metrics',
    ],
    analysisTypes: [
      {
        type: 'body-composition',
        description: 'Analyze body composition from progress photos',
        returns: ['bodyFatEstimate', 'muscleMassEstimate', 'weightEstimate', 'recommendations'],
        storage: 'body_metrics, ai_insights',
      },
      {
        type: 'meal',
        description: 'Identify foods and estimate nutrition from meal photos',
        returns: ['foods', 'totalCalories', 'totalProtein', 'healthScore'],
        storage: 'food_logs',
      },
      {
        type: 'food-label',
        description: 'Extract nutrition information from food labels',
        returns: ['productName', 'calories', 'protein', 'ingredients', 'allergens'],
        storage: 'foods',
      },
      {
        type: 'progress-photo',
        description: 'Track fitness progress from photos',
        returns: ['estimatedBodyFat', 'muscleDefinition', 'progressIndicators'],
        storage: 'body_metrics, ai_insights',
      },
    ],
    usage: {
      method: 'POST',
      body: {
        imageUrl: 'string (optional) - URL to the image',
        imageBase64: 'string (optional) - Base64 encoded image',
        mimeType: 'string (optional, default: image/jpeg)',
        analysisType: 'string (default: body-composition)',
        locale: 'string (default: en) - en, fr, or ar',
      },
    },
  });
}
