export type IronCoachModelSource = 'local_model' | 'cloud_model';

export type IronCoachComplexity = 'simple' | 'moderate' | 'complex';

export interface IronCoachDeviceProfile {
  ramGb?: number;
  cpuCores?: number;
  freeStorageGb?: number;
  supportsLocalInference: boolean;
  modelReady: boolean;
}

export interface IronCoachRoutingInput {
  question: string;
  isOnline: boolean;
  device: IronCoachDeviceProfile;
  forceCloud?: boolean;
  forceLocal?: boolean;
}

export interface IronCoachRoutingDecision {
  source: IronCoachModelSource;
  complexity: IronCoachComplexity;
  reason: string;
}

export interface IronCoachUserProfile {
  name: string;
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  bodyFatPercent: number | null;
  muscleMassKg: number | null;
  activityLevel: string;
  fitnessLevel: string;
  primaryGoal: string;
  goalTargetDate: string | null;
  dietaryRestrictions: string[];
  allergies: string[];
  // Calculated protein targets based on weight and goal (null if weight unknown)
  proteinTargetDaily: number | null;
  proteinTargetWeekly: number | null;
  workoutsThisWeek: number;
  caloriesBurnedThisWeek: number;
  totalWorkoutMinutes: number;
  proteinAdherencePct: number;
  caloriesConsumedThisWeek: number;
  proteinConsumedThisWeek: number;
  avgSleepHours: number | null;
  avgSleepQuality: number | null;
  avgHydrationMl: number | null;
  supplements: Array<{ name: string; dose: string; timing: string }>;
  currentStreak: number;
  momentumScore: number;
}

export interface IronCoachContextSnapshot {
  userGoal: string;
  workoutsThisWeek: number;
  caloriesBurnedThisWeek: number;
  proteinAdherencePct: number;
  // Calculated protein target (null if weight unknown)
  proteinTargetDaily?: number | null;
  momentumScore: number;
  recentInsights: string[];
  retrievalContext: string[];
  memoryContext?: Array<{ key: string; value: unknown; confidence: number }>;
  ragSnippets?: Array<{ source: string; text: string; similarity: number }>;
  
  // Full user profile
  userProfile?: IronCoachUserProfile;
  
  // Recent data for context
  recentFoodLogs?: Array<{
    food: string | null;
    meal: string | null;
    protein: number | null;
    calories: number | null;
    carbs: number | null;
    fat: number | null;
  }>;
  recentWorkouts?: Array<{
    type: string | null;
    duration: number | null;
    calories: number | null;
    notes: string | null;
  }>;
  
  // Weekly planner data
  weeklyPlan?: {
    exists: boolean;
    weekStart: string | null;
    weekEnd: string | null;
    confidence: number | null;
    overview?: {
      totalWorkoutDays: number;
      totalRestDays: number;
      weeklyCalorieTarget: number;
      weeklyProteinTarget: number;
      focusAreas: string[];
      weeklyStrategy: string;
    };
    todayPlan?: {
      date: string;
      dayName: string;
      isWorkoutDay: boolean;
      workout: {
        focus: string;
        durationMinutes: number;
        estimatedCaloriesBurned: number;
        intensity: string;
        exercises: Array<{
          name: string;
          type: string;
          sets: number;
          reps: string;
        }>;
        coachNotes?: string;
      } | null;
      nutrition: {
        targetCalories: number;
        targetProtein: number;
        targetCarbs: number;
        targetFat: number;
        meals: Array<{
          mealType: string;
          foods: Array<{ name: string; quantity: number; unit: string }>;
        }>;
        hydrationMl: number;
      };
      sleep: {
        targetBedtime: string;
        targetWakeTime: string;
        targetDurationHours: number;
      };
      coachMessage: string;
    };
    recommendations?: Array<{
      category: string;
      priority: string;
      recommendation: string;
      reasoning: string;
    }>;
  };

  // Recent chat history for conversational continuity
  recentChatHistory?: Array<{
    role: string;
    content: string;
  }>;
}

export interface IronCoachStreamChunk {
  type: 'token' | 'done' | 'error' | 'meta';
  token?: string;
  source?: IronCoachModelSource;
  reason?: string;
  error?: string;
  aiConversationId?: string;
}
