import { z } from 'zod';

// Body Metric Update Schema (partial update)
export const BodyMetricUpdateSchema = z.object({
  metric_type: z.string().min(1).max(32).optional(),
  value: z.number().min(0).max(10000).optional(),
  unit: z.string().min(1).max(16).optional(),
  source: z.string().max(32).optional(),
  confidence: z.number().min(0).max(1).optional(),
  captured_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/).optional(),
  notes: z.string().max(1024).optional(),
}).strict();
// Supplement Log Create Schema
export const SupplementLogCreateSchema = z.object({
  supplementId: z.string().max(64).optional().nullable(),
  supplementName: z.string().max(128).optional().nullable(),
  name: z.string().max(128).optional().nullable(),
  quantity: z.number().min(0).max(10000).optional(),
  servingSize: z.number().min(0).max(10000).optional(),
  unit: z.string().max(32).optional(),
  servingUnit: z.string().max(32).optional(),
  protein: z.number().min(0).max(2000).optional(),
  calories: z.number().min(0).max(20000).optional(),
  carbs: z.number().min(0).max(2000).optional(),
  fat: z.number().min(0).max(2000).optional(),
  // Accept ISO strings with or without timezone, and Unix timestamps
  loggedAt: z.string().max(64).optional(),
  notes: z.string().max(1024).optional().nullable(),
  timeOfDay: z.string().max(32).optional().nullable(),
}).passthrough(); // Allow extra fields for flexibility
// Supplement Create Schema
export const SupplementCreateSchema = z.object({
  name: z.string().min(1).max(128),
  brand: z.string().max(64).optional().nullable(),
  barcode: z.string().max(64).optional().nullable(),
  category: z.string().max(64).optional().nullable(),
  servingSize: z.number().min(0).max(10000).optional(),
  servingUnit: z.string().max(32).optional(),
  calories: z.number().min(0).max(2000).optional(),
  protein: z.number().min(0).max(200).optional(),
  carbs: z.number().min(0).max(200).optional(),
  fat: z.number().min(0).max(200).optional(),
  vitaminA: z.number().min(0).max(10000).optional().nullable(),
  vitaminC: z.number().min(0).max(10000).optional().nullable(),
  vitaminD: z.number().min(0).max(10000).optional().nullable(),
  vitaminE: z.number().min(0).max(10000).optional().nullable(),
  vitaminK: z.number().min(0).max(10000).optional().nullable(),
  thiamin: z.number().min(0).max(10000).optional().nullable(),
  riboflavin: z.number().min(0).max(10000).optional().nullable(),
  niacin: z.number().min(0).max(10000).optional().nullable(),
  b6: z.number().min(0).max(10000).optional().nullable(),
  folate: z.number().min(0).max(10000).optional().nullable(),
  b12: z.number().min(0).max(10000).optional().nullable(),
  biotin: z.number().min(0).max(10000).optional().nullable(),
  pantothenicAcid: z.number().min(0).max(10000).optional().nullable(),
  calcium: z.number().min(0).max(10000).optional().nullable(),
  iron: z.number().min(0).max(10000).optional().nullable(),
  magnesium: z.number().min(0).max(10000).optional().nullable(),
  zinc: z.number().min(0).max(10000).optional().nullable(),
  selenium: z.number().min(0).max(10000).optional().nullable(),
  potassium: z.number().min(0).max(10000).optional().nullable(),
  omega3: z.number().min(0).max(10000).optional().nullable(),
  source: z.string().max(32).optional(),
  verified: z.boolean().optional(),
  notes: z.string().max(1024).optional().nullable(),
}).strict();
// Barcode Batch Lookup Schema
export const BarcodeBatchLookupSchema = z.object({
  barcodes: z.array(z.string().min(6).max(32)).min(1).max(100)
}).strict();
// Analyze Food Photo Schema
export const AnalyzeFoodPhotoSchema = z.object({
  image: z.string().min(10).max(25_000_000), // base64 or URL, up to ~20MB
}).strict();
// Analyze Photo Schema
export const AnalyzePhotoSchema = z.object({
  imageUrl: z.string().url().max(2048).optional(),
  imageBase64: z.string().max(25_000_000).optional(), // up to ~20MB base64
  mimeType: z.string().max(64).optional(),
  analysisType: z.enum(['body-composition', 'meal', 'food-label', 'progress-photo']).optional(),
  locale: z.string().min(2).max(8).optional(),
}).refine((data) => data.imageUrl || data.imageBase64, {
  message: 'Either imageUrl or imageBase64 is required',
  path: ['imageUrl', 'imageBase64']
}).strict();
// Body Composition Metric Schema (single metric in batch)
export const BodyCompositionMetricSchema = z.object({
  metricType: z.string().min(1).max(32).optional(),
  metric_type: z.string().min(1).max(32).optional(),
  value: z.number().min(0).max(10000),
  unit: z.string().min(1).max(16).optional(),
  source: z.string().max(32).optional(),
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/).optional(),
  captured_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/).optional(),
}).strict();

// Body Composition Create Schema (accepts single or batch)
export const BodyCompositionCreateSchema = z.union([
  BodyCompositionMetricSchema,
  z.object({ metrics: z.array(BodyCompositionMetricSchema).min(1) }).strict()
]);
// Body Metric Create Schema
export const BodyMetricCreateSchema = z.object({
  metric_type: z.string().min(1).max(32),
  value: z.number().min(0).max(10000),
  unit: z.string().min(1).max(16).optional(),
  source: z.string().max(32).optional(),
  confidence: z.number().min(0).max(1).optional(),
  captured_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/).optional(),
  notes: z.string().max(1024).optional(),
}).strict();
// Food Import Schema
export const FoodImportSchema = z.object({
  foods: z.array(z.object({
    name: z.string().min(1).max(128),
    nameEn: z.string().min(1).max(128).optional(),
    nameFr: z.string().min(1).max(128).optional(),
    nameAr: z.string().min(1).max(128).optional(),
    category: z.string().max(64).optional(),
    origin: z.string().max(64).optional(),
    brand: z.string().max(64).optional(),
    caloriesPer100g: z.number().min(0).max(2000).optional(),
    proteinPer100g: z.number().min(0).max(200).optional(),
    carbsPer100g: z.number().min(0).max(200).optional(),
    fatsPer100g: z.number().min(0).max(200).optional(),
    typicalServingGrams: z.number().min(1).max(2000).optional(),
    aliases: z.string().optional(),
  })),
  clearExisting: z.boolean().optional(),
}).strict();
// Food Dispute Schema
export const FoodDisputeSchema = z.object({
  foodId: z.string().min(1).max(64),
  isGlobal: z.boolean(),
  reason: z.string().min(3).max(256),
}).strict();
// Measurement Create Schema
export const MeasurementCreateSchema = z.object({
  type: z.string().min(1).max(32).optional(),
  measurementType: z.string().min(1).max(32).optional(),
  metric_type: z.string().min(1).max(32).optional(),
  value: z.number().min(0).max(10000),
  unit: z.string().min(1).max(16).optional(),
  source: z.string().max(32).optional(),
  confidence: z.number().min(0).max(1).optional(),
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/).optional(),
  captured_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/).optional(),
  notes: z.string().max(1024).optional(),
}).strict();
// Auth Callback Schema
export const AuthCallbackSchema = z.object({
  code: z.string().min(1).max(256),
}).strict();
// Auth Reset Password Schema
export const AuthResetPasswordSchema = z.object({
  email: z.string().email().min(5).max(128),
}).strict();
// Auth Signin Schema
export const AuthSigninSchema = z.object({
  email: z.string().email().min(5).max(128),
  password: z.string().min(8).max(128),
}).strict();
// Auth Signup Schema
export const AuthSignupSchema = z.object({
  email: z.string().email().min(5).max(128),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(100).optional(),
}).strict();
// AI Nutrition Request Schema
export const AiNutritionRequestSchema = z.object({
  locale: z.string().min(2).max(8).optional(),
  mealType: z.string().max(32).optional(),
}).strict();
// AI Worker Request Schema (for query params)
export const AiWorkerRequestSchema = z.object({
  op: z.enum([
    'update-state',
    'decision',
    'dispatch',
    'execute-agents',
    'coordinate',
    'cohort',
    'full-loop',
  ]).optional(),
  batch: z.string().regex(/^\d+$/).optional(),
}).strict();
// AI Workout Request Schema
export const AiWorkoutRequestSchema = z.object({
  locale: z.string().min(2).max(8).optional(),
  workoutType: z.string().max(64).optional(),
  focusArea: z.string().max(64).optional(),
}).strict();
// AI Feedback Schema
export const AiFeedbackSchema = z.object({
  messageId: z.string().min(1).max(64).optional(),
  recommendationId: z.string().min(1).max(64).optional(),
  feedbackType: z.enum(['positive', 'negative', 'neutral']),
  rating: z.number().int().min(1).max(5).optional(),
  feedbackText: z.string().max(1024).optional(),
  outcomeData: z.any().optional(),
}).strict();

// User Settings Update Schema
export const UserSettingsUpdateSchema = z.object({
  theme: z.string().optional(),
  theme_accent: z.record(z.string(), z.string()).optional(),
  map_storage: z.record(z.unknown()).optional(),
  security: z.object({ biometricEnabled: z.boolean().optional() }).optional(),
  accessibility: z.object({ reduceMotion: z.boolean().optional(), highContrast: z.boolean().optional() }).optional(),
  language: z.enum(['en', 'fr']).optional(),
  units: z.object({
    weight: z.enum(['kg', 'lbs']),
    distance: z.enum(['km', 'miles']),
    time: z.string().optional(),
    first_day_of_week: z.string().optional(),
  }).partial().optional(),
  notifications: z.object({
    push_enabled: z.boolean().optional(),
    push_daily_summary: z.boolean().optional(),
    push_workout_reminders: z.boolean().optional(),
    push_premium_insights: z.boolean().optional(),
    email_digest: z.enum(['weekly', 'none']).optional(),
    // Extended notification settings
    soundEnabled: z.boolean().optional(),
    meal_reminders_enabled: z.boolean().optional(),
    hydration_reminders_enabled: z.boolean().optional(),
    streak_protection_enabled: z.boolean().optional(),
    achievements_enabled: z.boolean().optional(),
    coach_insights: z.boolean().optional(),
    coach_insights_enabled: z.boolean().optional(), // Support both field names
    motivational: z.boolean().optional(),
    motivational_enabled: z.boolean().optional(), // Support both field names
    maxPerDay: z.number().optional(),
    max_notifications_per_day: z.number().optional(), // Support both field names
    minIntervalMinutes: z.number().optional(),
    quietHoursStart: z.string().optional(),
    quietHoursEnd: z.string().optional(),
  }).partial().optional(),
  privacy: z.object({
    iron_coach_opt_in: z.boolean().optional(),
    data_retention_months: z.number().optional(),
    image_purge_months: z.number().optional(),
    share_usage_data: z.boolean().optional(),
  }).partial().optional(),
});

// User Profile Update Schema
export const UserProfileUpdateSchema = z.object({
  name: z.string().min(1).max(64).trim().optional(),
  avatarUrl: z.string().url().max(512).optional(),
  coachingTone: z.enum(['encouraging', 'neutral', 'strict']).optional(),
  privacyMode: z.boolean().optional(),
  timezone: z.string().min(1).max(64).trim().optional(),
  locale: z.string().min(2).max(8).trim().optional(),
  heightCm: z.number().min(50).max(300).optional(),
  biologicalSex: z.enum(['male', 'female', 'other']).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'athlete']).optional(),
  fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced', 'elite']).optional(),
  primaryGoal: z.enum(['maintenance', 'weight_loss', 'muscle_gain', 'recomposition']).optional(),
  targetWeightKg: z.number().min(20).max(500).optional(),
  customCalorieTarget: z.number().int().min(900).max(10000).nullable().optional(),
  currentWeight: z.number().min(20).max(500).optional(),
  weightUnit: z.enum(['kg', 'lb', 'lbs']).optional(),
}).strict();

// Food Log Update Schema - strict validation for food logging integrity
export const FoodLogUpdateSchema = z.object({
  food_id: z.string().max(64).optional().nullable(),
  food_name: z.string().max(128).optional().nullable(),
  quantity: z.number().min(0).max(100000).optional(),
  unit: z.string().max(16).optional(),
  calories: z.number().min(0).max(100000).optional(),
  protein: z.number().min(0).max(10000).optional(),
  carbs: z.number().min(0).max(10000).optional(),
  fat: z.number().min(0).max(10000).optional(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional().nullable(),
  source: z.string().max(32).optional(),
  photo_url: z.string().max(512).optional().nullable(),
  logged_at: z.string().max(64).optional(),
  notes: z.string().max(1024).optional().nullable(),
  device_id: z.string().max(128).optional().nullable(),
}).strict(); // Strict mode — reject unknown fields to prevent injection
