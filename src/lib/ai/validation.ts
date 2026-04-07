/**
 * AI Response Validation
 * 
 * Numeric bounds validation for AI-generated content.
 * Prevents LLM from returning unrealistic or dangerous values.
 * 
 * @module lib/ai/validation
 */

// ═══════════════════════════════════════════════════════════════
// Types & Constants
// ═══════════════════════════════════════════════════════════════

export interface NumericBounds {
  min: number;
  max: number;
  default: number;
}

/**
 * Bounds for workout-related numeric values
 */
export const WORKOUT_BOUNDS = {
  sets: { min: 1, max: 10, default: 3 },
  reps: { min: 1, max: 100, default: 10 },
  rest_seconds: { min: 0, max: 600, default: 60 },
  duration_minutes: { min: 5, max: 300, default: 45 },
  calories_burned: { min: 0, max: 5000, default: 0 },
  weight_kg: { min: 0, max: 500, default: 0 },
  weight_lbs: { min: 0, max: 1000, default: 0 },
  distance_km: { min: 0, max: 200, default: 0 },
  distance_miles: { min: 0, max: 125, default: 0 },
  heart_rate: { min: 40, max: 220, default: 120 },
  intensity: { min: 1, max: 10, default: 5 },
} as const;

/**
 * Bounds for meal/nutrition-related numeric values
 */
export const MEAL_BOUNDS = {
  calories: { min: 0, max: 5000, default: 500 },
  protein: { min: 0, max: 200, default: 30 },
  carbs: { min: 0, max: 500, default: 50 },
  fat: { min: 0, max: 200, default: 20 },
  fiber: { min: 0, max: 100, default: 5 },
  sugar: { min: 0, max: 200, default: 10 },
  sodium: { min: 0, max: 10000, default: 500 },
  health_score: { min: 0, max: 100, default: 70 },
  portion_grams: { min: 1, max: 2000, default: 100 },
} as const;

/**
 * Bounds for body metrics
 */
export const BODY_METRICS_BOUNDS = {
  weight_kg: { min: 20, max: 300, default: 70 },
  weight_lbs: { min: 45, max: 660, default: 154 },
  height_cm: { min: 100, max: 250, default: 170 },
  height_in: { min: 40, max: 100, default: 67 },
  body_fat_pct: { min: 3, max: 50, default: 20 },
  muscle_mass_kg: { min: 10, max: 100, default: 35 },
  bmi: { min: 10, max: 50, default: 22 },
} as const;

/**
 * Bounds for goals and targets
 */
export const GOAL_BOUNDS = {
  target_weight_kg: { min: 30, max: 250, default: 70 },
  target_calories: { min: 1000, max: 6000, default: 2000 },
  target_protein: { min: 20, max: 300, default: 120 },
  target_water_ml: { min: 500, max: 6000, default: 2500 },
  target_workouts_per_week: { min: 1, max: 14, default: 4 },
  target_sleep_hours: { min: 4, max: 12, default: 8 },
} as const;

// ═══════════════════════════════════════════════════════════════
// Validation Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Clamp a value to bounds, returning default if invalid
 */
export function clampToBounds(value: unknown, bounds: NumericBounds): number {
  if (value === null || value === undefined) {
    return bounds.default;
  }
  
  const num = Number(value);
  
  // Check for NaN or Infinity
  if (!Number.isFinite(num)) {
    return bounds.default;
  }
  
  // Clamp to min/max
  return Math.max(bounds.min, Math.min(bounds.max, num));
}

/**
 * Validate that a value is a positive number within bounds
 */
export function isValidNumber(value: unknown, bounds: NumericBounds): boolean {
  if (value === null || value === undefined) return false;
  const num = Number(value);
  if (!Number.isFinite(num)) return false;
  return num >= bounds.min && num <= bounds.max;
}

/**
 * Validate and sanitize a numeric value
 * Returns the clamped value and whether it was modified
 */
export function sanitizeNumber(value: unknown, bounds: NumericBounds): {
  value: number;
  wasValid: boolean;
  wasClamped: boolean;
} {
  if (value === null || value === undefined) {
    return { value: bounds.default, wasValid: false, wasClamped: false };
  }
  
  const num = Number(value);
  
  if (!Number.isFinite(num)) {
    return { value: bounds.default, wasValid: false, wasClamped: false };
  }
  
  const clamped = Math.max(bounds.min, Math.min(bounds.max, num));
  const wasClamped = clamped !== num;
  
  return {
    value: clamped,
    wasValid: !wasClamped,
    wasClamped,
  };
}

// ═══════════════════════════════════════════════════════════════
// Object Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Validate exercise data in a workout
 */
export function validateExercise(exercise: Record<string, unknown>): Record<string, unknown> {
  return {
    ...exercise,
    sets: clampToBounds(exercise.sets, WORKOUT_BOUNDS.sets),
    reps: clampToBounds(exercise.reps, WORKOUT_BOUNDS.reps),
    rest_seconds: clampToBounds(exercise.rest_seconds, WORKOUT_BOUNDS.rest_seconds),
    weight_kg: exercise.weight_kg !== undefined 
      ? clampToBounds(exercise.weight_kg, WORKOUT_BOUNDS.weight_kg) 
      : undefined,
    weight_lbs: exercise.weight_lbs !== undefined 
      ? clampToBounds(exercise.weight_lbs, WORKOUT_BOUNDS.weight_lbs) 
      : undefined,
  };
}

/**
 * Validate complete workout data from AI
 */
export function validateWorkoutData(data: Record<string, unknown>): Record<string, unknown> {
  const exercises = Array.isArray(data.exercises) 
    ? data.exercises.map((e: any) => validateExercise(typeof e === 'object' && e !== null ? e : {}))
    : [];
  
  return {
    ...data,
    exercises,
    duration_minutes: clampToBounds(data.duration_minutes, WORKOUT_BOUNDS.duration_minutes),
    calories_burned: clampToBounds(data.calories_burned, WORKOUT_BOUNDS.calories_burned),
    intensity: clampToBounds(data.intensity, WORKOUT_BOUNDS.intensity),
  };
}

/**
 * Validate food item in a meal
 */
export function validateFoodItem(food: Record<string, unknown>): Record<string, unknown> {
  return {
    ...food,
    calories: clampToBounds(food.calories, MEAL_BOUNDS.calories),
    protein: clampToBounds(food.protein, MEAL_BOUNDS.protein),
    carbs: clampToBounds(food.carbs, MEAL_BOUNDS.carbs),
    fat: clampToBounds(food.fat, MEAL_BOUNDS.fat),
    fiber: food.fiber !== undefined ? clampToBounds(food.fiber, MEAL_BOUNDS.fiber) : undefined,
    sugar: food.sugar !== undefined ? clampToBounds(food.sugar, MEAL_BOUNDS.sugar) : undefined,
    portion_grams: food.portion_grams !== undefined 
      ? clampToBounds(food.portion_grams, MEAL_BOUNDS.portion_grams) 
      : undefined,
  };
}

/**
 * Validate complete meal data from AI
 */
export function validateMealData(data: Record<string, unknown>): Record<string, unknown> {
  const foods = Array.isArray(data.foods)
    ? data.foods.map((f: any) => validateFoodItem(typeof f === 'object' && f !== null ? f : {}))
    : [];
  
  return {
    ...data,
    foods,
    total_calories: clampToBounds(data.total_calories ?? data.calories, MEAL_BOUNDS.calories),
    total_protein: clampToBounds(data.total_protein ?? data.protein, MEAL_BOUNDS.protein),
    total_carbs: clampToBounds(data.total_carbs ?? data.carbs, MEAL_BOUNDS.carbs),
    total_fat: clampToBounds(data.total_fat ?? data.fat, MEAL_BOUNDS.fat),
    health_score: clampToBounds(data.health_score, MEAL_BOUNDS.health_score),
  };
}

/**
 * Validate body metrics from AI
 */
export function validateBodyMetrics(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    weight_kg: data.weight_kg !== undefined 
      ? clampToBounds(data.weight_kg, BODY_METRICS_BOUNDS.weight_kg) 
      : undefined,
    weight_lbs: data.weight_lbs !== undefined 
      ? clampToBounds(data.weight_lbs, BODY_METRICS_BOUNDS.weight_lbs) 
      : undefined,
    body_fat_pct: data.body_fat_pct !== undefined 
      ? clampToBounds(data.body_fat_pct, BODY_METRICS_BOUNDS.body_fat_pct) 
      : undefined,
    muscle_mass_kg: data.muscle_mass_kg !== undefined 
      ? clampToBounds(data.muscle_mass_kg, BODY_METRICS_BOUNDS.muscle_mass_kg) 
      : undefined,
    bmi: data.bmi !== undefined 
      ? clampToBounds(data.bmi, BODY_METRICS_BOUNDS.bmi) 
      : undefined,
  };
}

/**
 * Validate goal data from AI
 */
export function validateGoalData(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    target_weight_kg: data.target_weight_kg !== undefined 
      ? clampToBounds(data.target_weight_kg, GOAL_BOUNDS.target_weight_kg) 
      : undefined,
    target_calories: data.target_calories !== undefined 
      ? clampToBounds(data.target_calories, GOAL_BOUNDS.target_calories) 
      : undefined,
    target_protein: data.target_protein !== undefined 
      ? clampToBounds(data.target_protein, GOAL_BOUNDS.target_protein) 
      : undefined,
    target_water_ml: data.target_water_ml !== undefined 
      ? clampToBounds(data.target_water_ml, GOAL_BOUNDS.target_water_ml) 
      : undefined,
    target_workouts_per_week: data.target_workouts_per_week !== undefined 
      ? clampToBounds(data.target_workouts_per_week, GOAL_BOUNDS.target_workouts_per_week) 
      : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// Generic AI Response Validator
// ═══════════════════════════════════════════════════════════════

export type AIResponseType = 'workout' | 'meal' | 'body_metrics' | 'goal' | 'unknown';

/**
 * Auto-detect response type and validate accordingly
 */
export function validateAIResponse(
  data: Record<string, unknown>,
  responseType?: AIResponseType
): Record<string, unknown> {
  // Auto-detect type if not provided
  if (!responseType) {
    if (Array.isArray(data.exercises)) {
      responseType = 'workout';
    } else if (Array.isArray(data.foods)) {
      responseType = 'meal';
    } else if ('weight_kg' in data || 'body_fat_pct' in data) {
      responseType = 'body_metrics';
    } else if ('target_weight_kg' in data || 'target_calories' in data) {
      responseType = 'goal';
    } else {
      responseType = 'unknown';
    }
  }

  switch (responseType) {
    case 'workout':
      return validateWorkoutData(data);
    case 'meal':
      return validateMealData(data);
    case 'body_metrics':
      return validateBodyMetrics(data);
    case 'goal':
      return validateGoalData(data);
    default:
      return data;
  }
}

/**
 * Validate JSON string from AI response
 * Returns parsed and validated data
 */
export function validateAIJsonResponse(
  jsonString: string,
  responseType?: AIResponseType
): Record<string, unknown> {
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { raw: jsonString, parseError: true };
  }
  
  if (typeof data !== 'object' || data === null) {
    return { raw: jsonString, parseError: true };
  }
  
  return validateAIResponse(data, responseType);
}
