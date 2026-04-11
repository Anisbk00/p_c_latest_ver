"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSupabaseAuth } from '@/lib/supabase/auth-context';
import {
  initDatabase,
  saveOfflineWorkout,
  getOfflineWorkouts,
  getUnsyncedWorkouts,
  markWorkoutSynced,
  subscribeToNetworkChanges,
  subscribeToVisibilityChanges,
  waitForPendingTransactions,
  isOnline as checkIsOnline,
  generateTempId,
  getOfflineStats,
  type OfflineWorkout,
  // Food log offline storage
  saveOfflineFoodEntry,
  getOfflineFoodEntries,
  getUnsyncedFoodEntries,
  getSyncableFoodEntries,
  markFoodEntrySynced,
  deleteOfflineFoodEntry,
  recordSyncAttempt,
  cleanupOldSyncedEntries,
  resolveConflict,
  type OfflineFoodEntry,
} from '@/lib/offline-storage';
import {
  getStorageNumber,
  setStorageNumber,
  STORAGE_KEYS,
} from '@/lib/secure-storage';
import { 
  type PersonalizedTargets,
  calculatePersonalizedTargets,
  type UserProfileInput,
} from '@/lib/personalized-targets';
import { 
  emitProfileEvent, 
  triggerHumanStateRecalculation,
  onProfileEvent,
  type ProfileEvent,
} from '@/lib/profile-events';
import { unifiedDataService } from '@/lib/unified-data-service';
import { useUserDataRealtime } from '@/hooks/use-realtime-subscription';
import { apiFetch } from '@/lib/mobile-api';
import { getLocalTodayString, getLocalDayStartISO, getLocalDayEndISO, isoToLocalDateString } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  coachingTone: string;
  streak: number;
  level: number;
  consistency: number;
  trend: 'positive' | 'neutral' | 'negative';
  weeklyData: { date: Date; completed: boolean }[];
  version?: number;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'gymbro' | 'gymgirl';
  notificationsEnabled: boolean;
  units: 'metric' | 'imperial';
  language: string;
  customCalorieTarget?: number | null;
  setupCompleted: boolean;
  setupCompletedAt: string | null;
  setupSkipped: boolean;
  exportFormat: string;
  version: number;
}

export interface UserProfileDetails {
  birthDate: string | null;
  sex: 'male' | 'female' | 'other';
  heightCm: number | null;
  targetWeightKg: number | null;
  activityLevel: string;
  fitnessLevel: string;
  primaryGoal: string | null;
  targetDate: string | null;
  weeklyCheckinDay: number;
  version: number;
}

export interface NutritionData {
  calories: { current: number; target: number };
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fat: { current: number; target: number };
}

export interface FoodLogEntry {
  id: string;
  foodId: string | null;
  foodName: string | null;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  mealType?: string; // breakfast, lunch, dinner, snack, supplements
  loggedAt: string;
  rationale?: string | null;
  food: {
    id: string;
    name: string;
  } | null;
}

export interface Measurement {
  id: string;
  measurementType: string;
  value: number;
  unit: string;
  capturedAt: string;
  source: string;
}

export interface WorkoutData {
  id: string;
  activityType: string;
  workoutType: string;
  name: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  distanceMeters: number | null;
  caloriesBurned: number | null;
  trainingLoad: number | null;
  recoveryImpact: number | null;
  effortScore: number | null;
  avgPace: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  isPR: boolean;
  prType: string | null;
  notes: string | null;
  rating: number | null;
  
  // Extended fields for Supabase/Unified architecture
  activeDuration?: number | null;
  maxPace?: number | null;
  avgSpeed?: number | null;
  maxSpeed?: number | null;
  avgCadence?: number | null;
  maxCadence?: number | null;
  totalVolume?: number | null;
  totalReps?: number | null;
  totalSets?: number | null;
  intensityFactor?: number | null;
  elevationGain?: number | null;
  elevationLoss?: number | null;
  routeData?: any;
  splits?: any;
  deviceSource?: string | null;
  deviceId?: string | null;
  photos?: string[] | null;
  weatherData?: any;
  source?: string;
  version?: number;
}

export interface TodayWorkoutSummary {
  totalCalories: number;
  totalDistance: number;
  totalDuration: number;
  trainingLoad: number;
  recoveryImpact: number;
  workoutCount: number;
}

export interface HydrationData {
  current: number;
  target: number;
  glasses: number;
  entries: Measurement[];
}

export interface StepsData {
  current: number;
  target: number;
  distance: number; // in meters
  calories: number;
  entries: Measurement[];
  syncing?: boolean;
}

export interface AnalyticsData {
  graphData: Array<{ date: string; value: number }>;
  caloriesGraphData?: Array<{ date: string; value: number }>;
  trainingGraphData?: Array<{ date: string; value: number }>;
  trend: 'up' | 'down' | 'stable';
  percentChange: number;
  bodyComposition: {
    currentWeight: number | null;
    previousWeight: number | null;
    currentBodyFat: number | null;
    previousBodyFat: number | null;
    currentLeanMass: number | null;
    previousLeanMass: number | null;
    weightChange: number | null;
    bodyFatChange: number | null;
    leanMassChange: number | null;
  };
  nutrition: {
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    caloricBalanceScore: number;
    proteinScore: number;
    carbTimingScore: number;
    fatQualityScore: number;
    metabolicStability: number;
  };
  training: {
    totalWorkouts: number;
    totalVolume: number;
    totalDuration: number;
    avgWorkoutDuration: number;
    recoveryScore: number;
    volumeTrend: 'up' | 'down' | 'stable';
    volumeScore: number;
    recoveryScoreRadar: number;
    sleepScore: number;
    calorieScore: number;
    stressScore: number;
  };
  evolution: Array<{
    month: string;
    weight: number | null;
    bodyFat: number | null;
    leanMass: number | null;
  }>;
  profileCompletion?: {
    score: number;
    isComplete: boolean;
    warnings: string[];
    calculationConfidence: number; // 0-100, indicates accuracy of BMR/TDEE calculations
    missingFields: {
      height: boolean;
      birthDate: boolean;
      biologicalSex: boolean;
      activityLevel: boolean;
      primaryGoal: boolean;
      targetWeight: boolean;
      hasWeightData: boolean;
    };
  };
}

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate consecutive day streak from food log entries
 * Counts consecutive days with activity from today backwards
 */
export function calculateStreak(entries: FoodLogEntry[]): number {
  if (!entries || entries.length === 0) return 0;
  
  // Get unique days with food logs
  const logDays = new Set(
    entries.map(entry => 
      new Date(entry.loggedAt).toISOString().split('T')[0]
    )
  );
  
  // Count consecutive days from today backwards
  const today = new Date();
  let streak = 0;
  let checkDate = new Date(today);
  
  // Check if there's activity today, if not start from yesterday
  const todayStr = today.toISOString().split('T')[0];
  if (!logDays.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  // Count consecutive days (max 1 year)
  for (let i = 0; i < 365; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (logDays.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

// ═══════════════════════════════════════════════════════════════
// Context Type
// ═══════════════════════════════════════════════════════════════

interface AppContextType {
  // User
  user: UserProfile | null;
  userProfile: UserProfileDetails | null;
  userLoading: boolean;
  refetchUser: () => Promise<void>;
  
  // Targets
  targets: PersonalizedTargets | null;
  targetsLoading: boolean;
  refetchTargets: () => Promise<void>;
  
  // Nutrition
  nutrition: NutritionData;
  nutritionLoading: boolean;
  refetchNutrition: () => Promise<void>;
  addNutrition: (calories: number, protein: number, carbs: number, fat: number) => void;
  removeNutrition: (calories: number, protein: number, carbs: number, fat: number) => void;
  
  // Food Log
  foodLogEntries: FoodLogEntry[];
  foodLogLoading: boolean;
  foodLogSyncing: boolean;
  refetchFoodLog: () => Promise<void>;
  addFoodEntry: (entry: Partial<FoodLogEntry> & { foodName?: string }) => Promise<void>;
  updateFoodEntry: (id: string, entry: Partial<FoodLogEntry> & { foodName?: string }) => Promise<void>;
  deleteFoodEntry: (id: string) => Promise<void>;

  // Food Log Date Navigation
  selectedFoodDate: string; // YYYY-MM-DD format
  setSelectedFoodDate: (date: string) => void;
  goToToday: () => void;
  
  // Measurements
  measurements: Measurement[];
  latestWeight: Measurement | null;
  measurementsLoading: boolean;
  refetchMeasurements: () => Promise<void>;
  addMeasurement: (value: number, unit?: string) => Promise<void>;
  
  // Workouts
  workouts: WorkoutData[];
  workoutSummary: TodayWorkoutSummary | null;
  workoutsLoading: boolean;
  refetchWorkouts: () => Promise<void>;
  addWorkout: (workout: Partial<WorkoutData>) => Promise<void>;
  updateWorkout: (id: string, updates: Partial<WorkoutData>) => Promise<void>;
  deleteWorkout: (id: string) => Promise<void>;
  
  // Offline Status
  isOnline: boolean;
  offlineWorkouts: OfflineWorkout[];
  offlineFoodEntries: OfflineFoodEntry[];
  offlineStats: {
    totalWorkouts: number;
    totalFoodEntries: number;
    unsyncedCount: number;
    unsyncedFoodCount: number;
    pendingOperations: number;
    syncQueueSize: number;
  } | null;
  isSyncing: boolean;
  syncWorkouts: () => Promise<void>;
  syncFoodEntries: () => Promise<void>;
  
  // Hydration
  hydration: HydrationData;
  hydrationLoading: boolean;
  hydrationSyncing: boolean;
  refetchHydration: () => Promise<void>;
  addWater: (ml: number) => Promise<void>;
  removeLastWater: () => Promise<void>;
  clearAllWater: () => Promise<void>;
  updateWaterTarget: (ml: number) => void;
  
  // Steps
  steps: StepsData;
  stepsLoading: boolean;
  stepsSyncing: boolean;
  refetchSteps: () => Promise<void>;
  addSteps: (count: number, distance?: number, calories?: number) => Promise<void>;
  updateStepsTarget: (count: number) => void;
  
  // Analytics
  analyticsData: AnalyticsData | null;
  analyticsLoading: boolean;
  analyticsError: string | null;
  refetchAnalytics: () => Promise<void>;
  
  // Global refresh
  refreshAll: () => Promise<void>;
  
  // Data version signal for cache invalidation
  dataVersion: number;

  // User settings (language, units, theme, etc.)
  userSettings: UserSettings | null;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

// ═══════════════════════════════════════════════════════════════
// Default Values
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TARGETS = {
  calories: 2200,
  protein: 165,
  carbs: 220,
  fat: 75,
  water: 2500,
};

const DEFAULT_NUTRITION: NutritionData = {
  calories: { current: 0, target: DEFAULT_TARGETS.calories },
  protein: { current: 0, target: DEFAULT_TARGETS.protein },
  carbs: { current: 0, target: DEFAULT_TARGETS.carbs },
  fat: { current: 0, target: DEFAULT_TARGETS.fat },
};

const DEFAULT_HYDRATION: HydrationData = {
  current: 0,
  target: DEFAULT_TARGETS.water,
  glasses: 0,
  entries: [],
};

const DEFAULT_STEPS: StepsData = {
  current: 0,
  target: 10000,
  distance: 0,
  calories: 0,
  entries: [],
};

// Default personalized targets when no profile data
const DEFAULT_PERSONALIZED_TARGETS: PersonalizedTargets = {
  bmr: 1650,
  tdee: 2200,
  dailyCalories: 2000,
  calories: 2000,
  calorieAdjustment: 0,
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
  primaryGoal: 'maintenance',
  steps: 10000,
  calculationMethod: 'default',
  confidence: 0,
  warnings: ['Complete your profile for personalized targets'],
};

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ═══════════════════════════════════════════════════════════════
// Fetch with Timeout - Prevents infinite loading on network issues
// ═══════════════════════════════════════════════════════════════

const FETCH_TIMEOUT = 15000; // 15 seconds

/**
 * Wraps fetch with a timeout to prevent hanging requests
 * Throws 'TIMEOUT' error if request exceeds timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Custom error class for timeout
 */
class TimeoutError extends Error {
  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ═══════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════

const AppContext = createContext<AppContextType | null>(null);

// ═══════════════════════════════════════════════════════════════
// SECURITY: All auth goes through Supabase — no test mode
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Auth state - only fetch data when authenticated
  // Also pull user + profile so we can bootstrap user name immediately
  const { isAuthenticated, isLoading: authLoading, user: authUser, profile: authProfile } = useSupabaseAuth();
  
  // User State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileDetails | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  const userProfileRef = useRef(userProfile);
  useEffect(() => { userProfileRef.current = userProfile; }, [userProfile]);
  const userSettingsRef = useRef(userSettings);
  useEffect(() => { userSettingsRef.current = userSettings; }, [userSettings]);

  // ─── Bootstrap user from auth immediately ────────────────────────────
  // This ensures the greeting shows the real user name (e.g. "Anis") instead
  // of "User" while the full profile fetch is in progress.
  // Priority: authProfile.name (from /api/profile) > user_metadata.name > email prefix
  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) return;
    setUser(prev => {
      // Don't overwrite a fully loaded profile (it has more data)
      if (prev?.id === authUser.id && prev.name !== 'User') return prev;
      const name =
        authProfile?.name ||
        authUser.user_metadata?.name ||
        authUser.email?.split('@')[0] ||
        'User';
      return {
        id: authUser.id,
        email: authUser.email ?? '',
        name,
        avatarUrl: authProfile?.avatar_url ?? null,
        coachingTone: (authProfile as any)?.coaching_tone ?? 'motivational',
        streak: 0,
        level: 1,
        consistency: 0,
        trend: 'neutral' as const,
        weeklyData: [],
      };
    });
  }, [isAuthenticated, authUser?.id, authProfile?.name, authUser?.email, authUser?.user_metadata?.name, authProfile?.avatar_url]);
  
  // Targets State
  const [targets, setTargets] = useState<PersonalizedTargets | null>(null);
  const [targetsLoading, setTargetsLoading] = useState(true);
  
  // Nutrition State
  const [nutrition, setNutrition] = useState<NutritionData>(DEFAULT_NUTRITION);
  const [nutritionLoading, setNutritionLoading] = useState(true);
  
  // Food Log State
  const [foodLogEntries, setFoodLogEntries] = useState<FoodLogEntry[]>([]);
  const [foodLogLoading, setFoodLogLoading] = useState(true);
  const [foodLogSyncing, setFoodLogSyncing] = useState(false);

  // Food Log Date Navigation State
  const [selectedFoodDate, setSelectedFoodDate] = useState<string>(() => {
    // Initialize with today's date in LOCAL timezone (not UTC)
    return getLocalTodayString();
  });
  const selectedFoodDateRef = useRef(selectedFoodDate);
  useEffect(() => { selectedFoodDateRef.current = selectedFoodDate; }, [selectedFoodDate]);

  // Navigate to today
  const goToToday = useCallback(() => {
    setSelectedFoodDate(getLocalTodayString());
  }, []);
  
  // Measurements State
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [latestWeight, setLatestWeight] = useState<Measurement | null>(null);
  const [measurementsLoading, setMeasurementsLoading] = useState(true);
  const latestWeightRef = useRef(latestWeight);
  useEffect(() => { latestWeightRef.current = latestWeight; }, [latestWeight]);
  
  // Workouts State
  const [workouts, setWorkouts] = useState<WorkoutData[]>([]);
  const [workoutSummary, setWorkoutSummary] = useState<TodayWorkoutSummary | null>(null);
  const [workoutsLoading, setWorkoutsLoading] = useState(true);
  
  // Offline State
  const [isOnline, setIsOnline] = useState(checkIsOnline());
  const [offlineWorkouts, setOfflineWorkouts] = useState<OfflineWorkout[]>([]);
  const [offlineFoodEntries, setOfflineFoodEntries] = useState<OfflineFoodEntry[]>([]);
  const [offlineStats, setOfflineStats] = useState<AppContextType['offlineStats']>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInProgress = useRef(false);
  const foodSyncInProgress = useRef(false);
  
  // RACE CONDITION FIX: Nutrition update queue and lock
  // Prevents concurrent modifications to nutrition totals which can cause
  // inconsistent state when multiple food entries are added rapidly
  const nutritionUpdateQueue = useRef<Array<{
    type: 'add' | 'remove';
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>>([]);
  const nutritionUpdateLock = useRef(false);
  
  // Process nutrition updates atomically
  const processNutritionQueue = useCallback(() => {
    if (nutritionUpdateLock.current || nutritionUpdateQueue.current.length === 0) {
      return;
    }
    
    nutritionUpdateLock.current = true;
    
    // Batch all pending updates
    const updates = nutritionUpdateQueue.current.splice(0);
    const totalDelta = updates.reduce((acc, update) => {
      const multiplier = update.type === 'add' ? 1 : -1;
      acc.calories += update.calories * multiplier;
      acc.protein += update.protein * multiplier;
      acc.carbs += update.carbs * multiplier;
      acc.fat += update.fat * multiplier;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    
    // Apply all updates in a single state change
    setNutrition(prev => ({
      calories: { 
        ...prev.calories, 
        current: Math.max(0, toFiniteNumber(prev.calories.current) + totalDelta.calories) 
      },
      protein: { 
        ...prev.protein, 
        current: Math.max(0, toFiniteNumber(prev.protein.current) + totalDelta.protein) 
      },
      carbs: { 
        ...prev.carbs, 
        current: Math.max(0, toFiniteNumber(prev.carbs.current) + totalDelta.carbs) 
      },
      fat: { 
        ...prev.fat, 
        current: Math.max(0, toFiniteNumber(prev.fat.current) + totalDelta.fat) 
      },
    }));
    
    nutritionUpdateLock.current = false;
    
    // Process any updates that came in during processing
    if (nutritionUpdateQueue.current.length > 0) {
      // Use microtask to prevent stack overflow
      queueMicrotask(() => processNutritionQueue());
    }
  }, []);
  
  // Hydration State
  const [hydration, setHydration] = useState<HydrationData>(DEFAULT_HYDRATION);
  const [hydrationLoading, setHydrationLoading] = useState(true);
  const [hydrationSyncing, setHydrationSyncing] = useState(false);
  
  // Steps State
  const [steps, setSteps] = useState<StepsData>(DEFAULT_STEPS);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [stepsSyncing, setStepsSyncing] = useState(false);
  
  // Analytics State
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  
  // Data version signal - increments when data changes to signal cache invalidation
  const [dataVersion, setDataVersion] = useState(0);
  const incrementDataVersion = useCallback(() => {
    setDataVersion(v => v + 1);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: Stop loading for unauthenticated users
  // When auth finishes loading and user is NOT authenticated, stop ALL loading states
  // This prevents infinite loading screen for unauthenticated users
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setUserLoading(false);
      setNutritionLoading(false);
      setTargetsLoading(false);
      setFoodLogLoading(false);
      setMeasurementsLoading(false);
      setWorkoutsLoading(false);
      setHydrationLoading(false);
      setStepsLoading(false);
      setAnalyticsLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  // Initialize Unified Data Service
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      unifiedDataService.initialize(user.id).catch(err => {
        console.error('[AppProvider] Failed to initialize UnifiedDataService:', err);
      });
    }
  }, [isAuthenticated, user?.id]);
  
  // Track if mounted
  const isMounted = useRef(true);
  const lastFetchTime = useRef(0);
  // P1 FIX: Abort controller for analytics fetch to prevent race conditions
  const analyticsAbortRef = useRef<AbortController | null>(null);
  
  // ═══════════════════════════════════════════════════════════════
  // Fetch Functions
  // ═══════════════════════════════════════════════════════════════
  
  // Fetch User & Profile Data
  // Uses /api/profile directly (same as auth-context) instead of UDS.
  // The profiles table uses 'id' as the user key, not 'user_id', so UDS.get()
  // would fail with "column profiles.user_id does not exist".
  // Circuit breaker: stop calling /api/profile after consecutive 401s
  const profileFailCountRef = useRef(0);
  const PROFILE_FAIL_LIMIT = 2;

  // Store volatile deps in refs so fetchUser has a STABLE reference.
  // This prevents refreshAll / visibility-change / profile-event listeners
  // from being re-subscribed every time user or authProfile changes.
  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);
  const authNameRef = useRef(authProfile?.name);
  useEffect(() => { authNameRef.current = authProfile?.name; }, [authProfile?.name]);
  const authMetaNameRef = useRef(authUser?.user_metadata?.name);
  useEffect(() => { authMetaNameRef.current = authUser?.user_metadata?.name; }, [authUser?.user_metadata?.name]);
  const authEmailRef = useRef(authUser?.email);
  useEffect(() => { authEmailRef.current = authUser?.email; }, [authUser?.email]);

  const fetchUser = useCallback(async (showLoading = true) => {
    if (!userIdRef.current) {
      setUserLoading(false);
      return; // user.id is bootstrapped from auth before this runs
    }
    // Circuit breaker — stop flooding server with 401s
    if (profileFailCountRef.current >= PROFILE_FAIL_LIMIT) return;
    if (showLoading) setUserLoading(true);
    
    try {
      const response = await apiFetch('/api/profile', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          profileFailCountRef.current += 1;
          return; // Will be handled by auth
        }
        console.warn('[AppProvider] fetchUser API error:', response.status);
        return;
      }
      // Success — reset circuit breaker
      profileFailCountRef.current = 0;
      const data = await response.json();
      
      if (isMounted.current) {
        if (data.user) {
          setUser(prev => ({
            ...prev!,
            id: data.user.id,
            email: data.user.email,
            // Use profile name with fallbacks – never 'User' if we have a real name
            name: data.user.name || authNameRef.current || authMetaNameRef.current || authEmailRef.current?.split('@')[0] || prev?.name || 'User',
            avatarUrl: data.user.avatarUrl || null,
            coachingTone: data.user.coachingTone || 'motivational',
            streak: 0,
            level: 1,
            consistency: 0,
            trend: (prev?.trend ?? 'neutral') as 'positive' | 'neutral' | 'negative',
            weeklyData: prev?.weeklyData ?? [],
            version: data.user.version || 1,
          }));
        }

        if (data.settings) {
          // Normalize theme from DB/profile API into canonical app values.
          // DB stores 'her' for gymgirl (toDbTheme mapping) — handle both.
          const raw = String(data.settings.theme || '').toLowerCase();
          const themeMap: Record<string, 'light' | 'dark' | 'gymbro' | 'gymgirl'> = {
            light: 'light', white: 'light', system: 'dark', black: 'dark', dark: 'dark',
            gymbro: 'gymbro', gymgirl: 'gymgirl', her: 'gymgirl',
          };
          const resolvedTheme = themeMap[raw] || 'dark';
          setUserSettings({
            theme: resolvedTheme,
            notificationsEnabled: data.settings.notificationsEnabled ?? true,
            units: (data.settings.units as 'metric' | 'imperial') || 'metric',
            language: data.settings.language || 'en',
            customCalorieTarget: Number(data.settings.customCalorieTarget ?? NaN) > 0
              ? Math.round(Number(data.settings.customCalorieTarget))
              : null,
            setupCompleted: data.settings.setupCompleted ?? false,
            setupCompletedAt: data.settings.setupCompletedAt || null,
            setupSkipped: data.settings.setupSkipped ?? false,
            exportFormat: data.settings.exportFormat || 'json',
            version: data.settings.version || 1,
          });
        }

        if (data.profile) {
          setUserProfile({
            birthDate: data.profile.birthDate || null,
            sex: (data.profile.biologicalSex as 'male' | 'female' | 'other') || 'other',
            heightCm: data.profile.heightCm || null,
            targetWeightKg: data.profile.targetWeightKg || null,
            activityLevel: data.profile.activityLevel || 'moderate',
            fitnessLevel: data.profile.fitnessLevel || 'beginner',
            primaryGoal: data.profile.primaryGoal || null,
            targetDate: data.profile.targetDate || null,
            weeklyCheckinDay: data.profile.weeklyCheckinDay || 1,
            version: data.profile.version || 1,
          });
        }
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching user data:', err);
      if (isMounted.current) {
        setUserError(err instanceof Error ? err.message : 'Failed to fetch user');
      }
    } finally {
      if (isMounted.current) setUserLoading(false);
    }
  }, []); // Stable — volatile values read from refs
  
  // Fetch Personalized Targets
  const fetchTargets = useCallback(async () => {
    if (!userIdRef.current) {
      setTargetsLoading(false);
      return;
    }
    try {
      setTargetsLoading(true);

      let apiProfileData: any = null;
      try {
        const profileResponse = await apiFetch('/api/profile', { credentials: 'include' });
        if (profileResponse.ok) {
          apiProfileData = await profileResponse.json();
        }
      } catch (profileFetchError) {
        console.warn('[AppProvider] fetchTargets profile prefetch failed:', profileFetchError);
      }
      
      const [goals, latestWeights] = await Promise.all([
        unifiedDataService.getAll('goals', {
          filters: { user_id: userIdRef.current },
          orderBy: { field: 'created_at', direction: 'desc' },
          limit: 25
        }),
        unifiedDataService.getAll('body_metrics', {
          filters: { user_id: userIdRef.current, metric_type: 'weight' },
          orderBy: { field: 'captured_at', direction: 'desc' },
          limit: 1,
        }),
      ]);

      const apiLatestWeightValue = toFiniteNumber(apiProfileData?.latestWeight?.value, NaN);
      const latestWeightValue = Number.isFinite(apiLatestWeightValue) && apiLatestWeightValue > 0
        ? apiLatestWeightValue
        : toFiniteNumber((latestWeights?.[0] as any)?.value, NaN);

      const profileSnapshot = apiProfileData?.profile
        ? {
            birthDate: apiProfileData.profile.birthDate ?? null,
            sex: apiProfileData.profile.biologicalSex ?? null,
            heightCm: apiProfileData.profile.heightCm ?? null,
            targetWeightKg: apiProfileData.profile.targetWeightKg ?? null,
            activityLevel: apiProfileData.profile.activityLevel ?? 'moderate',
            fitnessLevel: apiProfileData.profile.fitnessLevel ?? 'beginner',
            primaryGoal: apiProfileData.profile.primaryGoal ?? 'maintenance',
            targetDate: apiProfileData.profile.targetDate ?? null,
          }
        : userProfileRef.current;

      const settingsSnapshot = apiProfileData?.settings
        ? {
            ...userSettingsRef.current,
            customCalorieTarget: Number(apiProfileData.settings.customCalorieTarget ?? NaN) > 0
              ? Math.round(Number(apiProfileData.settings.customCalorieTarget))
              : null,
          }
        : userSettingsRef.current;

      const sourceGoals: any[] = Array.isArray(apiProfileData?.goals) && apiProfileData.goals.length > 0
        ? apiProfileData.goals
        : (goals as any[]);
      const customCaloriesFromSettings = Number(settingsSnapshot?.customCalorieTarget ?? NaN);
      const hasCustomCaloriesOverride = Number.isFinite(customCaloriesFromSettings) && customCaloriesFromSettings > 0;
      const customCaloriesOverride = hasCustomCaloriesOverride ? Math.round(customCaloriesFromSettings) : null;

      const fallbackInput: UserProfileInput | null = Number.isFinite(latestWeightValue) && latestWeightValue > 0
        ? {
            weightKg: latestWeightValue,
            heightCm: profileSnapshot?.heightCm ?? null,
            birthDate: profileSnapshot?.birthDate ?? null,
            biologicalSex: profileSnapshot?.sex === 'male' || profileSnapshot?.sex === 'female' ? profileSnapshot.sex : 'female',
            activityLevel: profileSnapshot?.activityLevel ?? 'moderate',
            fitnessLevel: profileSnapshot?.fitnessLevel ?? 'beginner',
            primaryGoal: profileSnapshot?.primaryGoal ?? 'maintenance',
            targetWeightKg: profileSnapshot?.targetWeightKg ?? null,
            targetDate: profileSnapshot?.targetDate ?? null,
            customCalorieTarget: Number(settingsSnapshot?.customCalorieTarget ?? NaN) > 0
              ? Math.round(Number(settingsSnapshot?.customCalorieTarget))
              : null,
          }
        : null;

      const calculatedFallbackTargets = fallbackInput ? calculatePersonalizedTargets(fallbackInput) : null;
      
      if (isMounted.current) {
        if (sourceGoals.length > 0) {
          const latestGoal = sourceGoals[0] as any;
          const nextTargets: PersonalizedTargets = {
            ...DEFAULT_PERSONALIZED_TARGETS,
            primaryGoal: String(latestGoal?.goal_type ?? latestGoal?.goalType ?? DEFAULT_PERSONALIZED_TARGETS.primaryGoal),
          };
          let hasCalorieTarget = false;
          let hasProteinTarget = false;
          let hasCarbTarget = false;
          let hasFatTarget = false;
          let hasWaterTarget = false;
          let hasStepsTarget = false;

          // Legacy/wide-goals schema (single row with macro columns)
          const caloriesFromWide = toFiniteNumber((latestGoal as any)?.calories_target ?? (latestGoal as any)?.caloriesTarget, NaN);
          const proteinFromWide = toFiniteNumber((latestGoal as any)?.protein_target_g ?? (latestGoal as any)?.proteinTargetG, NaN);
          const carbsFromWide = toFiniteNumber((latestGoal as any)?.carbs_target_g ?? (latestGoal as any)?.carbsTargetG, NaN);
          const fatFromWide = toFiniteNumber((latestGoal as any)?.fat_target_g ?? (latestGoal as any)?.fatTargetG, NaN);
          const waterFromWide = toFiniteNumber((latestGoal as any)?.water_target_ml ?? (latestGoal as any)?.waterTargetMl, NaN);
          const stepsFromWide = toFiniteNumber((latestGoal as any)?.steps_target ?? (latestGoal as any)?.stepsTarget, NaN);

          if (Number.isFinite(caloriesFromWide) && caloriesFromWide > 0) {
            nextTargets.calories = caloriesFromWide;
            nextTargets.dailyCalories = caloriesFromWide;
            hasCalorieTarget = true;
          }
          if (Number.isFinite(proteinFromWide) && proteinFromWide > 0) {
            nextTargets.protein = proteinFromWide;
            hasProteinTarget = true;
          }
          if (Number.isFinite(carbsFromWide) && carbsFromWide > 0) {
            nextTargets.carbs = carbsFromWide;
            hasCarbTarget = true;
          }
          if (Number.isFinite(fatFromWide) && fatFromWide > 0) {
            nextTargets.fat = fatFromWide;
            hasFatTarget = true;
          }
          if (Number.isFinite(waterFromWide) && waterFromWide > 0) {
            nextTargets.waterMl = waterFromWide;
            hasWaterTarget = true;
          }
          if (Number.isFinite(stepsFromWide) && stepsFromWide > 0) {
            nextTargets.steps = stepsFromWide;
            hasStepsTarget = true;
          }

          // Canonical schema fallback (one row per goal_type with target_value)
          for (const rawGoal of sourceGoals as any[]) {
            const goalType = String(rawGoal?.goal_type ?? rawGoal?.goalType ?? '').toLowerCase();
            const targetValue = toFiniteNumber(rawGoal?.target_value ?? rawGoal?.targetValue, NaN);
            if (!Number.isFinite(targetValue) || targetValue <= 0) continue;

            if (goalType.includes('calorie')) {
              nextTargets.calories = targetValue;
              nextTargets.dailyCalories = targetValue;
              hasCalorieTarget = true;
            } else if (goalType.includes('protein')) {
              nextTargets.protein = targetValue;
              hasProteinTarget = true;
            } else if (goalType.includes('carb')) {
              nextTargets.carbs = targetValue;
              hasCarbTarget = true;
            } else if (goalType.includes('fat')) {
              nextTargets.fat = targetValue;
              hasFatTarget = true;
            } else if (goalType.includes('water') || goalType.includes('hydration')) {
              nextTargets.waterMl = targetValue;
              hasWaterTarget = true;
            } else if (goalType.includes('step')) {
              nextTargets.steps = targetValue;
              hasStepsTarget = true;
            }
          }

          if (calculatedFallbackTargets) {
            if (!hasCalorieTarget && calculatedFallbackTargets.dailyCalories > 0) {
              nextTargets.calories = calculatedFallbackTargets.dailyCalories;
              nextTargets.dailyCalories = calculatedFallbackTargets.dailyCalories;
            }
            if (!hasProteinTarget && calculatedFallbackTargets.protein > 0) nextTargets.protein = calculatedFallbackTargets.protein;
            if (!hasCarbTarget && calculatedFallbackTargets.carbs > 0) nextTargets.carbs = calculatedFallbackTargets.carbs;
            if (!hasFatTarget && calculatedFallbackTargets.fat > 0) nextTargets.fat = calculatedFallbackTargets.fat;
            if (!hasWaterTarget && calculatedFallbackTargets.waterMl > 0) nextTargets.waterMl = calculatedFallbackTargets.waterMl;
            if (!hasStepsTarget && calculatedFallbackTargets.steps > 0) nextTargets.steps = calculatedFallbackTargets.steps;
            nextTargets.calculationMethod = calculatedFallbackTargets.calculationMethod;
            nextTargets.confidence = calculatedFallbackTargets.confidence;
            nextTargets.warnings = calculatedFallbackTargets.warnings;
            nextTargets.customCaloriesApplied = calculatedFallbackTargets.customCaloriesApplied;
            nextTargets.explanationText = calculatedFallbackTargets.explanationText;
            nextTargets.confidenceLabel = calculatedFallbackTargets.confidenceLabel;
            nextTargets.detailsActionRequired = calculatedFallbackTargets.detailsActionRequired;
            nextTargets.provenance = calculatedFallbackTargets.provenance;
          }

          if (hasCustomCaloriesOverride && customCaloriesOverride) {
            nextTargets.calories = customCaloriesOverride;
            nextTargets.dailyCalories = customCaloriesOverride;
            nextTargets.customCaloriesApplied = true;
          }

          nextTargets.calories = toFiniteNumber(nextTargets.calories, DEFAULT_PERSONALIZED_TARGETS.calories);
          nextTargets.dailyCalories = toFiniteNumber(nextTargets.dailyCalories, nextTargets.calories);
          nextTargets.protein = toFiniteNumber(nextTargets.protein, DEFAULT_PERSONALIZED_TARGETS.protein);
          nextTargets.carbs = toFiniteNumber(nextTargets.carbs, DEFAULT_PERSONALIZED_TARGETS.carbs);
          nextTargets.fat = toFiniteNumber(nextTargets.fat, DEFAULT_PERSONALIZED_TARGETS.fat);
          nextTargets.waterMl = toFiniteNumber(nextTargets.waterMl, DEFAULT_PERSONALIZED_TARGETS.waterMl);
          nextTargets.steps = toFiniteNumber(nextTargets.steps, DEFAULT_PERSONALIZED_TARGETS.steps);

          setTargets(nextTargets);
        } else {
          if (calculatedFallbackTargets && hasCustomCaloriesOverride && customCaloriesOverride) {
            setTargets({
              ...calculatedFallbackTargets,
              calories: customCaloriesOverride,
              dailyCalories: customCaloriesOverride,
              customCaloriesApplied: true,
            });
          } else {
            setTargets(calculatedFallbackTargets ?? DEFAULT_PERSONALIZED_TARGETS);
          }
        }
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching targets via UDS:', err);
      if (isMounted.current) {
        setTargets(DEFAULT_PERSONALIZED_TARGETS);
      }
    } finally {
      if (isMounted.current) setTargetsLoading(false);
    }
  }, []); // Stable — user.id read from userIdRef
  
  // Store targets in ref for stable fetch callbacks
  const targetsRef = useRef(targets);
  useEffect(() => { targetsRef.current = targets; }, [targets]);

  // Fetch Nutrition (uses personalized targets)
  // Includes BOTH food_logs AND supplement_logs for accurate daily totals
  const fetchNutrition = useCallback(async (showLoading = true) => {
    if (!userIdRef.current) {
      setNutritionLoading(false);
      return;
    }
    try {
      if (showLoading) setNutritionLoading(true);
      
      const selectedDate = selectedFoodDateRef.current;
      // FIX: Use local timezone-aware date range instead of UTC midnight
      const dateStart = getLocalDayStartISO(selectedDate);
      const dateEnd = getLocalDayEndISO(selectedDate);

      // Fetch food_logs AND supplement_logs in parallel
      const [foodLogs, suppResponse] = await Promise.all([
        unifiedDataService.getAll('food_logs', {
          filters: { user_id: userIdRef.current },
          startDate: dateStart,
          endDate: dateEnd,
          dateField: 'logged_at'
        }),
        apiFetch(`/api/supplement-log?date=${selectedDate}`).then(r => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] }))
      ]);

      // Aggregate food_logs
      // FIX: Use local date comparison for accurate date matching
      const totals = foodLogs.reduce((acc: any, log: any) => {
        const logDate = isoToLocalDateString(log.logged_at);
        if (logDate === selectedDate) {
          acc.calories += toFiniteNumber(log.calories);
          acc.protein += toFiniteNumber(log.protein);
          acc.carbs += toFiniteNumber(log.carbs);
          acc.fat += toFiniteNumber(log.fat);
        }
        return acc;
      }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

      // Add supplement_logs to totals
      const suppEntries = suppResponse.entries || [];
      for (const entry of suppEntries) {
        totals.calories += toFiniteNumber(entry.calories);
        totals.protein += toFiniteNumber(entry.protein);
        totals.carbs += toFiniteNumber(entry.carbs);
        totals.fat += toFiniteNumber(entry.fat);
      }
      
      const t = targetsRef.current || DEFAULT_PERSONALIZED_TARGETS;
      
      if (isMounted.current) {
        setNutrition({
          calories: { current: Math.round(toFiniteNumber(totals.calories)), target: toFiniteNumber(t.dailyCalories, DEFAULT_PERSONALIZED_TARGETS.dailyCalories) },
          protein: { current: Math.round(toFiniteNumber(totals.protein)), target: toFiniteNumber(t.protein, DEFAULT_PERSONALIZED_TARGETS.protein) },
          carbs: { current: Math.round(toFiniteNumber(totals.carbs)), target: toFiniteNumber(t.carbs, DEFAULT_PERSONALIZED_TARGETS.carbs) },
          fat: { current: Math.round(toFiniteNumber(totals.fat)), target: toFiniteNumber(t.fat, DEFAULT_PERSONALIZED_TARGETS.fat) },
        });
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching nutrition via UDS:', err);
    } finally {
      if (isMounted.current) setNutritionLoading(false);
    }
  }, []); // Stable — volatile values read from refs
  
  // Fetch Food Log
  const fetchFoodLog = useCallback(async (showLoading = true) => {
    if (!userIdRef.current) {
      setFoodLogLoading(false);
      return;
    }
    try {
      if (showLoading) setFoodLogLoading(true);
      const selectedDate = selectedFoodDateRef.current;
      // FIX: Use local timezone-aware date range instead of UTC midnight
      const dateStart = getLocalDayStartISO(selectedDate);
      const dateEnd = getLocalDayEndISO(selectedDate);
      
      const logs = await unifiedDataService.getAll('food_logs', {
        filters: { user_id: userIdRef.current },
        startDate: dateStart,
        endDate: dateEnd,
        dateField: 'logged_at'
      });

      // Filter for selected date using local timezone comparison
      const dateLogs = logs
        .filter((log: any) => isoToLocalDateString(log.logged_at) === selectedDate)
        .map((log: any) => ({
          id: log.id,
          foodId: log.food_id,
          foodName: log.food_name,
          quantity: toFiniteNumber(log.quantity, 1),
          unit: log.unit,
          calories: toFiniteNumber(log.calories),
          protein: toFiniteNumber(log.protein),
          carbs: toFiniteNumber(log.carbs),
          fat: toFiniteNumber(log.fat),
          source: log.source,
          mealType: log.meal_type,
          loggedAt: log.logged_at,
          food: log.global_foods ? { id: log.global_foods.id, name: log.global_foods.name } : null
        }));
      
      if (isMounted.current) {
        setFoodLogEntries(dateLogs);
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching food log via UDS:', err);
    } finally {
      if (isMounted.current) {
        setFoodLogLoading(false);
        setFoodLogSyncing(false);
      }
    }
  }, []); // Stable — user.id read from userIdRef
  
  // Fetch Measurements
  const fetchMeasurements = useCallback(async (showLoading = true) => {
    if (!userIdRef.current) {
      setMeasurementsLoading(false);
      return;
    }
    try {
      if (showLoading) setMeasurementsLoading(true);
      const measurementsList = await unifiedDataService.getAll('body_metrics', {
        filters: { user_id: userIdRef.current, metric_type: 'weight' },
        orderBy: { field: 'captured_at', direction: 'desc' },
        limit: 30
      });
      
      if (isMounted.current) {
        setMeasurements(measurementsList.map((m: any) => ({
          id: m.id,
          measurementType: m.metric_type,
          value: m.value,
          unit: m.unit,
          capturedAt: m.captured_at,
          source: m.source
        })));
        setLatestWeight(measurementsList.length > 0 ? {
          id: measurementsList[0].id,
          measurementType: measurementsList[0].metric_type,
          value: measurementsList[0].value,
          unit: measurementsList[0].unit,
          capturedAt: measurementsList[0].captured_at,
          source: measurementsList[0].source
        } : null);
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching measurements via UDS:', err);
    } finally {
      if (isMounted.current) setMeasurementsLoading(false);
    }
  }, []); // Stable — user.id read from userIdRef
  
  // Fetch Workouts
  const fetchWorkouts = useCallback(async (showLoading = true) => {
    if (!userIdRef.current) {
      setWorkoutsLoading(false);
      return;
    }
    try {
      if (showLoading) setWorkoutsLoading(true);
      // FIX: Use forceRefresh to clear stale cache and fetch fresh data from server
      const workoutList = await unifiedDataService.getAll('workouts', {
        filters: { user_id: userIdRef.current },
        orderBy: { field: 'started_at', direction: 'desc' },
        forceRefresh: true // Always fetch fresh data to avoid stale cache issues
      });
      
      if (isMounted.current) {
        // Today's summary - use local date for proper timezone handling
        const today = getLocalTodayString();
        const todayWorkouts = workoutList.filter((w: any) => 
          isoToLocalDateString(w.started_at) === today
        );
        
        const summary = todayWorkouts.reduce((acc: any, w: any) => {
          acc.totalCalories += w.calories_burned || 0;
          acc.totalDistance += w.distance_meters || 0;
          acc.totalDuration += (w.duration_minutes || 0) * 60;
          acc.trainingLoad += w.training_load || 0;
          acc.recoveryImpact += w.recovery_impact || 0;
          acc.workoutCount += 1;
          return acc;
        }, { totalCalories: 0, totalDistance: 0, totalDuration: 0, trainingLoad: 0, recoveryImpact: 0, workoutCount: 0 });

        setWorkoutSummary(summary);
        setWorkouts(workoutList.map((w: any) => ({
          id: w.id,
          activityType: w.activity_type,
          workoutType: w.workout_type,
          name: w.name,
          startedAt: w.started_at,
          completedAt: w.completed_at,
          durationMinutes: w.duration_minutes,
          activeDuration: w.active_duration,
          distanceMeters: w.distance_meters,
          caloriesBurned: w.calories_burned,
          trainingLoad: w.training_load,
          recoveryImpact: w.recovery_impact,
          effortScore: w.effort_score,
          avgPace: w.avg_pace,
          avgHeartRate: w.avg_heart_rate,
          maxHeartRate: w.max_heart_rate,
          isPR: w.is_pr,
          prType: w.pr_type,
          notes: w.notes,
          rating: w.rating,
          source: w.source
        } as any)));
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching workouts via UDS:', err);
    } finally {
      if (isMounted.current) setWorkoutsLoading(false);
    }
  }, []); // Stable — user.id read from userIdRef
  
  // Fetch Hydration
  const fetchHydration = useCallback(async (showLoading = true) => {
    if (!userIdRef.current) {
      setHydrationLoading(false);
      return;
    }
    try {
      if (showLoading) setHydrationLoading(true);
      
      // Get today's date in YYYY-MM-DD format using LOCAL time
      const todayStr = getLocalTodayString();
      
      // FIX: Always force refresh for hydration to ensure server-side filtering
      // The cache doesn't apply metric_type filter, so we must always query fresh
      const data = await unifiedDataService.getAll('body_metrics', {
        filters: { user_id: userIdRef.current, metric_type: 'water' },
        orderBy: { field: 'captured_at', direction: 'desc' },
        limit: 100,
        forceRefresh: true, // CRITICAL: Always force refresh to bypass cache filtering bug
        useCache: false, // Bypass cache completely for accurate water data
      });
      
      // FIX: Also filter by metric_type client-side as backup (cache may return all types)
      const waterEntries = data.filter((m: any) => m.metric_type === 'water');
      
      // Filter entries that match today's local date using proper timezone conversion
      const todayEntries = waterEntries.filter((m: any) => {
        if (!m.captured_at) return false;
        // Convert ISO timestamp to local date for accurate comparison
        return isoToLocalDateString(m.captured_at) === todayStr;
      });
      
      const total = todayEntries.reduce((sum: number, m: any) => sum + (m.value || 0), 0);
      
      if (isMounted.current) {
        setHydration({
          current: total,
          target: targetsRef.current?.waterMl || DEFAULT_TARGETS.water,
          glasses: Math.floor(total / 250),
          entries: todayEntries.map((m: any) => ({
            id: m.id,
            measurementType: 'water',
            value: m.value,
            unit: m.unit,
            capturedAt: m.captured_at,
            source: m.source
          }))
        });
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching hydration:', err);
    } finally {
      if (isMounted.current) setHydrationLoading(false);
    }
  }, []); // Stable — volatile values read from refs

  const fetchSteps = useCallback(async (showLoading = true) => {
    if (!userIdRef.current) {
      if (showLoading) setStepsLoading(false);
      return;
    }
    try {
      if (showLoading) setStepsLoading(true);
      
      // Use local date for proper timezone handling
      const todayStr = getLocalTodayString();
      const startOfDay = getLocalDayStartISO(todayStr);
      const endOfDay = getLocalDayEndISO(todayStr);
      
      // FIX: Include user_id in filters to properly retrieve user's steps entries
      const data = await unifiedDataService.getAll('body_metrics', {
        filters: { user_id: userIdRef.current, metric_type: 'steps' },
        startDate: startOfDay,
        endDate: endOfDay,
        dateField: 'captured_at',
        orderBy: { field: 'captured_at', direction: 'desc' },
        limit: 100
      });
      
      // Double-check filtering by local date using consistent utility
      const todayEntries = data.filter((m: any) => {
        return isoToLocalDateString(m.captured_at) === todayStr;
      });
      
      const totalSteps = todayEntries.reduce((sum: number, m: any) => sum + (m.value || 0), 0);
      
      if (isMounted.current) {
        setSteps({
          current: totalSteps,
          target: targetsRef.current?.steps || 10000,
          distance: Math.round(totalSteps * 0.762),
          calories: Math.round(totalSteps * 0.04),
          entries: todayEntries.map((m: any) => ({
            id: m.id,
            measurementType: 'steps',
            value: m.value,
            unit: m.unit,
            capturedAt: m.captured_at,
            source: m.source
          }))
        });
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching steps:', err);
    } finally {
      if (isMounted.current) setStepsLoading(false);
    }
  }, []); // Stable — volatile values read from refs

  const fetchAnalytics = useCallback(async () => {
    if (!userIdRef.current) {
      setAnalyticsLoading(false);
      return;
    }
    
    // P1 FIX: Cancel any in-flight analytics request to prevent race conditions
    if (analyticsAbortRef.current) {
      analyticsAbortRef.current.abort();
    }
    analyticsAbortRef.current = new AbortController();
    const currentAbort = analyticsAbortRef.current;
    
    try {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      
      const endDate = new Date().toISOString();
      const startDateDate = new Date();
      startDateDate.setDate(startDateDate.getDate() - 30);
      const startDate = startDateDate.toISOString();
      
      // For evolution map, get 12 months of data
      const evolutionStartDate = new Date();
      evolutionStartDate.setMonth(evolutionStartDate.getMonth() - 12);
      const evolutionStart = evolutionStartDate.toISOString();

      // Parallel fetch for performant loading
      // FIX: Fetch all body metric types for complete evolution data
      const [measurements, bodyFatMetrics, leanMassMetrics, foodLogs, workoutsList] = await Promise.all([
        unifiedDataService.getAll('body_metrics', {
          filters: { user_id: userIdRef.current, metric_type: 'weight' },
          orderBy: { field: 'captured_at', direction: 'desc' },
          limit: 365, // Get up to 1 year of data for evolution
          startDate: evolutionStart,
          endDate,
          dateField: 'captured_at'
        }),
        unifiedDataService.getAll('body_metrics', {
          filters: { user_id: userIdRef.current, metric_type: 'body_fat' },
          orderBy: { field: 'captured_at', direction: 'desc' },
          limit: 365,
          startDate: evolutionStart,
          endDate,
          dateField: 'captured_at'
        }),
        unifiedDataService.getAll('body_metrics', {
          filters: { user_id: userIdRef.current, metric_type: 'lean_mass' },
          orderBy: { field: 'captured_at', direction: 'desc' },
          limit: 365,
          startDate: evolutionStart,
          endDate,
          dateField: 'captured_at'
        }),
        unifiedDataService.getAll('food_logs', {
          filters: { user_id: userIdRef.current },
          startDate,
          endDate,
          dateField: 'logged_at'
        }),
        unifiedDataService.getAll('workouts', {
          filters: { user_id: userIdRef.current },
          startDate,
          endDate,
          dateField: 'started_at'
        })
      ]);
      
      // P1 FIX: Check if this request was aborted before updating state
      if (currentAbort.signal.aborted) {
        return;
      }

      if (isMounted.current) {
        // 1. Weight Trends
        const graphData = measurements.map((m: any) => ({
          date: m.captured_at,
          value: m.value
        })).reverse();
        
        const currentWeight = measurements[0]?.value || null;
        const previousWeight = measurements[1]?.value || null;
        const weightChange = (currentWeight && previousWeight) ? (currentWeight - previousWeight) : 0;

        // 2. Nutrition Analysis
        let totalCals = 0, totalProt = 0, totalCarbs = 0, totalFat = 0;
        const uniqueDays = new Set<string>();
        
        foodLogs.forEach((log: any) => {
            totalCals += (log.calories || 0);
            totalProt += (log.protein || 0);
            totalCarbs += (log.carbs || 0);
            totalFat += (log.fat || 0);
            if (log.logged_at) uniqueDays.add(log.logged_at.split('T')[0]);
        });
        
        const nutritionDays = Math.max(1, uniqueDays.size);
        const avgCalories = Math.round(totalCals / nutritionDays);
        const avgProtein = Math.round(totalProt / nutritionDays);
        const avgCarbs = Math.round(totalCarbs / nutritionDays);
        const avgFat = Math.round(totalFat / nutritionDays);

        // Build calories graph data (daily totals)
        const caloriesByDate: Record<string, number> = {};
        foodLogs.forEach((log: any) => {
          if (log.logged_at) {
            const date = log.logged_at.split('T')[0];
            caloriesByDate[date] = (caloriesByDate[date] || 0) + (log.calories || 0);
          }
        });
        const caloriesGraphData = Object.entries(caloriesByDate)
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // 3. Training Analysis
        const totalWorkouts = workoutsList.length;
        const totalDuration = workoutsList.reduce((sum: number, w: any) => sum + (w.duration_minutes || 0), 0);
        // Use training_load or fallback to duration * intensity proxy
        const totalVolume = workoutsList.reduce((sum: number, w: any) => sum + (w.training_load || (w.duration_minutes * 5) || 0), 0);
        
        // Build training graph data (workout duration by date)
        const trainingGraphData = workoutsList.map((w: any) => ({
          date: w.started_at?.split('T')[0] || w.created_at?.split('T')[0] || '',
          value: w.duration_minutes || w.training_load || 0
        })).filter((d: any) => d.date).sort((a, b) => a.date.localeCompare(b.date));
        
        const targets = targetsRef.current || DEFAULT_PERSONALIZED_TARGETS;

        // Simple Score Calculations (0-100)
        // Caloric Balance: 100 - % deviation from target
        const caloricBalanceScore = Math.max(0, 100 - Math.abs((avgCalories - targets.dailyCalories) / (targets.dailyCalories || 2000)) * 100);
        // Protein Score: % of target met, capped at 100
        const proteinScore = Math.min(100, Math.round((avgProtein / (targets.protein || 150)) * 100));

        // FIX: Group all body metric types by month for complete evolution data
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const evolutionData = [];
        
        const measurementsByMonth: Record<string, number[]> = {};
        const bodyFatByMonth: Record<string, number[]> = {};
        const leanMassByMonth: Record<string, number[]> = {};
        
        // Group measurements by month (weights)
        measurements.forEach((m: any) => {
          const date = new Date(m.captured_at);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (!measurementsByMonth[monthKey]) {
            measurementsByMonth[monthKey] = [];
          }
          measurementsByMonth[monthKey].push(m.value);
        });
        
        // Group body fat by month
        ;(bodyFatMetrics as any[]).forEach((m: any) => {
          const date = new Date(m.captured_at);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (!bodyFatByMonth[monthKey]) {
            bodyFatByMonth[monthKey] = [];
          }
          bodyFatByMonth[monthKey].push(m.value);
        });
        
        // Group lean mass by month
        ;(leanMassMetrics as any[]).forEach((m: any) => {
          const date = new Date(m.captured_at);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (!leanMassByMonth[monthKey]) {
            leanMassByMonth[monthKey] = [];
          }
          leanMassByMonth[monthKey].push(m.value);
        });
        
        // Compute latest body fat and lean mass for bodyComposition section
        const currentBodyFat = (bodyFatMetrics as any[])?.[0]?.value || null;
        const previousBodyFat = (bodyFatMetrics as any[])?.[1]?.value || null;
        const currentLeanMass = (leanMassMetrics as any[])?.[0]?.value || null;
        const previousLeanMass = (leanMassMetrics as any[])?.[1]?.value || null;
        
        // Create 12-month evolution (oldest to newest for slider)
        for (let i = 11; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const monthName = months[date.getMonth()];
          const monthWeights = measurementsByMonth[monthKey];
          const monthBodyFat = bodyFatByMonth[monthKey];
          const monthLeanMass = leanMassByMonth[monthKey];
          
          evolutionData.push({
            month: monthName,
            weight: monthWeights ? monthWeights.reduce((a, b) => a + b, 0) / monthWeights.length : null,
            bodyFat: monthBodyFat ? monthBodyFat.reduce((a, b) => a + b, 0) / monthBodyFat.length : null,
            leanMass: monthLeanMass ? monthLeanMass.reduce((a, b) => a + b, 0) / monthLeanMass.length : null,
          });
        }

        setAnalyticsData({
          graphData,
          caloriesGraphData,
          trainingGraphData,
          trend: weightChange < -0.1 ? 'down' : weightChange > 0.1 ? 'up' : 'stable',
          percentChange: previousWeight ? ((weightChange / previousWeight) * 100) : 0,
          bodyComposition: {
            currentWeight,
            previousWeight,
            currentBodyFat,
            previousBodyFat,
            currentLeanMass,
            previousLeanMass,
            weightChange,
            bodyFatChange: (currentBodyFat && previousBodyFat) ? (currentBodyFat - previousBodyFat) : null,
            leanMassChange: (currentLeanMass && previousLeanMass) ? (currentLeanMass - previousLeanMass) : null,
          },
          nutrition: {
            avgCalories,
            avgProtein,
            avgCarbs,
            avgFat,
            caloricBalanceScore,
            proteinScore,
            // FIX: Compute scores from actual data instead of hardcoded placeholders
            carbTimingScore: uniqueDays.size > 0 ? Math.min(100, Math.round((avgCarbs / Math.max(targets.carbs || 200, 1)) * 100)) : 0,
            fatQualityScore: uniqueDays.size > 0 ? Math.min(100, Math.round((avgFat / Math.max(targets.fat || 70, 1)) * 100)) : 0,
            metabolicStability: uniqueDays.size >= 5 ? Math.min(100, Math.round(100 - (Math.abs(avgCalories - (targets.dailyCalories || 2000)) / Math.max(targets.dailyCalories || 2000, 1)) * 50)) : 50,
          },
          training: {
            totalWorkouts,
            totalVolume,
            totalDuration,
            avgWorkoutDuration: totalWorkouts > 0 ? Math.round(totalDuration / totalWorkouts) : 0,
            // FIX: Derive recovery proxy from workout frequency (3-5/week = optimal)
            recoveryScore: totalWorkouts >= 3 && totalWorkouts <= 5 ? 85 : totalWorkouts > 5 ? 70 : totalWorkouts > 0 ? 75 : 50,
            volumeTrend: totalWorkouts > 4 ? 'up' : totalWorkouts >= 2 ? 'stable' : 'down',
            volumeScore: Math.min(100, totalWorkouts * 10),
            // FIX: Recovery radar - more rest days between workouts = better recovery
            recoveryScoreRadar: totalWorkouts > 0 ? Math.min(100, 60 + (7 - Math.min(totalWorkouts, 7)) * 6) : 75,
            sleepScore: 70, // Default until sleep tracking is available
            calorieScore: caloricBalanceScore,
            // FIX: Stress score - moderate exercise reduces stress, excessive may increase it
            stressScore: totalWorkouts >= 3 && totalWorkouts <= 6 ? 85 : totalWorkouts > 6 ? 60 : totalWorkouts > 0 ? 70 : 50,
          },
          evolution: evolutionData,
        } as any);
      }
    } catch (err) {
      console.error('[AppProvider] Error fetching analytics:', err);
      if (isMounted.current) {
        setAnalyticsError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (isMounted.current) setAnalyticsLoading(false);
    }
  }, []); // Stable — user.id read from userIdRef
  
  // ═══════════════════════════════════════════════════════════════
  // Profile Event Subscription
  // ═══════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════
  // Profile Event Subscription
  // ═══════════════════════════════════════════════════════════════
  
  // Stable profile event handler using refs
  const profileEventHandlerRef = useRef<(event: ProfileEvent) => void>();
  
  // Update handler ref when functions change
  useEffect(() => {
    profileEventHandlerRef.current = (event: ProfileEvent) => {
      if (!user?.id || event.payload.userId !== user.id) return;
      
      const {
        fetchNutrition,
        fetchFoodLog,
        fetchMeasurements,
        fetchWorkouts,
        fetchTargets,
        fetchUser,
        fetchHydration,
        fetchSteps,
        fetchAnalytics
      } = fetchFunctionsRef.current;
      
      switch (event.type) {
        case 'food_logged':
        case 'nutrition_updated':
          fetchNutrition?.(false);
          fetchFoodLog?.(false);
          fetchAnalytics?.(); // Analytics depend on food_logs
          incrementDataVersion();
          break;
        case 'weight_updated':
        case 'measurement_added':
          fetchMeasurements?.();
          fetchAnalytics?.(); // Analytics depend on body_metrics
          incrementDataVersion();
          break;
        case 'workout_logged':
        case 'workout_updated':
        case 'workout_deleted':
          fetchWorkouts?.();
          fetchAnalytics?.(); // Analytics depend on workouts
          incrementDataVersion();
          break;
        case 'goal_changed':
          fetchTargets?.();
          fetchNutrition?.(false);
          fetchAnalytics?.(); // Targets affect caloricBalanceScore
          incrementDataVersion();
          break;
        case 'profile_updated':
          fetchUser?.(false);
          fetchTargets?.();
          fetchAnalytics?.(); // Profile changes affect targets → analytics scores
          incrementDataVersion();
          break;
        default:
          // Minimal default refresh - avoid cascading
          fetchUser?.(false);
          incrementDataVersion();
      }
    };
  }, [user?.id, incrementDataVersion]);

  // Subscribe to profile events with stable callback
  useEffect(() => {
    const unsubscribe = onProfileEvent((event: ProfileEvent) => {
      profileEventHandlerRef.current?.(event);
    });
    
    return () => {
      unsubscribe();
    };
  }, []); // No dependencies - stable subscription
  
  // ═══════════════════════════════════════════════════════════════
  // Action Functions
  // ═══════════════════════════════════════════════════════════════
  
  // RACE CONDITION FIX: Use queue-based nutrition updates
  // These functions now queue updates and process them atomically
  const addNutrition = useCallback((calories: number, protein: number, carbs: number, fat: number) => {
    nutritionUpdateQueue.current.push({
      type: 'add',
      calories: toFiniteNumber(calories),
      protein: toFiniteNumber(protein),
      carbs: toFiniteNumber(carbs),
      fat: toFiniteNumber(fat),
    });
    processNutritionQueue();
  }, [processNutritionQueue]);
  
  const removeNutrition = useCallback((calories: number, protein: number, carbs: number, fat: number) => {
    nutritionUpdateQueue.current.push({
      type: 'remove',
      calories: toFiniteNumber(calories),
      protein: toFiniteNumber(protein),
      carbs: toFiniteNumber(carbs),
      fat: toFiniteNumber(fat),
    });
    processNutritionQueue();
  }, [processNutritionQueue]);

  const addFoodEntry = useCallback(async (entry: Partial<FoodLogEntry> & { foodName?: string }) => {
    if (!user?.id) return;

    // Attempt to resolve food name if missing - defensive coding
    let finalFoodName = entry.foodName;
    if ((!finalFoodName || finalFoodName === 'Unknown Food') && entry.foodId) {
      try {
        // Try user foods first (check local cache/fetch)
        const userFood = await unifiedDataService.get('foods', entry.foodId);
        if (userFood?.name) {
          finalFoodName = userFood.name;
        } else {
          try {
            // Then check global foods
            const globalFood = await unifiedDataService.get('global_foods', entry.foodId);
            if (globalFood?.name) {
              finalFoodName = globalFood.name;
            }
          } catch (e) { /* ignore global lookup error */ }
        }
      } catch (e) {
        console.warn('[AppProvider] Could not resolve food name for ID:', entry.foodId);
      }
    }

    const tempId = generateTempId();

    // Use provided loggedAt, or create a new timestamp for the selected date
    let loggedAtIso: string;
    if (entry.loggedAt) {
      // Use the provided loggedAt timestamp
      loggedAtIso = typeof entry.loggedAt === 'string' ? entry.loggedAt : new Date(entry.loggedAt).toISOString();
    } else {
      // Create timestamp for the currently selected date
      const selectedDate = selectedFoodDateRef.current;
      const now = new Date();
      // Use selected date with current time
      const logDate = new Date(`${selectedDate}T${now.toTimeString().split(' ')[0]}`);
      // Add random milliseconds to avoid potential timestamp collisions
      logDate.setMilliseconds(now.getMilliseconds() + Math.floor(Math.random() * 999));
      loggedAtIso = logDate.toISOString();
    }

    const calories = entry.calories || 0;
    const protein = entry.protein || 0;
    const carbs = entry.carbs || 0;
    const fat = entry.fat || 0;

    const newEntry: FoodLogEntry = {
      ...entry,
      id: tempId,
      loggedAt: loggedAtIso,
      calories,
      protein,
      carbs,
      fat,
      quantity: entry.quantity || 1,
      unit: entry.unit || 'serving',
      source: entry.source || 'manual',
      food: entry.foodId ? { id: entry.foodId, name: finalFoodName || 'Unknown Food' } : null
    } as FoodLogEntry;
    
    setFoodLogEntries(prev => [newEntry, ...prev]);
    addNutrition(calories, protein, carbs, fat);
    
    try {
      // FIX: Use immediate: true to ensure data is persisted to server before returning
      // This prevents data loss on page refresh
      const createdRecord = await unifiedDataService.create('food_logs', {
        food_id: entry.foodId,
        food_name: finalFoodName || 'Unknown Food',
        quantity: entry.quantity || 1,
        unit: entry.unit || 'serving',
        calories,
        protein,
        carbs,
        fat,
        source: entry.source || 'manual',
        meal_type: entry.mealType || 'snack',
        logged_at: loggedAtIso
      }, { immediate: true });
      setFoodLogEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: createdRecord.id } : e));
      incrementDataVersion();
      
      // Award XP for food logging via API
      try {
        const xpRes = await apiFetch('/api/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'food_log',
            referenceId: createdRecord.id,
            description: `Logged ${finalFoodName || 'food'}`,
          }),
        });
        const xpData = await xpRes.json();
        if (xpData.success && xpData.awarded) {
          // Show subtle XP toast
          toast({
            title: `+${xpData.awarded} XP`,
            description: xpData.leveledUp 
              ? `🎉 Level Up! You're now Level ${xpData.level}!`
              : undefined,
            duration: xpData.leveledUp ? 4000 : 2000,
          });
        }
      } catch (xpErr) {
        // XP award failed silently - don't affect food logging
      }
    } catch (err: any) {
      console.error('[AppProvider] Error adding food entry:', err);
      // P0 FIX: 409 Conflict should be treated as SUCCESS (idempotency)
      // The record already exists in the database, so we don't need to revert
      const statusCode = err?.status ?? err?.statusCode ?? 0;
      const errorMessage = String(err?.message ?? '').toLowerCase();
      if (statusCode === 409 || errorMessage.includes('409') || errorMessage.includes('conflict')) {
        // Conflict means the record already exists - this is SUCCESS
        console.log('[AppProvider] Food log conflict handled - record exists in database');
        // Keep the optimistic update in the UI, but mark it as synced
        // The sync manager will handle fetching the actual record
        incrementDataVersion();
        return;
      }
      // For other errors, revert UI state to avoid ghost entries
      setFoodLogEntries(prev => prev.filter(e => e.id !== tempId));
      removeNutrition(calories, protein, carbs, fat);
    }
  }, [user?.id, addNutrition, removeNutrition, incrementDataVersion]);

  const updateFoodEntry = useCallback(async (id: string, entry: Partial<FoodLogEntry>) => {
    if (!user?.id) return;
    
    const originalEntry = foodLogEntries.find(e => e.id === id);
    if (!originalEntry) return;

    const updatedEntry = { ...originalEntry, ...entry } as FoodLogEntry;
    
    setFoodLogEntries(prev => prev.map(e => e.id === id ? updatedEntry : e));
    
    const diffCalories = (entry.calories ?? originalEntry.calories) - originalEntry.calories;
    const diffProtein = (entry.protein ?? originalEntry.protein) - originalEntry.protein;
    const diffCarbs = (entry.carbs ?? originalEntry.carbs) - originalEntry.carbs;
    const diffFat = (entry.fat ?? originalEntry.fat) - originalEntry.fat;
    
    addNutrition(diffCalories, diffProtein, diffCarbs, diffFat);

    try {
      // FIX: Use immediate: true to ensure data is persisted to server before returning
      // Note: food_logs table doesn't have a version column, so we don't include it
      await unifiedDataService.update('food_logs', id, {
        food_id: entry.foodId,
        food_name: entry.foodName,
        quantity: entry.quantity,
        unit: entry.unit,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        meal_type: entry.mealType,
      }, { immediate: true });
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error updating food entry:', err);
      setFoodLogEntries(prev => prev.map(e => e.id === id ? originalEntry : e));
      removeNutrition(diffCalories, diffProtein, diffCarbs, diffFat);
    }
  }, [user?.id, foodLogEntries, addNutrition, removeNutrition, incrementDataVersion]);

  const deleteFoodEntry = useCallback(async (id: string) => {
    const entryToDelete = foodLogEntries.find(e => e.id === id);
    if (!entryToDelete) return;

    setFoodLogEntries(prev => prev.filter(e => e.id !== id));
    removeNutrition(entryToDelete.calories, entryToDelete.protein, entryToDelete.carbs, entryToDelete.fat);

    try {
      // FIX: Use immediate: true to ensure deletion is persisted to server before returning
      await unifiedDataService.delete('food_logs', id, { immediate: true });
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error deleting food entry:', err);
      setFoodLogEntries(prev => [entryToDelete, ...prev].sort((a, b) => 
        new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
      ));
      addNutrition(entryToDelete.calories, entryToDelete.protein, entryToDelete.carbs, entryToDelete.fat);
    }
  }, [foodLogEntries, addNutrition, removeNutrition, incrementDataVersion]);

  const addMeasurement = useCallback(async (value: number, unit: string = 'kg') => {
    if (!user?.id) return;
    try {
      // FIX: Use immediate: true to ensure weight is persisted to server before returning
      // This prevents data loss on page refresh
      await unifiedDataService.create('body_metrics', {
        metric_type: 'weight',
        value,
        unit,
        captured_at: new Date().toISOString(),
        source: 'manual'
      }, { immediate: true });
      await fetchMeasurements(false);
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error adding measurement:', err);
    }
  }, [user?.id, fetchMeasurements, incrementDataVersion]);

  const addWorkoutPendingRef = useRef(false);
  const deleteWorkoutPendingRef = useRef(false);

  const addWorkout = useCallback(async (workout: Partial<WorkoutData>) => {
    if (!user?.id) return;
    if (addWorkoutPendingRef.current) return;
    addWorkoutPendingRef.current = true;
    const tempId = generateTempId();
    const now = new Date().toISOString();

    const optimisticWorkout: WorkoutData = {
      ...workout,
      id: tempId,
      startedAt: workout.startedAt || now,
      source: 'manual'
    } as WorkoutData;
    
    setWorkouts(prev => [optimisticWorkout, ...prev]);

    try {
      // FIX: Use immediate: true to ensure workout is persisted to server before returning
      const createdRecord = await unifiedDataService.create('workouts', {
        activity_type: workout.activityType || 'other',
        workout_type: workout.workoutType || 'cardio',
        name: workout.name || null,
        started_at: workout.startedAt || now,
        completed_at: workout.completedAt || null,
        duration_minutes: workout.durationMinutes || null,
        active_duration: workout.activeDuration || null,
        distance_meters: workout.distanceMeters || null,
        calories_burned: workout.caloriesBurned || null,
        training_load: workout.trainingLoad || null,
        recovery_impact: workout.recoveryImpact || null,
        effort_score: workout.effortScore || null,
        avg_pace: workout.avgPace || null,
        avg_heart_rate: workout.avgHeartRate || null,
        max_heart_rate: workout.maxHeartRate || null,
        elevation_gain: workout.elevationGain || null,
        elevation_loss: workout.elevationLoss || null,
        avg_speed: workout.avgSpeed || null,
        max_speed: workout.maxSpeed || null,
        route_data: workout.routeData || null,
        photo_urls: workout.photos || null,
        is_pr: workout.isPR || false,
        pr_type: workout.prType || null,
        notes: workout.notes || null,
        rating: workout.rating || null,
        source: 'manual'
      }, { immediate: true });
      setWorkouts(prev => prev.map(w => w.id === tempId ? { ...w, id: createdRecord.id } : w));
      await fetchWorkouts(false);
      fetchAnalytics();
      incrementDataVersion();
      
      // Award XP for workout
      try {
        const duration = workout.durationMinutes || 0;
        const calories = workout.caloriesBurned || 0;
        let xpAction: 'workout' | 'workout_long' | 'workout_intense' = 'workout';
        
        if (duration >= 60 || calories >= 500) {
          xpAction = 'workout_intense';
        } else if (duration >= 45) {
          xpAction = 'workout_long';
        }
        
        const xpRes = await apiFetch('/api/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: xpAction,
            referenceId: createdRecord.id,
            description: `Completed ${workout.name || workout.activityType || 'workout'}`,
          }),
        });
        const xpData = await xpRes.json();
        if (xpData.success && xpData.awarded) {
          toast({
            title: `+${xpData.awarded} XP 💪`,
            description: xpData.leveledUp 
              ? `🎉 Level Up! You're now Level ${xpData.level}!`
              : `Workout completed!`,
            duration: xpData.leveledUp ? 4000 : 2500,
          });
        }
      } catch (xpErr) {
        // XP award failed silently
      }
    } catch (err) {
      console.error('[AppProvider] Error adding workout:', err);
      setWorkouts(prev => prev.filter(w => w.id !== tempId));
    } finally {
      addWorkoutPendingRef.current = false;
    }
  }, [user?.id, fetchWorkouts, incrementDataVersion]);

  // P0 FIX: Add updateWorkout with version increment for proper conflict resolution
  const updateWorkout = useCallback(async (id: string, updates: Partial<WorkoutData>) => {
    if (!user?.id) return;
    
    // Find current workout for optimistic update
    const currentWorkout = workouts.find(w => w.id === id);
    if (!currentWorkout) {
      console.error('[AppProvider] Workout not found for update:', id);
      return;
    }
    
    // P0 FIX: Increment version for conflict resolution
    const newVersion = (currentWorkout.version || 0) + 1;
    const now = new Date().toISOString();
    
    // Optimistic update with incremented version
    const optimisticUpdate: WorkoutData = {
      ...currentWorkout,
      ...updates,
      version: newVersion,
    };
    
    setWorkouts(prev => prev.map(w => w.id === id ? optimisticUpdate : w));
    
    try {
      // FIX: Use immediate: true to ensure workout is persisted to server before returning
      await unifiedDataService.update('workouts', id, {
        activity_type: updates.activityType,
        workout_type: updates.workoutType,
        name: updates.name,
        started_at: updates.startedAt,
        completed_at: updates.completedAt,
        duration_minutes: updates.durationMinutes,
        active_duration: updates.activeDuration,
        distance_meters: updates.distanceMeters,
        calories_burned: updates.caloriesBurned,
        training_load: updates.trainingLoad,
        recovery_impact: updates.recoveryImpact,
        effort_score: updates.effortScore,
        avg_pace: updates.avgPace,
        avg_heart_rate: updates.avgHeartRate,
        max_heart_rate: updates.maxHeartRate,
        is_pr: updates.isPR,
        pr_type: updates.prType,
        notes: updates.notes,
        rating: updates.rating,
        updated_at: now,
      }, { immediate: true });
      await fetchWorkouts(false);
      fetchAnalytics();
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error updating workout:', err);
      // Revert optimistic update
      setWorkouts(prev => prev.map(w => w.id === id ? currentWorkout : w));
    }
  }, [user?.id, workouts, fetchWorkouts, incrementDataVersion]);

  // P1 FIX: Add deleteWorkout
  const deleteWorkout = useCallback(async (id: string) => {
    if (!user?.id) return;
    if (deleteWorkoutPendingRef.current) return;
    deleteWorkoutPendingRef.current = true;
    
    // Find current workout for potential rollback
    const currentWorkout = workouts.find(w => w.id === id);
    if (!currentWorkout) {
      console.error('[AppProvider] Workout not found for deletion:', id);
      return;
    }
    
    // Optimistic delete
    setWorkouts(prev => prev.filter(w => w.id !== id));
    
    try {
      // FIX: Use immediate: true to ensure workout deletion is persisted to server
      await unifiedDataService.delete('workouts', id, { immediate: true });
      await fetchWorkouts(false);
      fetchAnalytics();
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error deleting workout:', err);
      // Revert: add workout back
      setWorkouts(prev => [currentWorkout, ...prev]);
    } finally {
      deleteWorkoutPendingRef.current = false;
    }
  }, [user?.id, workouts, fetchWorkouts, incrementDataVersion]);

  const syncWorkouts = useCallback(async () => {
    // Sync is handled by SyncManager inside UnifiedDataService
  }, []);
  
  const syncFoodEntries = useCallback(async () => {
    // Sync is handled by SyncManager inside UnifiedDataService
  }, []);

  const addWater = useCallback(async (ml: number) => {
    if (!user?.id) return;
    const tempId = generateTempId();
    const now = new Date().toISOString();
    
    setHydration(prev => {
      const newCurrent = prev.current + ml;
      return {
        ...prev,
        current: newCurrent,
        glasses: Math.floor(newCurrent / 250),
        entries: [{ id: tempId, measurementType: 'water', value: ml, unit: 'ml', capturedAt: now, source: 'manual' }, ...prev.entries]
      };
    });
    
    try {
      // FIX: Use immediate: true to ensure data is persisted to server before returning
      // This prevents data loss on page refresh
      // FIX: Include user_id so fetchHydration can find the records
      const createdRecord = await unifiedDataService.create('body_metrics', {
        user_id: user.id,
        metric_type: 'water',
        value: ml,
        unit: 'ml',
        captured_at: now,
        source: 'manual'
      }, { immediate: true });
      setHydration(prev => ({
        ...prev,
        entries: prev.entries.map(e => e.id === tempId ? { ...e, id: createdRecord.id } : e)
      }));
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error adding water:', err);
      setHydration(prev => {
        const newCurrent = Math.max(0, prev.current - ml);
        return {
          ...prev,
          current: newCurrent,
          glasses: Math.floor(newCurrent / 250),
          entries: prev.entries.filter(e => e.id !== tempId)
        };
      });
    }
  }, [user?.id, incrementDataVersion]);

  const removeLastWater = useCallback(async () => {
    if (!user?.id || hydration.entries.length === 0) return;
    const latestEntry = hydration.entries[0];
    
    setHydration(prev => {
      const newCurrent = Math.max(0, prev.current - latestEntry.value);
      return {
        ...prev,
        current: newCurrent,
        glasses: Math.floor(newCurrent / 250),
        entries: prev.entries.slice(1)
      };
    });
    
    try {
      // FIX: Use immediate: true to ensure deletion is persisted to server before returning
      await unifiedDataService.delete('body_metrics', latestEntry.id, { immediate: true });
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error removing water:', err);
      setHydration(prev => {
        const newCurrent = prev.current + latestEntry.value;
        return {
          ...prev,
          current: newCurrent,
          glasses: Math.floor(newCurrent / 250),
          entries: [latestEntry, ...prev.entries]
        };
      });
    }
  }, [user?.id, hydration, incrementDataVersion]);

  const clearAllWater = useCallback(async () => {
    if (!user?.id) return;
    const previousState = hydration;
    
    setHydration(prev => ({ ...prev, current: 0, glasses: 0, entries: [] }));
    
    try {
      const today = getLocalTodayString();
      // Note: Ideally a bulk delete or specialized UDS function here
      const entries = await unifiedDataService.getAll('body_metrics', {
        filters: { user_id: user.id, metric_type: 'water' }
      });
      // Use proper local date comparison
      const todayEntries = entries.filter((e: any) => isoToLocalDateString(e.captured_at) === today);
      
      // FIX: Use immediate: true for each deletion to ensure persistence
      for (const entry of todayEntries) {
        await unifiedDataService.delete('body_metrics', entry.id, { immediate: true });
      }
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error clearing water:', err);
      setHydration(previousState);
    }
  }, [user?.id, hydration, incrementDataVersion]);

  const updateWaterTarget = useCallback(async (ml: number) => {
    if (!user?.id) return;
    const clampedTarget = Math.max(500, Math.min(5000, ml));
    try {
      const goals = await unifiedDataService.getAll('goals', { filters: { user_id: user.id }, limit: 1 });
      if (goals.length > 0) {
        await unifiedDataService.update('goals', goals[0].id, { goal_type: 'water', target_value: clampedTarget });
      } else {
        await unifiedDataService.create('goals', { goal_type: 'water', target_value: clampedTarget, unit: 'ml' });
      }
      setHydration(prev => ({ ...prev, target: clampedTarget }));
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error updating water target:', err);
    }
  }, [user?.id, incrementDataVersion]);

  const addSteps = useCallback(async (count: number, distance?: number, calories?: number) => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    
    // Optimistic update
    setSteps(prev => ({
      ...prev,
      current: prev.current + count,
      distance: prev.distance + (distance || Math.round(count * 0.762)),
      calories: prev.calories + (calories || Math.round(count * 0.04))
    }));
    
    try {
      // FIX: Use immediate: true to ensure steps are persisted to server before returning
      // FIX: Include user_id so fetchSteps can find the records
      await unifiedDataService.create('body_metrics', {
        user_id: user.id,
        metric_type: 'steps',
        value: count,
        unit: 'count',
        captured_at: now,
        source: 'manual'
      }, { immediate: true });
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error adding steps via UDS:', err);
      // Revert optimism
      setSteps(prev => ({
        ...prev,
        current: Math.max(0, prev.current - count),
        distance: Math.max(0, prev.distance - (distance || Math.round(count * 0.762))),
        calories: Math.max(0, prev.calories - (calories || Math.round(count * 0.04)))
      }));
    }
  }, [user?.id, incrementDataVersion]);

  const updateStepsTarget = useCallback(async (count: number) => {
    if (!user?.id) return;
    const clampedTarget = Math.max(1000, Math.min(30000, count));
    try {
        const goals = await unifiedDataService.getAll('goals', { filters: { user_id: user.id }, limit: 1 });
        if (goals.length > 0) {
            await unifiedDataService.update('goals', goals[0].id, { goal_type: 'steps', target_value: clampedTarget });
        } else {
            await unifiedDataService.create('goals', { goal_type: 'steps', target_value: clampedTarget, unit: 'count' });
        }
      setSteps(prev => ({ ...prev, target: clampedTarget }));
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error updating steps target via UDS:', err);
    }
  }, [user?.id, incrementDataVersion]);

  // Global Refresh using UDS
  const refreshAll = useCallback(async () => {
    if (!userIdRef.current) return;
    try {
      lastFetchTime.current = Date.now();
      await fetchUser(false);
      await fetchTargets();
      // Run these after targets are potentially loaded for correct normalization
      await Promise.all([
        fetchNutrition(false),
        fetchFoodLog(false),
        fetchMeasurements(),
        fetchWorkouts(),
        fetchHydration(false),
        fetchSteps(false),
        fetchAnalytics()
      ]);
      incrementDataVersion();
    } catch (err) {
      console.error('[AppProvider] Error during global refresh:', err);
    }
  }, [fetchUser, fetchTargets, fetchNutrition, fetchFoodLog, fetchMeasurements, fetchWorkouts, fetchHydration, fetchSteps, fetchAnalytics, incrementDataVersion]);

  // Use refs to avoid dependency cascade in realtime callback
  const fetchFunctionsRef = useRef<{
    fetchNutrition: (shouldRefreshCache?: boolean) => Promise<void>;
    fetchFoodLog: (shouldRefreshCache?: boolean) => Promise<void>;
    fetchWorkouts: () => Promise<void>;
    fetchMeasurements: () => Promise<void>;
    fetchTargets: () => Promise<void>;
    fetchUser: (shouldRefreshCache?: boolean) => Promise<void>;
    fetchHydration: (shouldRefreshCache?: boolean) => Promise<void>;
    fetchSteps: (shouldRefreshCache?: boolean) => Promise<void>;
    fetchAnalytics: () => Promise<void>;
    refreshAll: () => Promise<void>;
  }>({
    fetchNutrition,
    fetchFoodLog,
    fetchWorkouts,
    fetchMeasurements,
    fetchTargets,
    fetchUser,
    fetchHydration,
    fetchSteps,
    fetchAnalytics,
    refreshAll,
  });

  // Update refs when functions change (no realtime impact)
  useEffect(() => {
    fetchFunctionsRef.current = {
      fetchNutrition,
      fetchFoodLog,
      fetchWorkouts,
      fetchMeasurements,
      fetchTargets,
      fetchUser,
      fetchHydration,
      fetchSteps,
      fetchAnalytics,
      refreshAll,
    };
  }, [fetchNutrition, fetchFoodLog, fetchWorkouts, fetchMeasurements, fetchTargets, fetchUser, fetchHydration, fetchSteps, fetchAnalytics, refreshAll]);

  // HIGH PRIORITY FIX: Connect realtime hooks for live data sync
  // Stable callback prevents realtime connection churn
  const stableRealtimeHandler = useCallback((_payload: any, tableName: string) => {
    // Increment data version to trigger cache invalidation
    incrementDataVersion();
    
    const {
      fetchNutrition,
      fetchFoodLog,
      fetchWorkouts,
      fetchMeasurements,
      fetchTargets,
      fetchUser,
      fetchHydration,
      fetchSteps,
      fetchAnalytics,
      refreshAll
    } = fetchFunctionsRef.current;
    
    // Refresh relevant data based on table
    switch (tableName) {
      case 'food_logs':
        fetchNutrition?.(false);
        fetchFoodLog?.(false);
        fetchAnalytics?.();
        break;
      case 'workouts':
        fetchWorkouts?.();
        fetchAnalytics?.();
        break;
      case 'body_metrics':
        fetchMeasurements?.();
        fetchHydration?.(false);
        fetchSteps?.(false);
        break;
      case 'goals':
        fetchTargets?.();
        break;
      case 'user_settings':
        // Only refresh user data, don't cascade to full refresh
        fetchUser?.(false);
        break;
      default:
        // Minimal refresh for unknown tables (avoid full refresh)
        console.log(`[AppProvider] Realtime change on ${tableName} - minimal refresh`);
        break;
    }
  }, [incrementDataVersion]); // Only one stable dependency!

  useUserDataRealtime({
    userId: isAuthenticated && user?.id ? user.id : null,
    onDataChange: stableRealtimeHandler,
    enabled: isAuthenticated,
  });

  // Track whether initial data load has fired to prevent re-trigger
  // from refreshAll reference changes.
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!isAuthenticated) {
      initialLoadDone.current = false; // Reset on sign-out
      profileFailCountRef.current = 0; // Reset circuit breaker
      setUserLoading(false);
      setTargetsLoading(false);
      setNutritionLoading(false);
      setFoodLogLoading(false);
      setMeasurementsLoading(false);
      setWorkoutsLoading(false);
      setHydrationLoading(false);
      setStepsLoading(false);
      setAnalyticsLoading(false);
      return;
    }

    // Only run once per auth session — subsequent refreshes happen via
    // tab-focus, profile events, and explicit user actions.
    if (initialLoadDone.current) return;
    
    // CRITICAL FIX: Wait for user to be bootstrapped from auth
    if (!user?.id) return;

    initialLoadDone.current = true;
    refreshAll();
  }, [isAuthenticated, authLoading, refreshAll, user?.id]);

  useEffect(() => {
    // Debounce visibility change handler to prevent rapid refreshes
    let visibilityTimeout: ReturnType<typeof setTimeout> | null = null;
    // Track the last known date to detect midnight crossing
    let lastKnownDate = getLocalTodayString();
    // Track last sync time to avoid over-refreshing
    let lastSyncTime = 0;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        // Clear any pending refresh
        if (visibilityTimeout) {
          clearTimeout(visibilityTimeout);
        }
        
        // Check if we crossed midnight while away
        const currentDate = getLocalTodayString();
        const dateChanged = currentDate !== lastKnownDate;
        
        if (dateChanged) {
          lastKnownDate = currentDate;
          // Update selected food date to today
          setSelectedFoodDate(currentDate);
        }
        
        // Only refresh if significant time has passed or date changed
        const timeSinceLastSync = Date.now() - lastSyncTime;
        const shouldRefresh = dateChanged || timeSinceLastSync > 5 * 60 * 1000; // 5 minutes
        
        if (shouldRefresh) {
          // Debounce: wait 300ms before refreshing
          visibilityTimeout = setTimeout(() => {
            lastSyncTime = Date.now();
            fetchFunctionsRef.current.refreshAll?.();
          }, 300);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]); // Remove refreshAll dependency
  
  // ═══════════════════════════════════════════════════════════════
  // MIDNIGHT RESET - Auto-refresh when date changes
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Track the current date to detect midnight crossing
    let lastCheckedDate = getLocalTodayString();
    
    // Check every minute if the date has changed
    const midnightCheckInterval = setInterval(() => {
      const currentDate = getLocalTodayString();
      
      if (currentDate !== lastCheckedDate) {
        lastCheckedDate = currentDate;
        
        // Update selected food date to the new day
        setSelectedFoodDate(currentDate);
        
        // Refresh all data for the new day using ref
        fetchFunctionsRef.current.refreshAll?.();
      }
    }, 60000); // Check every minute
    
    return () => {
      clearInterval(midnightCheckInterval);
    };
  }, [isAuthenticated, refreshAll]);

  // Refetch food logs and nutrition when selected date changes
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    // Only fetch after initial load is done
    if (!initialLoadDone.current) return;
    fetchFoodLog(false);
    fetchNutrition(false);
  }, [selectedFoodDate, isAuthenticated, user?.id, fetchFoodLog, fetchNutrition]);

  const value = useMemo<AppContextType>(() => ({
    user,
    userProfile,
    userLoading,
    refetchUser: () => fetchUser(false),
    targets,
    targetsLoading,
    refetchTargets: fetchTargets,
    nutrition,
    nutritionLoading,
    refetchNutrition: () => fetchNutrition(false),
    addNutrition,
    removeNutrition,
    foodLogEntries,
    foodLogLoading,
    foodLogSyncing,
    refetchFoodLog: () => fetchFoodLog(false),
    addFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    selectedFoodDate,
    setSelectedFoodDate,
    goToToday,
    measurements,
    latestWeight,
    measurementsLoading,
    refetchMeasurements: () => fetchMeasurements(false),
    addMeasurement,
    workouts,
    workoutSummary,
    workoutsLoading,
    refetchWorkouts: () => fetchWorkouts(false),
    addWorkout,
    updateWorkout,
    deleteWorkout,
    isOnline,
    offlineWorkouts,
    offlineFoodEntries,
    offlineStats,
    isSyncing,
    syncWorkouts,
    syncFoodEntries,
    hydration,
    hydrationLoading,
    hydrationSyncing,
    refetchHydration: () => fetchHydration(false),
    addWater,
    removeLastWater,
    clearAllWater,
    updateWaterTarget,
    steps,
    stepsLoading,
    stepsSyncing,
    refetchSteps: () => fetchSteps(false),
    addSteps,
    updateStepsTarget,
    analyticsData,
    analyticsLoading,
    analyticsError,
    refetchAnalytics: fetchAnalytics,
    refreshAll,
    dataVersion,
    userSettings,
    setUserSettings,
  }), [
    user, userProfile, userLoading, fetchUser, targets, targetsLoading, fetchTargets,
    nutrition, nutritionLoading, fetchNutrition, addNutrition, removeNutrition,
    foodLogEntries, foodLogLoading, foodLogSyncing, fetchFoodLog, addFoodEntry, updateFoodEntry, deleteFoodEntry,
    selectedFoodDate, setSelectedFoodDate, goToToday,
    measurements, latestWeight, measurementsLoading, fetchMeasurements, addMeasurement,
    workouts, workoutSummary, workoutsLoading, fetchWorkouts, addWorkout, updateWorkout, deleteWorkout,
    isOnline, offlineWorkouts, offlineFoodEntries, offlineStats, isSyncing, syncWorkouts, syncFoodEntries,
    hydration, hydrationLoading, hydrationSyncing, fetchHydration, addWater, removeLastWater, clearAllWater, updateWaterTarget,
    steps, stepsLoading, stepsSyncing, fetchSteps, addSteps, updateStepsTarget,
    analyticsData, analyticsLoading, analyticsError, fetchAnalytics, refreshAll, dataVersion,
    userSettings, setUserSettings,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
