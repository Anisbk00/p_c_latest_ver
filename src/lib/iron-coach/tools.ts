/**
 * Iron Coach Deterministic Tools
 * 
 * These tools provide validated, traceable calculations that the LLM can reference.
 * All numeric outputs include provenance (formula used) and confidence scores.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ToolResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  provenance: {
    tool: string;
    formula: string;
    calculatedAt: string;
    modelVersion: string;
    deterministic: boolean;
  };
}

export interface CalorieCalcParams {
  weightKg: number;
  durationMin: number;
  activityType?: string;
  met?: number;
  avgHr?: number;
}

export interface TDEECalcParams {
  weightKg: number;
  heightCm?: number;
  age?: number;
  biologicalSex?: string;
  activityLevel?: string;
}

export interface MacroCalcParams {
  targetCalories: number;
  goal?: 'fat_loss' | 'muscle_gain' | 'maintenance' | 'recomposition';
  bodyweightKg?: number;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MODEL_VERSION = 'iron-coach-tools-v1.0';

// MET values for common activities
const MET_VALUES: Record<string, number> = {
  running: 9.8,
  jogging: 7.0,
  cycling: 6.8,
  swimming: 8.0,
  walking: 3.5,
  hiking: 6.0,
  weightlifting: 5.0,
  yoga: 2.5,
  hiit: 8.5,
  rowing: 7.0,
  dancing: 5.0,
  other: 5.0
};

// Activity multipliers for TDEE
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

// ═══════════════════════════════════════════════════════════════
// Tool: Calorie Calculator
// ═══════════════════════════════════════════════════════════════

export function calcCalories(params: CalorieCalcParams): ToolResult<{
  caloriesKcal: number;
  method: string;
  confidence: number;
  breakdown: {
    metCalories: number;
    hrCalories?: number;
  };
}> {
  const { weightKg, durationMin, activityType = 'other', met, avgHr } = params;

  // Validate inputs
  if (!weightKg || weightKg <= 0 || !durationMin || durationMin <= 0) {
    return {
      success: false,
      error: 'Invalid weight or duration',
      provenance: {
        tool: 'calc_calories',
        formula: 'validation_failed',
        calculatedAt: new Date().toISOString(),
        modelVersion: MODEL_VERSION,
        deterministic: true
      }
    };
  }

  // Get MET value
  const metValue = met || MET_VALUES[activityType.toLowerCase()] || MET_VALUES.other;

  // MET-based calculation: Calories = MET × weight (kg) × duration (hours)
  const metCalories = (metValue * weightKg * durationMin) / 60;

  // Heart rate based if available (Keytel formula approximation)
  let hrCalories: number | undefined;
  let confidence = 0.70;
  let method = 'MET-based';

  if (avgHr && avgHr > 60 && avgHr < 220) {
    // Simplified Keytel formula
    hrCalories = ((avgHr * 0.634) + (weightKg * 0.404) - 26.7) * durationMin / 4.184;
    confidence = 0.85;
    method = 'MET + HR average';
  }

  // Final calories (average of both methods if HR available)
  const finalCalories = hrCalories 
    ? (metCalories + hrCalories) / 2 
    : metCalories;

  return {
    success: true,
    result: {
      caloriesKcal: Math.round(finalCalories),
      method,
      confidence,
      breakdown: {
        metCalories: Math.round(metCalories),
        hrCalories: hrCalories ? Math.round(hrCalories) : undefined
      }
    },
    provenance: {
      tool: 'calc_calories',
      formula: hrCalories ? 'MET × weight × duration / 60 + Keytel HR formula' : 'MET × weight × duration / 60',
      calculatedAt: new Date().toISOString(),
      modelVersion: MODEL_VERSION,
      deterministic: true
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Tool: TDEE Calculator
// ═══════════════════════════════════════════════════════════════

export function calcTDEE(params: TDEECalcParams): ToolResult<{
  tdeeKcal: number;
  bmrKcal: number;
  activityMultiplier: number;
  formula: string;
}> {
  const { weightKg, heightCm = 170, age = 30, biologicalSex = 'male', activityLevel = 'moderate' } = params;

  // Validate
  if (!weightKg || weightKg <= 0) {
    return {
      success: false,
      error: 'Invalid weight',
      provenance: {
        tool: 'calc_tdee',
        formula: 'validation_failed',
        calculatedAt: new Date().toISOString(),
        modelVersion: MODEL_VERSION,
        deterministic: true
      }
    };
  }

  // Mifflin-St Jeor BMR equation
  const sexModifier = biologicalSex.toLowerCase() === 'male' ? 5 : -161;
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexModifier;

  // Get activity multiplier
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel.toLowerCase().replace(' ', '_')] || ACTIVITY_MULTIPLIERS.moderate;
  
  // TDEE = BMR × activity multiplier
  const tdee = bmr * multiplier;

  return {
    success: true,
    result: {
      tdeeKcal: Math.round(tdee),
      bmrKcal: Math.round(bmr),
      activityMultiplier: multiplier,
      formula: 'Mifflin-St Jeor'
    },
    provenance: {
      tool: 'calc_tdee',
      formula: `(10 × weight) + (6.25 × height) - (5 × age) + ${sexModifier}, then × ${multiplier}`,
      calculatedAt: new Date().toISOString(),
      modelVersion: MODEL_VERSION,
      deterministic: true
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Tool: Macro Calculator
// ═══════════════════════════════════════════════════════════════

export function calcMacros(params: MacroCalcParams): ToolResult<{
  protein: { grams: number; calories: number; percent: number };
  carbs: { grams: number; calories: number; percent: number };
  fat: { grams: number; calories: number; percent: number };
  goal: string;
}> {
  const { targetCalories, goal = 'maintenance', bodyweightKg } = params;

  // Validate
  if (!targetCalories || targetCalories <= 0) {
    return {
      success: false,
      error: 'Invalid calorie target',
      provenance: {
        tool: 'calc_macros',
        formula: 'validation_failed',
        calculatedAt: new Date().toISOString(),
        modelVersion: MODEL_VERSION,
        deterministic: true
      }
    };
  }

  // Macro ratios by goal
  const macroRatios: Record<string, { protein: number; carbs: number; fat: number }> = {
    fat_loss: { protein: 0.35, carbs: 0.35, fat: 0.30 },
    muscle_gain: { protein: 0.30, carbs: 0.45, fat: 0.25 },
    maintenance: { protein: 0.30, carbs: 0.40, fat: 0.30 },
    recomposition: { protein: 0.35, carbs: 0.35, fat: 0.30 }
  };

  const ratios = macroRatios[goal] || macroRatios.maintenance;

  // Calculate macros
  const proteinGrams = Math.round((targetCalories * ratios.protein) / 4);
  const carbsGrams = Math.round((targetCalories * ratios.carbs) / 4);
  const fatGrams = Math.round((targetCalories * ratios.fat) / 9);

  // Override protein with bodyweight-based calculation if available
  const finalProtein = bodyweightKg 
    ? Math.round(Math.max(proteinGrams, bodyweightKg * 2)) // At least 2g per kg
    : proteinGrams;

  return {
    success: true,
    result: {
      protein: {
        grams: finalProtein,
        calories: finalProtein * 4,
        percent: Math.round((finalProtein * 4 / targetCalories) * 100)
      },
      carbs: {
        grams: carbsGrams,
        calories: carbsGrams * 4,
        percent: Math.round((carbsGrams * 4 / targetCalories) * 100)
      },
      fat: {
        grams: fatGrams,
        calories: fatGrams * 9,
        percent: Math.round((fatGrams * 9 / targetCalories) * 100)
      },
      goal
    },
    provenance: {
      tool: 'calc_macros',
      formula: `Goal-based ratio: P${ratios.protein * 100}%/C${ratios.carbs * 100}%/F${ratios.fat * 100}%`,
      calculatedAt: new Date().toISOString(),
      modelVersion: MODEL_VERSION,
      deterministic: true
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Tool: Pace Calculator
// ═══════════════════════════════════════════════════════════════

export function calcPace(params: { distanceKm: number; durationMin: number }): ToolResult<{
  paceMinPerKm: number;
  speedKmh: number;
  paceFormatted: string;
}> {
  const { distanceKm, durationMin } = params;

  if (!distanceKm || distanceKm <= 0 || !durationMin || durationMin <= 0) {
    return {
      success: false,
      error: 'Invalid distance or duration',
      provenance: {
        tool: 'calc_pace',
        formula: 'validation_failed',
        calculatedAt: new Date().toISOString(),
        modelVersion: MODEL_VERSION,
        deterministic: true
      }
    };
  }

  const paceMinPerKm = durationMin / distanceKm;
  const speedKmh = distanceKm / (durationMin / 60);

  // Format pace as MM:SS
  const paceMin = Math.floor(paceMinPerKm);
  const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
  const paceFormatted = `${paceMin}:${paceSec.toString().padStart(2, '0')}/km`;

  return {
    success: true,
    result: {
      paceMinPerKm: Math.round(paceMinPerKm * 100) / 100,
      speedKmh: Math.round(speedKmh * 10) / 10,
      paceFormatted
    },
    provenance: {
      tool: 'calc_pace',
      formula: 'duration (min) / distance (km)',
      calculatedAt: new Date().toISOString(),
      modelVersion: MODEL_VERSION,
      deterministic: true
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Tool: Summarize Nutrition
// ═══════════════════════════════════════════════════════════════

export function summarizeNutrition(entries: Array<{
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}>): ToolResult<{
  total: { calories: number; protein: number; carbs: number; fat: number };
  average: { calories: number; protein: number; carbs: number; fat: number };
  entriesCount: number;
}> {
  if (!entries || entries.length === 0) {
    return {
      success: false,
      error: 'No entries provided',
      provenance: {
        tool: 'summarize_nutrition',
        formula: 'validation_failed',
        calculatedAt: new Date().toISOString(),
        modelVersion: MODEL_VERSION,
        deterministic: true
      }
    };
  }

  const total = entries.reduce((acc, e) => ({
    calories: acc.calories + (e.calories || 0),
    protein: acc.protein + (e.protein || 0),
    carbs: acc.carbs + (e.carbs || 0),
    fat: acc.fat + (e.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const count = entries.length;

  return {
    success: true,
    result: {
      total: {
        calories: Math.round(total.calories),
        protein: Math.round(total.protein),
        carbs: Math.round(total.carbs),
        fat: Math.round(total.fat)
      },
      average: {
        calories: Math.round(total.calories / count),
        protein: Math.round(total.protein / count),
        carbs: Math.round(total.carbs / count),
        fat: Math.round(total.fat / count)
      },
      entriesCount: count
    },
    provenance: {
      tool: 'summarize_nutrition',
      formula: 'sum(values) / count',
      calculatedAt: new Date().toISOString(),
      modelVersion: MODEL_VERSION,
      deterministic: true
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Tool Router
// ═══════════════════════════════════════════════════════════════

export async function executeTool(toolName: string, params: unknown): Promise<ToolResult> {
  switch (toolName) {
    case 'calc_calories':
      return calcCalories(params as CalorieCalcParams);
    case 'calc_tdee':
      return calcTDEE(params as TDEECalcParams);
    case 'calc_macros':
      return calcMacros(params as MacroCalcParams);
    case 'calc_pace':
      return calcPace(params as { distanceKm: number; durationMin: number });
    case 'summarize_nutrition':
      return summarizeNutrition(params as Array<{ calories: number; protein: number; carbs: number; fat: number }>);
    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        provenance: {
          tool: toolName,
          formula: 'unknown',
          calculatedAt: new Date().toISOString(),
          modelVersion: MODEL_VERSION,
          deterministic: false
        }
      };
  }
}
