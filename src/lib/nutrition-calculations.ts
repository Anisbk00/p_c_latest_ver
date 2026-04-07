// ═══════════════════════════════════════════════════════════════
// Centralized Nutrition Calculations
// Pure utility functions for macro math, calorie validation,
// serving scaling, and aggregation.
// ═══════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────

export interface NutritionValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroPercentages {
  protein: number; // percentage 0-100
  carbs: number;
  fat: number;
}

export interface MacroValidationResult {
  isValid: boolean;
  expectedCalories: number;
  difference: number;
  differencePercent: number;
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Coerces a value to a finite number.
 * NaN, undefined, null, Infinity, and -Infinity all fall back to `fallback`.
 */
function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Calculates total calories from macronutrient grams.
 *
 * Standard Atwater conversion factors:
 *  - Protein: 4 kcal/g
 *  - Carbs:   4 kcal/g
 *  - Fat:     9 kcal/g
 */
export function calculateCaloriesFromMacros(
  protein: number,
  carbs: number,
  fat: number,
): number {
  return Math.round(toFiniteNumber(protein) * 4 + toFiniteNumber(carbs) * 4 + toFiniteNumber(fat) * 9);
}

/**
 * Validates whether a declared calorie count is consistent with the
 * provided macros within a given tolerance percentage.
 *
 * @returns An object with the validation result and the raw delta values.
 */
export function validateMacroCalorieBalance(
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  tolerancePercent: number = 0.20,
): MacroValidationResult {
  const safeCalories = toFiniteNumber(calories);
  const expectedCalories = calculateCaloriesFromMacros(protein, carbs, fat);
  const difference = Math.abs(safeCalories - expectedCalories);

  const differencePercent =
    safeCalories === 0
      ? difference === 0
        ? 0
        : 100
      : (difference / Math.abs(safeCalories)) * 100;

  return {
    isValid: differencePercent <= toFiniteNumber(tolerancePercent),
    expectedCalories,
    difference,
    differencePercent: Math.round(differencePercent * 100) / 100,
  };
}

/**
 * Scales nutrition values from "per 100 g" to an arbitrary serving size.
 *
 * Each numeric field is rounded to 1 decimal place.
 */
export function calculateServingNutrition(
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  },
  servingGrams: number,
): NutritionValues {
  const scale = toFiniteNumber(servingGrams) / 100;

  const round1 = (value: number): number =>
    Math.round(toFiniteNumber(value) * scale * 10) / 10;

  return {
    calories: round1(per100g.calories),
    protein: round1(per100g.protein),
    carbs: round1(per100g.carbs),
    fat: round1(per100g.fat),
  };
}

/**
 * Sums an array of partial nutrition entries into exact totals.
 *
 * Every field is treated as optional; missing / NaN / Infinity values
 * default to 0 via the `toFiniteNumber` pattern.
 */
export function sumNutritionTotals(
  entries: ReadonlyArray<{
    calories?: unknown;
    protein?: unknown;
    carbs?: unknown;
    fat?: unknown;
  }>,
): NutritionValues {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;

  for (const entry of entries) {
    calories += toFiniteNumber(entry.calories);
    protein += toFiniteNumber(entry.protein);
    carbs += toFiniteNumber(entry.carbs);
    fat += toFiniteNumber(entry.fat);
  }

  return {
    calories: Math.round(calories * 100) / 100,
    protein: Math.round(protein * 100) / 100,
    carbs: Math.round(carbs * 100) / 100,
    fat: Math.round(fat * 100) / 100,
  };
}

/**
 * Returns the percentage of total calories contributed by each macronutrient.
 *
 * Percentages are derived from the *macro-calculated* calories
 * (4 kcal/g for protein & carbs, 9 kcal/g for fat), so the three
 * values always sum to 100 (or 0 when there are no macros).
 *
 * Handles division-by-zero gracefully — returns all zeros when total
 * macro-derived calories are 0.
 */
export function calculateMacroPercentages(
  _calories: number,
  protein: number,
  carbs: number,
  fat: number,
): MacroPercentages {
  const safeProtein = toFiniteNumber(protein);
  const safeCarbs = toFiniteNumber(carbs);
  const safeFat = toFiniteNumber(fat);

  const proteinCal = safeProtein * 4;
  const carbsCal = safeCarbs * 4;
  const fatCal = safeFat * 9;

  const totalMacroCal = proteinCal + carbsCal + fatCal;

  if (totalMacroCal === 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  const round2 = (value: number): number =>
    Math.round((value / totalMacroCal) * 100 * 100) / 100;

  return {
    protein: round2(proteinCal),
    carbs: round2(carbsCal),
    fat: round2(fatCal),
  };
}
