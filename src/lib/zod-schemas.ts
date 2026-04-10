import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// User Authentication Schemas
// ═══════════════════════════════════════════════════════════════

export const userRegistrationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .optional(),
});

export const userLoginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  coachingTone: z.enum(['supportive', 'direct', 'motivational', 'analytical']).optional(),
  privacyMode: z.enum(['private', 'public', 'friends']).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
});

export type UserRegistrationInput = z.infer<typeof userRegistrationSchema>;
export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ═══════════════════════════════════════════════════════════════
// Food Log Schemas
// ═══════════════════════════════════════════════════════════════

export const foodLogCreateSchema = z.object({
  foodId: z.string().optional(),
  foodName: z.string().optional(),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().default('g'),
  multiplier: z.number().positive().default(1.0),
  calories: z.number().min(0).default(0),
  protein: z.number().min(0).default(0),
  carbs: z.number().min(0).default(0),
  fat: z.number().min(0).default(0),
  source: z.string().default('manual'),
  confidence: z.number().min(0).max(1).default(1.0),
  rationale: z.string().optional(),
  loggedAt: z.string().datetime().optional(),
});

export const foodLogUpdateSchema = z.object({
  id: z.string(),
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  multiplier: z.number().positive().optional(),
  calories: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  source: z.string().optional(),
});

export const foodLogQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mealId: z.string().optional(),
});

export type FoodLogCreateInput = z.infer<typeof foodLogCreateSchema>;
export type FoodLogUpdateInput = z.infer<typeof foodLogUpdateSchema>;
export type FoodLogQueryInput = z.infer<typeof foodLogQuerySchema>;

// ═══════════════════════════════════════════════════════════════
// Measurement Schemas
// ═══════════════════════════════════════════════════════════════

export const measurementCreateSchema = z.object({
  type: z.string().min(1, 'Measurement type is required'),
  value: z.number('Value must be a number'),
  unit: z.string().default('kg'),
  source: z.string().default('manual'),
  deviceModel: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  rationale: z.string().optional(),
  fastedState: z.boolean().optional(),
  timeOfDay: z.string().optional(),
  capturedAt: z.string().datetime().optional(),
});

export const measurementQuerySchema = z.object({
  type: z.string().optional(),
  types: z.string().optional(), // comma-separated types
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  days: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type MeasurementCreateInput = z.infer<typeof measurementCreateSchema>;
export type MeasurementQueryInput = z.infer<typeof measurementQuerySchema>;

// ═══════════════════════════════════════════════════════════════
// Workout Schemas
// ═══════════════════════════════════════════════════════════════

export const workoutCreateSchema = z.object({
  activityType: z.string().default('other'),
  workoutType: z.enum(['cardio', 'strength', 'flexibility', 'sports', 'other']).default('cardio'),
  name: z.string().max(100).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  activeDuration: z.number().int().positive().optional(),
  distanceMeters: z.number().positive().optional(),
  routeData: z.string().max(500_000).optional(),
  elevationGain: z.number().optional(),
  elevationLoss: z.number().optional(),
  avgPace: z.number().positive().optional(),
  avgSpeed: z.number().positive().optional(),
  maxPace: z.number().positive().optional(),
  maxSpeed: z.number().positive().optional(),
  avgHeartRate: z.number().int().positive().optional(),
  maxHeartRate: z.number().int().positive().optional(),
  avgCadence: z.number().int().positive().optional(),
  maxCadence: z.number().int().positive().optional(),
  totalVolume: z.number().positive().optional(),
  totalReps: z.number().int().positive().optional(),
  totalSets: z.number().int().positive().optional(),
  caloriesBurned: z.number().positive().optional(),
  trainingLoad: z.number().optional(),
  intensityFactor: z.number().optional(),
  recoveryImpact: z.number().optional(),
  effortScore: z.number().min(0).max(10).optional(),
  isPR: z.boolean().default(false),
  prType: z.string().optional(),
  splits: z.string().max(50_000).optional(),
  deviceSource: z.string().optional(),
  deviceId: z.string().optional(),
  offlineMode: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  photos: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  weatherData: z.string().max(50_000).optional(),
  source: z.string().default('manual'),
});

export const workoutQuerySchema = z.object({
  activityType: z.string().optional(),
  workoutType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  days: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type WorkoutCreateInput = z.infer<typeof workoutCreateSchema>;
export type WorkoutQueryInput = z.infer<typeof workoutQuerySchema>;

// ═══════════════════════════════════════════════════════════════
// Meal Schemas
// ═══════════════════════════════════════════════════════════════

export const mealCreateSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
  photoUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),
  capturedAt: z.string().datetime().optional(),
});

export type MealCreateInput = z.infer<typeof mealCreateSchema>;

// ═══════════════════════════════════════════════════════════════
// Goal Schemas
// ═══════════════════════════════════════════════════════════════

// P1 FIX: Add proper validation constraints for goals
export const goalCreateSchema = z.object({
  goalType: z.enum([
    'weight_loss', 'weight_gain', 'muscle_gain', 'strength', 
    'cardio', 'nutrition', 'calories', 'protein', 'custom'
  ], { errorMap: () => ({ message: 'Invalid goal type' }) }),
  targetValue: z.number().positive('Target value must be positive'),
  currentValue: z.number().nonnegative('Current value cannot be negative').optional(),
  unit: z.enum(['kg', 'lbs', 'cal', 'kcal', 'g', 'ml', 'reps', 'minutes', 'km', 'miles', '%', 'custom'], {
    errorMap: () => ({ message: 'Invalid unit' })
  }),
  targetDate: z.string().datetime().optional().nullable(),
  status: z.enum(['active', 'completed', 'paused', 'abandoned']).default('active'),
  source: z.string().default('manual'),
  confidence: z.number().min(0).max(1).default(1.0),
  rationale: z.string().max(500, 'Rationale too long').optional(),
});

export type GoalCreateInput = z.infer<typeof goalCreateSchema>;

// ═══════════════════════════════════════════════════════════════
// Body Composition Schemas
// ═══════════════════════════════════════════════════════════════

export const bodyCompositionCreateSchema = z.object({
  frontPhotoUrl: z.string().url('Front photo URL is required'),
  sidePhotoUrl: z.string().url().optional(),
  backPhotoUrl: z.string().url().optional(),
  lighting: z.enum(['low', 'moderate', 'bright']).default('moderate'),
  poseAlignment: z.number().min(0).max(1).default(0.5),
  clothing: z.enum(['minimal', 'light', 'moderate', 'heavy']).default('light'),
  fastedState: z.boolean().optional(),
  timeOfDay: z.string().optional(),
});

export type BodyCompositionCreateInput = z.infer<typeof bodyCompositionCreateSchema>;

// ═══════════════════════════════════════════════════════════════
// Experiment Schemas
// ═══════════════════════════════════════════════════════════════

export const experimentCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  experimentType: z.string().min(1, 'Experiment type is required'),
  intervention: z.string().min(1, 'Intervention is required'),
  baselineBehavior: z.string().optional(),
  durationWeeks: z.number().int().positive().default(2),
  startDate: z.string().datetime().optional(),
  projectedEffect: z.string().optional(),
  effectConfidence: z.number().min(0).max(1).optional(),
});

export type ExperimentCreateInput = z.infer<typeof experimentCreateSchema>;

// ═══════════════════════════════════════════════════════════════
// Food Database Schemas
// ═══════════════════════════════════════════════════════════════

export const foodCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  brand: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  category: z.string().min(1, 'Category is required'),
  cuisine: z.string().max(50).optional(),
  calories: z.number().min(0, 'Calories must be non-negative'),
  protein: z.number().min(0).default(0),
  carbs: z.number().min(0).default(0),
  fat: z.number().min(0).default(0),
  fiber: z.number().min(0).default(0),
  sugar: z.number().min(0).default(0),
  sodium: z.number().min(0).default(0),
  servingSize: z.number().positive().default(100),
  servingUnit: z.string().default('g'),
  verificationStatus: z.enum(['draft', 'pending', 'verified', 'rejected']).default('draft'),
  confidenceScore: z.number().min(0).max(1).default(0.5),
  source: z.string().default('community'),
  sourceUrl: z.string().url().optional(),
  isHalal: z.boolean().optional(),
  isKosher: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  tags: z.string().optional(),
});

export const foodSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  barcode: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type FoodCreateInput = z.infer<typeof foodCreateSchema>;
export type FoodSearchInput = z.infer<typeof foodSearchSchema>;

// ═══════════════════════════════════════════════════════════════
// User Profile Schemas
// ═══════════════════════════════════════════════════════════════

export const userProfileCreateSchema = z.object({
  birthDate: z.string().datetime().optional(),
  biologicalSex: z.enum(['male', 'female', 'other']).optional(),
  heightCm: z.number().positive().optional(),
  targetWeightKg: z.number().positive().optional(),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).default('moderate'),
  fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  dietaryRestrictions: z.string().optional(),
  allergies: z.string().optional(),
  primaryGoal: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  weeklyCheckinDay: z.number().int().min(0).max(6).default(0),
});

export type UserProfileCreateInput = z.infer<typeof userProfileCreateSchema>;

// ═══════════════════════════════════════════════════════════════
// Analytics Query Schemas
// ═══════════════════════════════════════════════════════════════

export const analyticsQuerySchema = z.object({
  metric: z.enum(['weight', 'bodyFat', 'leanMass', 'calories', 'protein', 'workouts', 'steps']),
  range: z.enum(['7d', '14d', '30d', '90d', '1y']).default('30d'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
