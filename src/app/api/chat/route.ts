import { NextRequest, NextResponse } from "next/server";
import { generateIronCoachResponse } from "@/lib/ai/comprehensive-ai-service";
import { getSupabaseUser } from "@/lib/supabase/supabase-data";

// ═══════════════════════════════════════════════════════════════
// LLM Numeric Validation Guardrails
// ═══════════════════════════════════════════════════════════════

/**
 * Reasonable bounds for fitness-related metrics to prevent hallucinated numbers
 */
const FITNESS_BOUNDS = {
  weight: { min: 30, max: 300, unit: 'kg' },
  weightLoss: { min: 0, max: 2, unit: 'kg/week' },
  weightGain: { min: 0, max: 1, unit: 'kg/week' },
  bodyFat: { min: 3, max: 50, unit: '%' },
  calories: { min: 1000, max: 5000, unit: 'kcal' },
  protein: { min: 20, max: 400, unit: 'g' },
  carbs: { min: 20, max: 800, unit: 'g' },
  fat: { min: 10, max: 200, unit: 'g' },
  water: { min: 1, max: 8, unit: 'L' },
  sleep: { min: 4, max: 12, unit: 'hours' },
  heartRate: { min: 40, max: 220, unit: 'bpm' },
  workoutDuration: { min: 5, max: 300, unit: 'minutes' },
  sets: { min: 1, max: 50, unit: 'sets' },
  reps: { min: 1, max: 100, unit: 'reps' },
  weightLifted: { min: 1, max: 500, unit: 'kg' },
};

/**
 * Validate a numeric value against expected bounds
 */
function validateNumericValue(value: number, type: keyof typeof FITNESS_BOUNDS): { 
  valid: boolean; 
  value: number; 
  warning?: string;
} {
  const bounds = FITNESS_BOUNDS[type];
  if (!bounds) {
    return { valid: true, value };
  }

  if (value < bounds.min || value > bounds.max) {
    const warning = `Value ${value} ${bounds.unit} for ${type} seems unrealistic (expected ${bounds.min}-${bounds.max} ${bounds.unit}). This may be an AI estimation error.`;
    const clampedValue = Math.max(bounds.min, Math.min(bounds.max, value));
    return { valid: false, value: clampedValue, warning };
  }

  return { valid: true, value };
}

/**
 * Extract and validate numbers from response
 */
function validateNumbersInResponse(content: string): { 
  content: string; 
  warnings: string[];
  flaggedNumbers: Array<{ original: number; type: string; warning?: string }>;
} {
  const warnings: string[] = [];
  const flaggedNumbers: Array<{ original: number; type: string; warning?: string }> = [];

  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)/gi, type: 'weight' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:body\s*fat|bf)/gi, type: 'bodyFat' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:kcal|calories?)/gi, type: 'calories' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s*)?(?:protein|proteins)/gi, type: 'protein' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s*)?(?:carbs|carbohydrates)/gi, type: 'carbs' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s*)?(?:fat|fats)/gi, type: 'fat' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/gi, type: 'sleep' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:bpm|beats?\s*per\s*minute)/gi, type: 'heartRate' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\s*(?:workout|exercise|training)/gi, type: 'workoutDuration' as const },
  ];

  const validatedContent = content;

  for (const { regex, type } of patterns) {
    const matches = content.matchAll(regex);
    for (const match of matches) {
      const numValue = parseFloat(match[1]);
      if (!isNaN(numValue)) {
        const validation = validateNumericValue(numValue, type);
        if (!validation.valid) {
          warnings.push(validation.warning!);
          flaggedNumbers.push({ original: numValue, type, warning: validation.warning });
        }
      }
    }
  }

  return { content: validatedContent, warnings, flaggedNumbers };
}

// ═══════════════════════════════════════════════════════════════
// AI Coach Chat API — Using Groq (llama-3.3-70b-versatile)
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const { user } = await getSupabaseUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      message, 
      // SECURITY: Ignore userId from body - always use authenticated user
      coachingTone = "supportive",
      locale = "en",
      context = {}
    } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // SECURITY: Always use the authenticated user's ID, never trust client-provided userId
    const authenticatedUserId = user.id;

    // Use the AI-powered Iron Coach via Groq
    const coachResponse = await generateIronCoachResponse(
      authenticatedUserId,
      message,
      {
        locale: locale as 'en' | 'fr' | 'ar',
      }
    );

    // Validate numbers in the response
    const validation = validateNumbersInResponse(coachResponse.content);

    const result = {
      message: coachResponse.content,
      reply: coachResponse.content,
      confidence: coachResponse.confidence,
      messageId: coachResponse.messageId,
      sessionId: coachResponse.conversationId,
      translations: coachResponse.translations,
      provenance: {
        source: "ai-llm",
        modelName: "Iron Coach AI",
        timestamp: new Date().toISOString(),
        coachingTone,
        contextUsed: Object.keys(context).length > 0,
        deterministic: false,
        locale,
      },
      ...(validation.warnings.length > 0 && {
        validationWarnings: validation.warnings,
        flaggedNumbers: validation.flaggedNumbers
      })
    };

    return NextResponse.json({
      success: true,
      ...result
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error("Chat error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Chat failed" 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "AI Coach Chat API",
    engine: "Iron Coach AI",
    provider: "AI",
    coachingTones: ["strict", "supportive", "minimal"],
    languages: ["en", "fr", "ar"],
    usage: "POST with { message: string, coachingTone?: string, locale?: string, context?: object } - Authentication required"
  });
}
