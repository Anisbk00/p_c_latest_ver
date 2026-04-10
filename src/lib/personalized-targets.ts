/**
 * Personalized Target Calculations for Progress Companion
 * 
 * Uses scientifically-backed formulas to calculate personalized nutrition
 * and fitness targets based on user profile data.
 * 
 * Formulas used:
 * - BMR: Mifflin-St Jeor equation (most accurate for general population)
 * - TDEE: Activity multiplier approach
 * - Macros: Goal-based ratios with protein adjusted for activity
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface UserProfileInput {
  // Basic metrics
  weightKg: number | null;
  heightCm: number | null;
  birthDate: string | Date | null;
  biologicalSex: string | null; // 'male' | 'female'
  
  // Goals and activity
  activityLevel: string; // 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  fitnessLevel: string;  // 'beginner' | 'intermediate' | 'advanced'
  primaryGoal: string;   // 'fat_loss' | 'muscle_gain' | 'recomposition' | 'maintenance'
  targetWeightKg: number | null;
  targetDate: string | Date | null;
  customCalorieTarget?: number | null;
  bodyFatPercent?: number | null;
  activityFactor?: number | null;
  measuredDailyEnergyExpenditureKcal?: number | null;
  weeklyExerciseMinutes?: number | null;
  exerciseIntensityMets?: number | null;
  activityFactorIncludesExercise?: boolean | null;
  includeTefSeparately?: boolean | null;
  weightChangeWeekKg?: number | null;
  goalRateKgPerWeek?: number | null;
}

export interface TargetProvenance {
  formulaUsed: 'katch-mcardle' | 'mifflin-st-jeor';
  bmrKatch: number | null;
  bmrMifflin: number | null;
  bmrUsed: number;
  leanMassKg: number | null;
  activityFactor: number;
  tdeeBase: number;
  exerciseKcalPerDay: number;
  tefKcalPerDay: number;
  tdeeBeforeCalibration: number;
  measuredDailyEnergyExpenditureKcal: number | null;
  tdeeCalibrated: number;
  calibrationBounds: { min: number; max: number };
  goalMode: 'maintain' | 'lose_fat' | 'gain_muscle' | 'recompose';
  targetKgPerWeek: number;
  dailyDeltaKcal: number;
  calorieTargetRaw: number;
  minCaloriesFloor: number;
  maxCaloriesCap: number;
  weeklyAdaptiveAdjustmentKcalPerDay: number;
  calorieTargetFinal: number;
}

export interface PersonalizedTargets {
  // Energy
  bmr: number;                    // Basal Metabolic Rate
  tdee: number;                   // Total Daily Energy Expenditure
  dailyCalories: number;          // Target daily calories
  calories: number;               // Alias for dailyCalories (for convenience)
  calorieAdjustment: number;      // Adjustment from TDEE (deficit/surplus)
  
  // Macros (in grams)
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  
  // Hydration
  waterMl: number;
  waterGlasses: number;
  
  // Fitness
  workoutDaysPerWeek: number;
  restDaysPerWeek: number;
  
  // Weight management
  weeklyWeightChange: number;     // kg per week (negative = loss, positive = gain)
  daysToGoal: number | null;
  
  // Goal
  primaryGoal: string;            // User's primary fitness goal
  
  // Custom Targets
  steps: number;
  weightKg?: number;
  
  // Provenance
  calculationMethod: string;
  confidence: number;             // 0-1 based on data completeness
  warnings: string[];
  customCaloriesApplied?: boolean;
  provenance?: TargetProvenance;
  explanationText?: string;
  confidenceLabel?: 'high' | 'medium' | 'low';
  detailsActionRequired?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

const PROTEIN_MULTIPLIERS: Record<string, number> = {
  fat_loss: 2.2,
  muscle_gain: 2.0,
  recomposition: 25,
  maintenance: 1.8,
};

const WORKOUT_DAYS_BY_LEVEL: Record<string, number> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function calculateAge(birthDate: string | Date | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age > 0 ? age : null;
}

function calculateBMR(weightKg: number, heightCm: number, age: number, biologicalSex: string): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return biologicalSex.toLowerCase() === 'male' ? base + 5 : base - 161;
}

function normalizeActivityLevel(level: string | null | undefined): 'sedentary' | 'light' | 'moderate' | 'very' | 'extra' {
  const normalized = String(level || '').toLowerCase();
  if (normalized === 'sedentary') return 'sedentary';
  if (normalized === 'light') return 'light';
  if (normalized === 'moderate') return 'moderate';
  if (normalized === 'active') return 'very';
  if (normalized === 'very_active') return 'extra';
  if (normalized === 'very') return 'very';
  if (normalized === 'extra') return 'extra';
  return 'moderate';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function isFinitePositive(value: unknown): value is number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function normalizeGoal(goal: string | null | undefined): 'maintain' | 'lose_fat' | 'gain_muscle' | 'recompose' {
  const normalized = String(goal || '').toLowerCase();
  if (normalized === 'fat_loss' || normalized === 'lose_fat') return 'lose_fat';
  if (normalized === 'muscle_gain' || normalized === 'gain_muscle') return 'gain_muscle';
  if (normalized === 'recomposition' || normalized === 'recompose') return 'recompose';
  return 'maintain';
}

function getConfidenceLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function calculateTargetCalories(
  tdeeCalibrated: number,
  profile: UserProfileInput,
  leanMassKg: number | null,
  bmi: number,
): {
  calories: number;
  adjustment: number;
  weeklyChange: number;
  targetKgPerWeek: number;
  rawCalories: number;
  minFloor: number;
  maxCap: number;
  adaptiveAdjustment: number;
  goalMode: 'maintain' | 'lose_fat' | 'gain_muscle' | 'recompose';
} {
  const goalMode = normalizeGoal(profile.primaryGoal);
  const sex = String(profile.biologicalSex || 'female').toLowerCase();
  const weightKg = Number(profile.weightKg || 0);
  const bodyFatPercent = Number(profile.bodyFatPercent ?? NaN);
  const fitnessLevel = String(profile.fitnessLevel || 'beginner').toLowerCase();

  const customCalorieTarget = Number(profile.customCalorieTarget ?? NaN);
  if (Number.isFinite(customCalorieTarget) && customCalorieTarget > 900) {
    const roundedCustom = roundTo(customCalorieTarget, 10);
    const customWeeklyChange = ((roundedCustom - tdeeCalibrated) * 7) / 7700;
    return {
      calories: roundedCustom,
      adjustment: roundedCustom - tdeeCalibrated,
      weeklyChange: Math.round(customWeeklyChange * 100) / 100,
      targetKgPerWeek: Math.abs(customWeeklyChange),
      rawCalories: roundedCustom,
      minFloor: sex === 'male' ? 1400 : 1200,
      maxCap: tdeeCalibrated + 1000,
      adaptiveAdjustment: 0,
      goalMode,
    };
  }

  let targetKgPerWeek = 0;
  let calorieTargetRaw = tdeeCalibrated;

  if (goalMode === 'lose_fat') {
    const requestedRate = Number(profile.goalRateKgPerWeek ?? NaN);
    if (Number.isFinite(requestedRate) && requestedRate > 0) {
      targetKgPerWeek = Math.abs(requestedRate);
    } else {
      const isLean = Number.isFinite(bodyFatPercent)
        ? (sex === 'male' ? bodyFatPercent < 15 : bodyFatPercent < 24)
        : bmi < 23;
      const weeklyFraction = isLean ? 0.0025 : 0.005;
      targetKgPerWeek = weightKg * weeklyFraction;
    }
    const dailyDeficit = (targetKgPerWeek * 7700) / 7;
    calorieTargetRaw = tdeeCalibrated - dailyDeficit;
  }

  if (goalMode === 'gain_muscle') {
    const highBodyFat = Number.isFinite(bodyFatPercent)
      ? (sex === 'male' ? bodyFatPercent > 25 : bodyFatPercent > 35)
      : false;
    let chosenSurplus = 350;
    if (highBodyFat) chosenSurplus = 250;
    else if (fitnessLevel === 'beginner') chosenSurplus = 500;
    else if (fitnessLevel === 'advanced') chosenSurplus = 250;

    const minSurplus = 0.05 * tdeeCalibrated;
    const maxSurplus = 0.15 * tdeeCalibrated;
    const boundedSurplus = clamp(chosenSurplus, minSurplus, maxSurplus);
    targetKgPerWeek = (boundedSurplus * 7) / 7700;
    calorieTargetRaw = tdeeCalibrated + boundedSurplus;
  }

  if (goalMode === 'recompose') {
    const deficitPercent = fitnessLevel === 'advanced' ? 0.1 : fitnessLevel === 'intermediate' ? 0.05 : 0;
    const boundedPercent = clamp(deficitPercent, 0, 0.1);
    calorieTargetRaw = tdeeCalibrated * (1 - boundedPercent);
    targetKgPerWeek = ((tdeeCalibrated - calorieTargetRaw) * 7) / 7700;
  }

  const minFloor = leanMassKg && leanMassKg > 0
    ? Math.max(22 * leanMassKg, 1200)
    : (sex === 'male' ? 1400 : 1200);
  const maxCap = tdeeCalibrated + 1000;

  let calorieTarget = clamp(calorieTargetRaw, minFloor, maxCap);

  const actualDeltaKgWeek = Number(profile.weightChangeWeekKg ?? NaN);
  const expectedDeltaKgWeek = goalMode === 'lose_fat'
    ? -targetKgPerWeek
    : goalMode === 'gain_muscle'
      ? targetKgPerWeek
      : goalMode === 'recompose'
        ? -targetKgPerWeek
        : 0;

  let adaptiveAdjustment = 0;
  if (Number.isFinite(actualDeltaKgWeek)) {
    const error = actualDeltaKgWeek - expectedDeltaKgWeek;
    adaptiveAdjustment = clamp(((error * 7700) / 7) * (-1), -500, 500);
    calorieTarget = clamp(calorieTarget + adaptiveAdjustment, minFloor, maxCap);
  }

  const finalCalories = roundTo(calorieTarget, 10);
  const adjustment = finalCalories - tdeeCalibrated;
  const weeklyChange = (adjustment * 7) / 7700;

  return {
    calories: finalCalories,
    adjustment,
    weeklyChange: Math.round(weeklyChange * 100) / 100,
    targetKgPerWeek,
    rawCalories: calorieTargetRaw,
    minFloor,
    maxCap,
    adaptiveAdjustment,
    goalMode,
  };
}

function calculateMacros(
  calories: number,
  weightKg: number,
  primaryGoal: string,
  leanMassKg: number | null,
): { protein: number; carbs: number; fat: number; fiber: number } {
  const goal = normalizeGoal(primaryGoal);
  const proteinGoalKey = goal === 'lose_fat' ? 'fat_loss' : goal === 'gain_muscle' ? 'muscle_gain' : goal === 'recompose' ? 'recomposition' : 'maintenance';
  const proteinMultiplier = PROTEIN_MULTIPLIERS[proteinGoalKey] || PROTEIN_MULTIPLIERS.maintenance;
  const proteinBasis = leanMassKg && leanMassKg > 0 ? leanMassKg : weightKg;

  const proteinMin = (leanMassKg && leanMassKg > 0 ? 1.6 * leanMassKg : 1.6 * weightKg);
  const proteinMax = (leanMassKg && leanMassKg > 0 ? 2.4 * leanMassKg : 2.2 * weightKg);
  const protein = Math.round(clamp(proteinBasis * proteinMultiplier, proteinMin, proteinMax));

  const fatByPercent = (calories * 0.25) / 9;
  const fatMinByWeight = 0.8 * weightKg;
  const fat = Math.round(Math.max(fatByPercent, fatMinByWeight));

  const proteinCalories = protein * 4;
  const fatCalories = fat * 9;
  const carbCalories = calories - proteinCalories - fatCalories;
  const carbs = Math.round(Math.max(0, carbCalories / 4));
  const fiber = Math.round((calories / 1000) * 14);
  return { protein, carbs, fat, fiber };
}

function calculateWaterIntake(weightKg: number, activityLevel: string): { ml: number; glasses: number } {
  let mlPerKg = 33;
  if (activityLevel === 'very' || activityLevel === 'extra' || activityLevel === 'active' || activityLevel === 'very_active') mlPerKg = 40;
  else if (activityLevel === 'moderate') mlPerKg = 35;
  const ml = Math.round(weightKg * mlPerKg);
  const glasses = Math.round(ml / 250);
  return { ml: Math.max(1500, Math.min(4000, ml)), glasses: Math.max(6, Math.min(16, glasses)) };
}

// P2 FIX: Use UTC for consistent date calculations
function calculateDaysToGoal(
  currentWeight: number,
  targetWeight: number,
  weeklyChange: number,
  targetDate: string | Date | null
): number | null {
  if (targetDate) {
    // Use UTC dates to avoid timezone inconsistencies
    const targetDateObj = new Date(targetDate);
    const todayUTC = new Date();
    
    // Get UTC midnight for both dates
    const targetUTC = Date.UTC(
      targetDateObj.getUTCFullYear(),
      targetDateObj.getUTCMonth(),
      targetDateObj.getUTCDate()
    );
    const todayUTCMidnight = Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate()
    );
    
    const diffTime = targetUTC - todayUTCMidnight;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : null;
  }
  if (weeklyChange === 0) return null;
  const weightDiff = targetWeight - currentWeight;
  const weeksToGoal = weightDiff / weeklyChange;
  const daysToGoal = Math.round(weeksToGoal * 7);
  return daysToGoal > 0 ? daysToGoal : null;
}

function calculateConfidence(profile: UserProfileInput): { score: number; warnings: string[] } {
  let score = 0;
  const warnings: string[] = [];
  if (profile.weightKg && profile.weightKg > 0) score += 0.25;
  else warnings.push('Weight not set');
  if (profile.heightCm && profile.heightCm > 0) score += 0.2;
  else warnings.push('Height not set');
  if (profile.birthDate) score += 0.2;
  else warnings.push('Birth date not set');
  if (profile.biologicalSex) score += 0.15;
  else warnings.push('Biological sex not set');
  if (profile.activityLevel) score += 0.1;
  if (profile.primaryGoal) score += 0.1;
  if (isFinitePositive(profile.bodyFatPercent)) score += 0.1;
  return { score: Math.min(1, score), warnings };
}

// ═══════════════════════════════════════════════════════════════
// MAIN CALCULATION FUNCTION
// ═══════════════════════════════════════════════════════════════

export function calculatePersonalizedTargets(profile: UserProfileInput): PersonalizedTargets {
  const { score: confidence, warnings } = calculateConfidence(profile);
  const confidenceLabel = getConfidenceLabel(confidence);
  const hasMinimumData = profile.weightKg && profile.weightKg > 0;

  if (!hasMinimumData) {
    const fallbackCustomCalories = Number(profile.customCalorieTarget ?? NaN);
    const fallbackCalories = Number.isFinite(fallbackCustomCalories) && fallbackCustomCalories > 900
      ? roundTo(fallbackCustomCalories, 10)
      : 2000;

    return {
      bmr: 1650,
      tdee: 2200,
      dailyCalories: fallbackCalories,
      calories: fallbackCalories,
      calorieAdjustment: fallbackCalories - 2200,
      protein: 120,
      carbs: 200,
      fat: 67,
      fiber: 28,
      waterMl: 2500,
      waterGlasses: 10,
      workoutDaysPerWeek: 3,
      restDaysPerWeek: 4,
      weeklyWeightChange: 0,
      daysToGoal: null,
      primaryGoal: profile.primaryGoal || 'maintenance',
      steps: 10000,
      calculationMethod: 'default',
      confidence: 0,
      confidenceLabel: 'low',
      explanationText: `Target ${fallbackCalories} kcal/day using fallback defaults because required profile fields are missing. Confidence: low.`,
      detailsActionRequired: 'Show calculation details? This reveals JSON provenance and intermediate values.',
      customCaloriesApplied: Number.isFinite(fallbackCustomCalories) && fallbackCustomCalories > 900,
      warnings: ['Insufficient profile data. Please complete your profile for personalized targets.'],
    };
  }

  const age = calculateAge(profile.birthDate) || 30;
  const sex = profile.biologicalSex?.toLowerCase() === 'male' ? 'male' : 'female';
  const height = profile.heightCm || (sex === 'male' ? 175 : 162);
  const activityLevel = normalizeActivityLevel(profile.activityLevel);
  const bodyFatPercent = Number(profile.bodyFatPercent ?? NaN);
  const bodyFatIsPlausible = Number.isFinite(bodyFatPercent) && bodyFatPercent >= 10 && bodyFatPercent <= 60;
  const leanMassKg = bodyFatIsPlausible ? profile.weightKg! * (1 - bodyFatPercent / 100) : null;

  const bmrKatch = leanMassKg ? (370 + 21.6 * leanMassKg) : null;
  const bmrMifflin = calculateBMR(profile.weightKg!, height, age, sex);
  const formulaUsed: 'katch-mcardle' | 'mifflin-st-jeor' = bmrKatch ? 'katch-mcardle' : 'mifflin-st-jeor';
  const bmr = bmrKatch ?? bmrMifflin;

  const providedActivityFactor = Number(profile.activityFactor ?? NaN);
  const activityFactor = Number.isFinite(providedActivityFactor)
    ? providedActivityFactor
    : ACTIVITY_MULTIPLIERS[activityLevel];

  const tdeeBase = bmr * activityFactor;

  let exerciseKcalPerDay = 0;
  if (isFinitePositive(profile.weeklyExerciseMinutes) && isFinitePositive(profile.exerciseIntensityMets)) {
    const exerciseHours = Number(profile.weeklyExerciseMinutes) / 60;
    const exerciseCaloriesWeek = Number(profile.exerciseIntensityMets) * profile.weightKg! * exerciseHours;
    exerciseKcalPerDay = exerciseCaloriesWeek / 7;
  }

  const factorIncludesExercise = profile.activityFactorIncludesExercise !== false;
  const teaAdded = factorIncludesExercise ? 0 : exerciseKcalPerDay;

  const includeTefSeparately = profile.includeTefSeparately === true;
  const tefKcalPerDay = includeTefSeparately ? 0.1 * (bmr + teaAdded) : 0;

  const tdeeBeforeCalibration = tdeeBase + teaAdded + tefKcalPerDay;
  const measuredTdee = Number(profile.measuredDailyEnergyExpenditureKcal ?? NaN);
  const tdeeCalibrated = Number.isFinite(measuredTdee)
    ? clamp((tdeeBeforeCalibration + measuredTdee) / 2, 0.85 * tdeeBeforeCalibration, 1.15 * tdeeBeforeCalibration)
    : tdeeBeforeCalibration;

  const bmi = calculateBMI(profile.weightKg!, height);
  const {
    calories,
    adjustment,
    weeklyChange,
    targetKgPerWeek,
    rawCalories,
    minFloor,
    maxCap,
    adaptiveAdjustment,
    goalMode,
  } = calculateTargetCalories(tdeeCalibrated, profile, leanMassKg, bmi);

  const { protein, carbs, fat, fiber } = calculateMacros(calories, profile.weightKg!, profile.primaryGoal, leanMassKg);
  const { ml: waterMl, glasses: waterGlasses } = calculateWaterIntake(profile.weightKg!, activityLevel);
  const workoutDays = WORKOUT_DAYS_BY_LEVEL[profile.fitnessLevel.toLowerCase()] || 3;
  const daysToGoal = profile.targetWeightKg
    ? calculateDaysToGoal(profile.weightKg!, profile.targetWeightKg, weeklyChange, profile.targetDate)
    : null;

  const calorieAdjustment = calories - tdeeCalibrated;
  const provenance: TargetProvenance = {
    formulaUsed,
    bmrKatch,
    bmrMifflin,
    bmrUsed: bmr,
    leanMassKg,
    activityFactor,
    tdeeBase,
    exerciseKcalPerDay,
    tefKcalPerDay,
    tdeeBeforeCalibration,
    measuredDailyEnergyExpenditureKcal: Number.isFinite(measuredTdee) ? measuredTdee : null,
    tdeeCalibrated,
    calibrationBounds: {
      min: 0.85 * tdeeBeforeCalibration,
      max: 1.15 * tdeeBeforeCalibration,
    },
    goalMode,
    targetKgPerWeek,
    dailyDeltaKcal: calorieAdjustment,
    calorieTargetRaw: rawCalories,
    minCaloriesFloor: minFloor,
    maxCaloriesCap: maxCap,
    weeklyAdaptiveAdjustmentKcalPerDay: adaptiveAdjustment,
    calorieTargetFinal: calories,
  };

  const goalText = goalMode === 'lose_fat'
    ? 'gradual fat loss'
    : goalMode === 'gain_muscle'
      ? 'lean muscle gain'
      : goalMode === 'recompose'
        ? 'body recomposition'
        : 'weight maintenance';

  const explanationText = `Target ${calories} kcal/day for ${goalText}. Confidence: ${confidenceLabel}.`;

  return {
    bmr,
    tdee: Math.round(tdeeCalibrated),
    dailyCalories: calories,
    calories,
    calorieAdjustment,
    protein,
    carbs,
    fat,
    fiber,
    waterMl,
    waterGlasses,
    workoutDaysPerWeek: workoutDays,
    restDaysPerWeek: 7 - workoutDays,
    weeklyWeightChange: weeklyChange,
    daysToGoal,
    primaryGoal: profile.primaryGoal,
    steps: 10000,
    calculationMethod: formulaUsed,
    confidence,
    confidenceLabel,
    explanationText,
    customCaloriesApplied: Number.isFinite(Number(profile.customCalorieTarget ?? NaN)) && Number(profile.customCalorieTarget ?? NaN) > 900,
    detailsActionRequired: 'Show calculation details? This reveals JSON provenance and intermediate values.',
    provenance,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export function getGoalDescription(primaryGoal: string, calorieAdjustment: number): string {
  const goal = primaryGoal.toLowerCase();
  switch (goal) {
    case 'fat_loss':
      return `${Math.abs(calorieAdjustment)} kcal deficit for sustainable fat loss`;
    case 'muscle_gain':
      return `+${calorieAdjustment} kcal surplus for muscle growth`;
    case 'recomposition':
      return 'Moderate deficit to build muscle while losing fat';
    case 'maintenance':
      return 'Maintenance calories for current physique';
    default:
      return 'Personalized to your goals';
  }
}

export function getActivityDescription(level: string): string {
  const descriptions: Record<string, string> = {
    sedentary: 'Little to no exercise, desk job',
    light: 'Light exercise 1-3 days/week',
    moderate: 'Moderate exercise 3-5 days/week',
    active: 'Hard exercise 6-7 days/week',
    very_active: 'Very intense exercise or physical job',
  };
  return descriptions[level.toLowerCase()] || descriptions.moderate;
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function getBMICategory(bmi: number): { category: string; healthy: boolean } {
  if (bmi < 18.5) return { category: 'Underweight', healthy: false };
  if (bmi < 25) return { category: 'Normal', healthy: true };
  if (bmi < 30) return { category: 'Overweight', healthy: false };
  return { category: 'Obese', healthy: false };
}

export function calculateIdealWeightRange(heightCm: number): { min: number; max: number } {
  const heightM = heightCm / 100;
  return {
    min: Math.round(18.5 * heightM * heightM * 10) / 10,
    max: Math.round(24.9 * heightM * heightM * 10) / 10,
  };
}

export function estimateBodyFatFromBMI(bmi: number, age: number, biologicalSex: string): { min: number; max: number } {
  const sexFactor = biologicalSex.toLowerCase() === 'male' ? 1 : 0;
  const bodyFat = (1.20 * bmi) + (0.23 * age) - (10.8 * sexFactor) - 5.4;
  return {
    min: Math.max(3, Math.round((bodyFat - 3) * 10) / 10),
    max: Math.round((bodyFat + 3) * 10) / 10,
  };
}
