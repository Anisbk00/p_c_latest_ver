/**
 * Human State Engine
 * 
 * Core state machine for tracking and managing user state.
 * Provides AI-driven suggestions based on minimal signals.
 * 
 * @module lib/human-state-engine
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type PrimaryGoal = 'fat_loss' | 'recomposition' | 'muscle_gain' | 'performance' | 'maintenance';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type CoachingTone = 'analytical' | 'supportive' | 'strict' | 'minimal';
export type UnitSystem = 'metric' | 'imperial';

export interface UserSignals {
  // Device signals
  deviceLocale?: string;
  timezone?: string;
  
  // Email signals
  emailDomain?: string;
  emailLocale?: string;
  
  // Optional initial collected fields
  name?: string;
  existingGoal?: PrimaryGoal;
  existingActivityLevel?: ActivityLevel;
}

export interface AISuggestion {
  value: string;
  confidence: number; // 0-100
  rationale: string;
}

export interface SetupSuggestions {
  goalSuggestion: AISuggestion;
  activitySuggestion: AISuggestion;
  toneSuggestion: AISuggestion;
  suggestedExperiment: {
    title: string;
    description: string;
    duration: number; // days
    category: 'nutrition' | 'training' | 'habit';
  } | null;
}

export interface HumanState {
  userId: string;
  
  // Core profile
  primaryGoal: PrimaryGoal | null;
  activityLevel: ActivityLevel | null;
  coachingTone: CoachingTone;
  unitSystem: UnitSystem;
  timezone: string;
  
  // Setup status
  setupCompleted: boolean;
  setupCompletedAt: Date | null;
  setupSkipped: boolean;
  
  // AI state
  lastSuggestionAt: Date | null;
  suggestionVersion: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface SetupData {
  avatarFileId?: string;
  primaryGoal: PrimaryGoal;
  activityLevel: ActivityLevel;
  unitSystem: UnitSystem;
  coachingTone: CoachingTone;
  timezone: string;
  acceptSuggestedExperiment?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const GOAL_PRIORITIES: Record<string, number> = {
  fat_loss: 1,
  recomposition: 2,
  muscle_gain: 3,
  performance: 4,
  maintenance: 5,
};

const ACTIVITY_DEFAULTS: Record<string, ActivityLevel> = {
  US: 'moderate',
  GB: 'moderate',
  DE: 'active',
  AU: 'active',
  CA: 'moderate',
  JP: 'light',
  IN: 'light',
  BR: 'moderate',
  default: 'moderate',
};

const COACHING_TONE_HINTS: Record<string, CoachingTone> = {
  // Professional domains often prefer analytical
  'gmail.com': 'supportive',
  'outlook.com': 'supportive',
  'yahoo.com': 'supportive',
  'icloud.com': 'supportive',
  // Default
  default: 'analytical',
};

// ═══════════════════════════════════════════════════════════════
// Suggestion Engine
// ═══════════════════════════════════════════════════════════════

/**
 * Generate AI-driven suggestions based on minimal user signals
 */
export function generateSuggestions(signals: UserSignals): SetupSuggestions {
  // Goal suggestion based on locale and signals
  const goalSuggestion = inferGoal(signals);
  
  // Activity level suggestion
  const activitySuggestion = inferActivityLevel(signals);
  
  // Coaching tone suggestion
  const toneSuggestion = inferCoachingTone(signals);
  
  // Suggested micro-experiment
  const suggestedExperiment = suggestExperiment(signals, goalSuggestion.value as PrimaryGoal);

  return {
    goalSuggestion,
    activitySuggestion,
    toneSuggestion,
    suggestedExperiment,
  };
}

function inferGoal(signals: UserSignals): AISuggestion {
  // If user already specified a goal, use it with high confidence
  if (signals.existingGoal) {
    return {
      value: signals.existingGoal,
      confidence: 95,
      rationale: 'Based on your selection',
    };
  }

  // Infer from email domain patterns (health/fitness related domains)
  const domain = signals.emailDomain?.toLowerCase() || '';
  
  // Fitness-related domains often indicate muscle/performance goals
  if (domain.includes('fit') || domain.includes('gym') || domain.includes('crossfit')) {
    return {
      value: 'muscle_gain',
      confidence: 68,
      rationale: 'Based on your email domain patterns',
    };
  }

  // Regional patterns (some regions have higher fitness awareness)
  const locale = signals.deviceLocale || signals.emailLocale || '';
  const region = locale.split('_')[1] || locale.split('-')[1] || '';
  
  // Western regions with higher obesity rates might prioritize fat loss
  if (['US', 'GB', 'AU', 'CA'].includes(region.toUpperCase())) {
    return {
      value: 'fat_loss',
      confidence: 72,
      rationale: 'Based on regional health trends and your locale',
    };
  }

  // Default to maintenance for unknown signals
  return {
    value: 'maintenance',
    confidence: 45,
    rationale: 'Safe starting point - adjust based on your goals',
  };
}

function inferActivityLevel(signals: UserSignals): AISuggestion {
  // If user already specified, use it
  if (signals.existingActivityLevel) {
    return {
      value: signals.existingActivityLevel,
      confidence: 95,
      rationale: 'Based on your selection',
    };
  }

  // Infer from locale (cultural patterns)
  const locale = signals.deviceLocale || signals.emailLocale || '';
  const region = locale.split('_')[1] || locale.split('-')[1] || '';
  
  const activity = ACTIVITY_DEFAULTS[region.toUpperCase()] || ACTIVITY_DEFAULTS.default;
  
  // Activity level inference is less confident
  const confidenceMap: Record<string, number> = {
    active: 55,
    moderate: 60,
    light: 50,
    sedentary: 45,
    very_active: 40,
  };

  return {
    value: activity,
    confidence: confidenceMap[activity],
    rationale: 'Based on regional activity patterns',
  };
}

function inferCoachingTone(signals: UserSignals): AISuggestion {
  const domain = signals.emailDomain?.toLowerCase() || '';
  
  // Check for professional/corporate domains
  if (domain.endsWith('.edu') || domain.endsWith('.org')) {
    return {
      value: 'analytical',
      confidence: 58,
      rationale: 'Academic/organizational context suggests data-driven approach',
    };
  }

  if (domain.endsWith('.io') || domain.endsWith('.tech') || domain.includes('dev')) {
    return {
      value: 'analytical',
      confidence: 62,
      rationale: 'Tech background often prefers data-driven insights',
    };
  }

  // Default supportive tone
  const tone = COACHING_TONE_HINTS[domain] || COACHING_TONE_HINTS.default;
  
  return {
    value: tone,
    confidence: 55,
    rationale: 'A balanced, encouraging approach works well for most',
  };
}

function suggestExperiment(signals: UserSignals, goal: PrimaryGoal): SetupSuggestions['suggestedExperiment'] {
  // Suggest experiments based on goal
  const experiments: Record<PrimaryGoal, SetupSuggestions['suggestedExperiment']> = {
    fat_loss: {
      title: 'Protein Timing',
      description: 'Eat 20-30g protein within 30 minutes of waking for 2 weeks',
      duration: 14,
      category: 'nutrition',
    },
    muscle_gain: {
      title: 'Progressive Overload',
      description: 'Increase weight or reps by 5% each workout session',
      duration: 21,
      category: 'training',
    },
    recomposition: {
      title: 'Carb Cycling',
      description: 'Higher carbs on training days, lower on rest days',
      duration: 14,
      category: 'nutrition',
    },
    performance: {
      title: 'Deload Week',
      description: 'Reduce training volume by 40% every 4th week',
      duration: 7,
      category: 'training',
    },
    maintenance: {
      title: 'Hydration Habit',
      description: 'Drink 500ml water before each meal',
      duration: 14,
      category: 'habit',
    },
  };

  return experiments[goal] || experiments.maintenance;
}

// ═══════════════════════════════════════════════════════════════
// State Management
// ═══════════════════════════════════════════════════════════════

/**
 * Create initial human state for a new user
 */
export function createInitialState(userId: string, timezone?: string): HumanState {
  return {
    userId,
    primaryGoal: null,
    activityLevel: null,
    coachingTone: 'supportive',
    unitSystem: 'metric',
    timezone: timezone || 'UTC',
    setupCompleted: false,
    setupCompletedAt: null,
    setupSkipped: false,
    lastSuggestionAt: null,
    suggestionVersion: '1.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Update human state after setup completion
 */
export function updateStateFromSetup(
  state: HumanState,
  setupData: SetupData
): HumanState {
  return {
    ...state,
    primaryGoal: setupData.primaryGoal,
    activityLevel: setupData.activityLevel,
    coachingTone: setupData.coachingTone,
    unitSystem: setupData.unitSystem,
    timezone: setupData.timezone,
    setupCompleted: true,
    setupCompletedAt: new Date(),
    setupSkipped: false,
    updatedAt: new Date(),
  };
}

/**
 * Check if user needs setup
 */
export function needsSetup(state: HumanState | null): boolean {
  if (!state) return true;
  return !state.setupCompleted && !state.setupSkipped;
}

/**
 * Validate setup data
 */
export function validateSetupData(data: Partial<SetupData>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (data.primaryGoal && !['fat_loss', 'recomposition', 'muscle_gain', 'performance', 'maintenance'].includes(data.primaryGoal)) {
    errors.push('Invalid primary goal');
  }

  if (data.activityLevel && !['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(data.activityLevel)) {
    errors.push('Invalid activity level');
  }

  if (data.coachingTone && !['analytical', 'supportive', 'strict', 'minimal'].includes(data.coachingTone)) {
    errors.push('Invalid coaching tone');
  }

  if (data.unitSystem && !['metric', 'imperial'].includes(data.unitSystem)) {
    errors.push('Invalid unit system');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

export function getGoalLabel(goal: PrimaryGoal): string {
  const labels: Record<PrimaryGoal, string> = {
    fat_loss: 'Fat Loss',
    recomposition: 'Recomposition',
    muscle_gain: 'Muscle Gain',
    performance: 'Performance',
    maintenance: 'Maintenance',
  };
  return labels[goal];
}

export function getActivityLabel(level: ActivityLevel): string {
  const labels: Record<ActivityLevel, string> = {
    sedentary: 'Sedentary',
    light: 'Light',
    moderate: 'Moderate',
    active: 'Active',
    very_active: 'Very Active',
  };
  return labels[level];
}

export function getToneLabel(tone: CoachingTone): string {
  const labels: Record<CoachingTone, string> = {
    analytical: 'Analytical',
    supportive: 'Supportive',
    strict: 'Strict',
    minimal: 'Minimal',
  };
  return labels[tone];
}

export function getTonePreview(tone: CoachingTone): string {
  const previews: Record<CoachingTone, string> = {
    analytical: 'Data-driven insights with detailed metrics',
    supportive: 'Encouraging guidance with positive reinforcement',
    strict: 'Direct feedback with accountability focus',
    minimal: 'Brief, essential updates only',
  };
  return previews[tone];
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function detectUnitSystem(locale?: string): UnitSystem {
  const loc = locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  // US, Liberia, Myanmar use imperial
  if (loc.includes('US') || loc === 'en-LR' || loc === 'my') {
    return 'imperial';
  }
  return 'metric';
}
