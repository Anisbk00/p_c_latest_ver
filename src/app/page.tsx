"use client";
// Production-ready fitness app with error handling and tab focus refresh
// Updated: 2024 - Auth system fix
// Performance: Lazy-loaded tab pages for faster initial load
import React, { useState, useEffect, useCallback, useMemo, useRef, useId, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Utensils,
  BarChart3,
  User,
  Plus,
  Sparkles,
  Target,
  Activity,
  Scale,
  Dumbbell,
  Droplets,
  Footprints,
  Sun,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  Award,
  Zap,
  Heart,
  TrendingUp,
  Coffee,
  Apple,
  Brain,
  WifiOff,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// OnboardingFlow removed — personalization is handled by the DB-backed SetupModal
// ═══════════════════════════════════════════════════════════════
// LAZY LOADED TAB PAGES - Reduces initial bundle by ~60%
// Each page is loaded on-demand when the user navigates to it
// ═══════════════════════════════════════════════════════════════
const AnalyticsPage = lazy(() => import('@/components/fitness/analytics-page').then(m => ({ default: m.AnalyticsPage })));
const FoodsPage = lazy(() => import('@/components/fitness/foods-page').then(m => ({ default: m.FoodsPage })));
const WorkoutsPage = lazy(() => import('@/components/fitness/workouts-page-v2').then(m => ({ default: m.WorkoutsPage })));
const ProfilePage = lazy(() => import('@/components/fitness/profile-page').then(m => ({ default: m.ProfilePage })));
const IronCoach = lazy(() => import('@/components/iron-coach/iron-coach-chat').then(m => ({ default: m.IronCoach })));
const SettingsSheet = lazy(() => import('@/components/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));

// Preload lazy components immediately for faster navigation
if (typeof window !== 'undefined') {
  // Preload home tab components after initial render
  requestAnimationFrame(() => {
    import('@/components/fitness/analytics-page');
    import('@/components/fitness/foods-page');
    import('@/components/fitness/workouts-page-v2');
    import('@/components/fitness/profile-page');
    import('@/components/settings/SettingsPage');
  });
}

// Direct imports for components used on every render (no lazy loading)
import { SplashScreen } from "@/components/splash-screen";
import { useApp, type TodayWorkoutSummary, type FoodLogEntry, calculateStreak, toFiniteNumber } from "@/contexts/app-context";
import { format, subDays, isToday } from "date-fns";

import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/lib/supabase/auth-context";
import { SupabaseAuthScreen } from "@/components/auth/supabase-auth-screen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTabFocus, useIntervalWithRef } from "@/hooks/use-tab-focus";
import { useKeyboardVisibility } from "@/hooks/use-safe-area";
import { 
  sanitizeUrl, 
  devError 
} from "@/lib/security-utils";
import { useLocale } from "@/lib/i18n/locale-context";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Target calories for a reasonable workout session */
const WORKOUT_CALORIE_TARGET = 300;

/** Animation duration for score animations in ms */
const SCORE_ANIMATION_DURATION = 1000;

// ═══════════════════════════════════════════════════════════════
// Animation Variants (Reduces jank by using staggerChildren)
// ═══════════════════════════════════════════════════════════════

/** 
 * Staggered container animation - children animate sequentially
 * Use with: variants={staggerContainer} on parent motion element
 */
const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08, // 80ms between each child
      delayChildren: 0.1, // Initial delay before first child
    },
  },
} as const;

/**
 * Fade up animation for children in a stagger container
 * Use with: variants={fadeInUp} on child motion elements
 */
const fadeInUp = {
  hidden: { opacity: 0, y: 10 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

/**
 * Fade in animation for simple reveals
 * Use with: variants={fadeIn} on child motion elements
 */
const fadeIn = {
  hidden: { opacity: 0 },
  show: { 
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

/**
 * Scale animation for score circles
 */
const scaleIn = {
  hidden: { scale: 0.8, opacity: 0 },
  show: { 
    scale: 1, 
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

// TodayWorkoutSummary and FoodLogEntry are imported from app-context for consistency

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate hydration percentage from current and target values
 * Returns 0 if target is 0 to avoid division by zero
 */
function calculateHydrationPercent(current: number, target: number): number {
  return target > 0 ? (current / target) * 100 : 0;
}

function calculatePercent(current: unknown, target: unknown): number {
  const safeCurrent = toFiniteNumber(current, 0);
  const safeTarget = toFiniteNumber(target, 0);
  if (safeTarget <= 0) return 0;
  return (safeCurrent / safeTarget) * 100;
}

/**
 * Check if hydration level is at dangerous levels
 * Dangerous: >150% (overhydration) or <25% (dehydration) with some intake
 */
function isHydrationDangerous(percent: number): boolean {
  return percent > 150 || (percent > 0 && percent < 25);
}

// ═══════════════════════════════════════════════════════════════
// PAGE LOADER - Subtle skeleton shimmer for lazy-loaded pages
// ═══════════════════════════════════════════════════════════════

function PageLoader() {
  return (
    <div 
      className="flex flex-col gap-4 p-4 min-h-[60vh]"
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
    >
      {/* Skeleton cards with shimmer effect */}
      {[1, 2, 3].map((i) => (
        <div 
          key={i}
          className="rounded-2xl bg-muted/50 animate-pulse overflow-hidden"
          style={{ 
            height: i === 1 ? '120px' : i === 2 ? '180px' : '100px',
            animationDelay: `${i * 100}ms`
          }}
        >
          <div className="h-full w-full bg-linear-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
        </div>
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════════

const OfflineIndicator = React.memo(function OfflineIndicator({ 
  isOnline, 
  pendingSyncCount 
}: { 
  isOnline: boolean; 
  pendingSyncCount: number;
}) {
  const { t } = useLocale();
  
  // Don't show anything if online with no pending syncs
  if (isOnline && pendingSyncCount === 0) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-5 py-2"
      role="status"
      aria-live="polite"
    >
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border",
        isOnline 
          ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
          : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
      )}>
        {isOnline ? (
          <>
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {t('offline.syncing')} {pendingSyncCount} item{pendingSyncCount !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
                {t('offline.uploading')}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
              <WifiOff className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                {t('offline.title')}
              </p>
              <p className="text-xs text-rose-600/70 dark:text-rose-400/70">
                {t('offline.willSync')}
              </p>
            </div>
            {pendingSyncCount > 0 && (
              <div className="px-2 py-1 rounded-full bg-rose-200 dark:bg-rose-800">
                <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
                  {pendingSyncCount} {t('offline.pending')}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
});

// ═══════════════════════════════════════════════════════════════
// MODULE-LEVEL SPLASH STATE
// This survives component remounts and prevents splash on back navigation
// ═══════════════════════════════════════════════════════════════
let __splashHasBeenShown = false;
// Pre-check sessionStorage synchronously at module load to prevent splash flash on back-nav.
// This runs before React hydration, preventing even a single frame of splash.
// Checks both return-to-profile (from settings back button) and skip-splash (general flag).
try {
  if (typeof window !== 'undefined') {
    if (sessionStorage.getItem('return-to-profile') === 'true' ||
        sessionStorage.getItem('skip-splash') === 'true') {
      __splashHasBeenShown = true;
    }
  }
} catch {}

// ═══════════════════════════════════════════════════════════════
// PREMIUM HOME SCREEN - Apple-Level Design
// ═══════════════════════════════════════════════════════════════

function ProgressCompanionHome() {
  const { isAuthenticated, isLoading: authLoading } = useSupabaseAuth();
  const { t } = useLocale();
  const [mounted, setMounted] = useState(false);
  
  // SPLASH STATE - Initialize properly on client only
  // On server: always show splash (splashVisible=true, skipSplash=false)
  // On client: check if we should skip based on navigation type
  // Use module-level flag as initial state to prevent flash of splash on back-nav
  const [skipSplash, setSkipSplash] = useState(__splashHasBeenShown);
  const [splashVisible, setSplashVisible] = useState(!__splashHasBeenShown);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  
  // Ref-based splash skip guard — survives re-renders, double effects, and state reset.
  // Once set to true, NOTHING can re-enable the splash for this component lifecycle.
  const splashSkippedRef = useRef(__splashHasBeenShown);
  
  // Check if returning from settings - go to profile tab
  const [activeTab, setActiveTab] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  
  // Initialize splash state on client mount ONLY
  useEffect(() => {
    // ═══ CRITICAL: Check if this is internal navigation from settings ═══
    // This must run BEFORE any other splash logic to prevent flash.
    // The ref guard ensures that even if this effect runs multiple times
    // (React Strict Mode), the splash can never be re-enabled.
    const returnToProfile = sessionStorage.getItem('return-to-profile');
    const skipSplashFlag = sessionStorage.getItem('skip-splash');
    
    if (returnToProfile === 'true' || skipSplashFlag === 'true') {
      // Immediately lock splash skip — no future effect can undo this
      splashSkippedRef.current = true;
      __splashHasBeenShown = true;
      // Clear all splash-related sessionStorage flags
      sessionStorage.removeItem('return-to-profile');
      sessionStorage.removeItem('skip-splash');
      document.documentElement.classList.remove('no-splash');
      // Remove the inline <style> guard injected by layout.tsx — React now controls visibility
      try { document.getElementById('splash-skip-guard')?.remove(); } catch {}
      // Switch to profile tab if returning from settings
      if (returnToProfile === 'true') {
        setActiveTab('profile');
      }
      // Force splash off — use flushSync-like batching by setting state directly
      setSkipSplash(true);
      setSplashVisible(false);
      // Do NOT check navigation type — splash is permanently disabled for this mount
      return;
    }
    
    // If the ref guard is already set (from module-level check), skip everything
    if (splashSkippedRef.current) {
      setSkipSplash(true);
      setSplashVisible(false);
      return;
    }
    
    // Clean up no-splash class if present (CSS guard handled initial paint, React takes over)
    document.documentElement.classList.remove('no-splash');
    
    // Check navigation type — ONLY for non-skip scenarios
    try {
      const navEntries = performance.getEntriesByType('navigation');
      const navEntry = navEntries[0] as PerformanceNavigationTiming | undefined;
      const navigationType = navEntry?.type;
      
      // 'reload' = page refresh, 'navigate' = fresh navigation
      // 'back_forward' = browser back/forward — skip splash
      const isFreshLoad = navigationType === 'reload' || navigationType === 'navigate';
      
      if (isFreshLoad) {
        // Fresh page load or refresh - show splash
        sessionStorage.removeItem('splash-shown');
        __splashHasBeenShown = false;
        setSkipSplash(false);
        setSplashVisible(true);
      } else {
        // Back/forward or other - always skip
        splashSkippedRef.current = true;
        __splashHasBeenShown = true;
        setSkipSplash(true);
        setSplashVisible(false);
      }
    } catch {
      // Fallback: check module flag
      if (__splashHasBeenShown) {
        splashSkippedRef.current = true;
        setSkipSplash(true);
        setSplashVisible(false);
      }
    }
  }, []); // Run once on mount
  
  // Start minimum time timer (2 seconds — reduced for faster perceived load)
  useEffect(() => {
    if (skipSplash || splashSkippedRef.current) return;
    
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2000); // 2 seconds minimum display (reduced from 4s)
    
    return () => clearTimeout(timer);
  }, [skipSplash]);
  
  // Mount flag
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Dynamic safe area handling for keyboard/notch changes
  const { isVisible: isKeyboardVisible } = useKeyboardVisibility();
  
  // Global refresh lock using ref to prevent race conditions
  // This prevents tab focus refresh from triggering while context is still syncing
  const isRefreshInProgressRef = useRef(false);
  
  // Cross-tab synchronization using BroadcastChannel
  // PERF-FIX: Use a single shared channel ref for both sending and receiving
  // to avoid creating new channels on every broadcast call
  const activeTabRef = useRef(activeTab);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Create single shared channel for both send and receive
    const channel = new BroadcastChannel('progress-companion-sync');
    broadcastChannelRef.current = channel;
    
    // Listen for messages from other tabs
    channel.onmessage = (event) => {
      const { type, payload } = event.data;
      
      switch (type) {
        case 'TAB_CHANGE':
          // Another tab changed to a different tab - sync our tab state
          // BUG-H002 FIX: Read from ref, not stale closure
          if (payload?.tab && payload.tab !== activeTabRef.current) {
            setActiveTab(payload.tab);
          }
          break;
        case 'DATA_REFRESH':
          // Another tab triggered a data refresh - refresh our data too
          if (!isRefreshInProgressRef.current) {
            handleRefreshRef.current();
          }
          break;
        case 'FOOD_LOGGED':
        case 'WORKOUT_LOGGED':
        case 'GOAL_CHANGED':
          // Data was modified in another tab - trigger a refresh
          if (!isRefreshInProgressRef.current) {
            handleRefreshRef.current();
          }
          break;
      }
    };
    
    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  // BUG-H002 FIX: Empty dep array — activeTab read via ref, handleRefresh is stable
   
  }, []);
  
  // Broadcast tab changes to other tabs using shared channel
  const broadcastTabChange = useCallback((tab: string) => {
    if (typeof window === 'undefined') return;
    
    // Use shared channel if available, otherwise create temp channel
    const channel = broadcastChannelRef.current ?? new BroadcastChannel('progress-companion-sync');
    channel.postMessage({ type: 'TAB_CHANGE', payload: { tab } });
    
    // Only close if we created a temp channel (shouldn't happen in normal use)
    if (!broadcastChannelRef.current) {
      channel.close();
    }
  }, []);
  
  // Global Context - All data is shared across all pages
  const {
    user,
    userSettings,
    userLoading,
    targets,
    targetsLoading,
    nutrition,
    nutritionLoading,
    refetchNutrition,
    foodLogEntries,
    foodLogLoading,
    refetchFoodLog,
    latestWeight,
    measurements,
    measurementsLoading,
    workoutSummary,
    workoutsLoading,
    refetchWorkouts,
    hydration,
    hydrationLoading,
    steps,
    stepsLoading,
    analyticsData,
    analyticsLoading,
    targets: targetsData,
    isOnline,
    offlineStats,
    dataVersion,
  } = useApp();
  
  // ═══════════════════════════════════════════════════════════════
  // STABLE PRIMITIVE EXTRACTION (Prevents excessive re-renders)
  // ═══════════════════════════════════════════════════════════════
  // Deep objects like `targets` and `analyticsData` create new references
  // on every parent render. Extract stable primitives for useMemo deps.
  
  // Extract target primitives with stable references
  const primaryGoal = targets?.primaryGoal;
  const targetCalories = targets?.calories;
  const targetProtein = targets?.protein;
  
  // Extract analytics primitives with stable references  
  const analyticsCaloricBalanceScore = analyticsData?.nutrition?.caloricBalanceScore;
  const analyticsProteinScore = analyticsData?.nutrition?.proteinScore;
  const analyticsVolumeScore = analyticsData?.training?.volumeScore;
  const analyticsRecoveryScore = analyticsData?.training?.recoveryScore;
  const analyticsTrend = analyticsData?.trend;
  const analyticsPercentChange = analyticsData?.percentChange;

  // Live timestamp that updates every minute to keep greeting accurate
  const [currentTimestamp, setCurrentTimestamp] = useState(() => new Date());
  
  // Update timestamp every minute to ensure greeting stays correct after midnight
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimestamp(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);
  
  // Use centralized streak calculation from context (eliminates duplicate logic)
  const userStreak = useMemo(() => calculateStreak(foodLogEntries), [foodLogEntries]);
  
  // REMOVED: dataVersion watcher was causing excessive refetches
  // The context already handles data synchronization through its own effects
  // Cross-component updates are handled by the context's refreshAll mechanism
  
  // Compute intelligent greeting using computed userStreak (deterministic)
  // PRIORITY: Always show time-based greeting first, then userName
  // Streak info is shown separately in the insight line below greeting
  const greeting = useMemo(() => {
    const hour = currentTimestamp.getHours();
    // Always return time-based greeting - streak info is in the insight line
    return hour < 12 ? t('home.greeting.morning') : hour < 17 ? t('home.greeting.afternoon') : t('home.greeting.evening');
  }, [currentTimestamp, t]);
  
  // ═══════════════════════════════════════════════════════════════
  // GOAL-AWARE BODY INTELLIGENCE SCORE
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Body Intelligence Score (0-100) - Goal-Aware Calculation
   * 
   * Weights are dynamically adjusted based on user's primary goal:
   * - fat_loss: Prioritize calorie deficit adherence, protein retention, activity
   * - muscle_gain: Prioritize protein intake, workout intensity, calorie surplus
   * - recomposition: Balance muscle preservation with fat loss
   * - maintenance: Equal balance of all health factors
   * 
   * When analytics data is available, uses computed scores (caloricBalanceScore, 
   * proteinScore, recoveryScore) for more accurate assessment.
   */
  // Stabilize body score with ref to prevent rapid recalculation
  const bodyScoreRef = useRef<{ score: number; confidence: number; isDefaultGoal: boolean } | null>(null);
  const lastBodyScoreInputsRef = useRef<string>('');
  
  const bodyScore = useMemo(() => {
    // Get goal with explicit warning for default assumption
    // Use stable primitive extracted at component level
    const explicitGoal = primaryGoal?.toLowerCase();
    const goal = explicitGoal || 'maintenance';
    const isDefaultGoal = !explicitGoal; // Flag for UI warning
    
    // Create a hash of inputs to detect actual changes vs object reference changes
    const inputHash = JSON.stringify({
      goal,
      calCurr: nutrition.calories.current,
      calTarg: nutrition.calories.target,
      proCurr: nutrition.protein.current,
      proTarg: nutrition.protein.target,
      workoutCal: workoutSummary?.totalCalories,
      workoutCount: workoutSummary?.workoutCount,
      hydrationCurr: hydration.current,
      hydrationTarg: hydration.target,
      streak: userStreak,
      analyticsCal: analyticsCaloricBalanceScore,
      analyticsPro: analyticsProteinScore,
      analyticsVol: analyticsVolumeScore,
      analyticsRec: analyticsRecoveryScore,
      analyticsTrend: analyticsTrend,
      analyticsPct: analyticsPercentChange,
      analyticsLoad: analyticsLoading,
      foodLogLen: foodLogEntries?.length,
    });
    
    // If inputs haven't actually changed, return cached result
    if (inputHash === lastBodyScoreInputsRef.current && bodyScoreRef.current) {
      return bodyScoreRef.current;
    }
    lastBodyScoreInputsRef.current = inputHash;
    
    // ═══════════════════════════════════════════════════════════
    // ADAPTIVE WEIGHT CONFIGURATIONS
    // Weights can be adjusted based on user behavior patterns
    // ═══════════════════════════════════════════════════════════
    const BASE_GOAL_WEIGHTS: Record<string, {
      calories: number;
      protein: number;
      workout: number;
      hydration: number;
      streak: number;
      trend: number;
    }> = {
      fat_loss: {
        // For fat loss: calorie deficit is primary, protein preserves muscle, activity burns fat
        calories: 30,  // Highest - tracking deficit is critical
        protein: 25,   // High - prevent muscle loss during deficit
        workout: 20,   // Important - additional calorie burn
        hydration: 10, // Moderate - supports metabolism
        streak: 10,    // Moderate - consistency matters
        trend: 5,      // Lower - weight will fluctuate
      },
      muscle_gain: {
        // For muscle gain: protein and workout are primary, surplus is managed
        calories: 15,  // Lower - surplus is easier to hit
        protein: 30,   // Highest - muscle building blocks
        workout: 30,   // Highest - stimulus for growth
        hydration: 10, // Moderate - supports recovery
        streak: 10,    // Moderate - consistency in training
        trend: 5,      // Lower - gradual weight gain expected
      },
      recomposition: {
        // For recomposition: balance between building muscle and losing fat
        calories: 20,  // Moderate - need controlled deficit
        protein: 25,   // High - essential for both goals
        workout: 25,   // High - drives both processes
        hydration: 10, // Moderate
        streak: 10,    // Moderate
        trend: 10,     // Higher - tracking body composition change
      },
      maintenance: {
        // For maintenance: equal balance of all health factors
        calories: 20,
        protein: 20,
        workout: 20,
        hydration: 15,
        streak: 15,
        trend: 10,
      },
    };
    
    // Calculate adaptive weights based on user behavior
    // If user has more workouts than food logs, increase workout weight
    const workoutCount = workoutSummary?.workoutCount || 0;
    const foodLogCount = foodLogEntries?.length || 0;
    const activityBias = workoutCount > foodLogCount ? 1.1 : 1.0; // Boost workout weight if more active
    
    const weights = { ...BASE_GOAL_WEIGHTS[goal] || BASE_GOAL_WEIGHTS.maintenance };
    // Apply adaptive adjustment
    weights.workout = Math.min(35, Math.round(weights.workout * activityBias));
    // Rebalance other weights
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight !== 100) {
      const scale = 100 / totalWeight;
      Object.keys(weights).forEach(key => {
        weights[key as keyof typeof weights] = Math.round(weights[key as keyof typeof weights] * scale);
      });
    }
    
    // Track confidence for the score
    let scoreConfidence = 100;
    if (isDefaultGoal) scoreConfidence -= 20; // Less confident if goal is assumed
    
    // ═══════════════════════════════════════════════════════════
    // USE ANALYTICS SCORES WHEN AVAILABLE (more accurate)
    // ═══════════════════════════════════════════════════════════
    
    let calorieScore: number;
    let proteinScore: number;
    let workoutScore: number;
    let trendScore: number;
    
    // Check if analytics data is available using stable primitive references
    const hasAnalyticsData = analyticsCaloricBalanceScore !== undefined || 
                              analyticsProteinScore !== undefined;
    
    if (hasAnalyticsData && !analyticsLoading) {
      // Use pre-calculated analytics scores (0-100 scale)
      
      // Calorie score from analytics caloricBalanceScore
      // This considers not just hitting target but timing and consistency
      calorieScore = (analyticsCaloricBalanceScore || 50) / 100 * weights.calories;
      
      // Protein score from analytics
      proteinScore = (analyticsProteinScore || 50) / 100 * weights.protein;
      
      // Workout score from training volume and recovery
      const volumeScore = analyticsVolumeScore || 50;
      const recoveryScore = analyticsRecoveryScore || 50;
      workoutScore = ((volumeScore * 0.6 + recoveryScore * 0.4) / 100) * weights.workout;
      
      // Trend score based on goal alignment
      const weightTrend = analyticsTrend;
      const percentChange = analyticsPercentChange || 0;
      
      if (goal === 'fat_loss') {
        trendScore = weightTrend === 'up' 
          ? weights.trend * Math.min(0.5 + Math.abs(percentChange) / 20, 1)
          : weightTrend === 'down' 
          ? weights.trend * 0.3  // Gaining weight when trying to lose
          : weights.trend * 0.7; // Stable
      } else if (goal === 'muscle_gain') {
        trendScore = weightTrend === 'down'
          ? weights.trend * Math.min(0.5 + Math.abs(percentChange) / 20, 1)
          : weightTrend === 'up'
          ? weights.trend * 0.3  // Losing weight when trying to gain
          : weights.trend * 0.7;
      } else {
        trendScore = weights.trend * 0.7; // Neutral for maintenance/recomp
      }
    } else {
      // Fallback: Calculate from current data when analytics not available
      const calorieTarget = nutrition.calories.target || 0;
      const calorieProgress = Math.min((nutrition.calories.current || 0) / Math.max(calorieTarget, 1), 1.5);
      
      const proteinTarget = nutrition.protein.target || 0;
      const proteinProgress = Math.min((nutrition.protein.current || 0) / Math.max(proteinTarget, 1), 1.5);
      
      const workoutProgress = Math.min((workoutSummary?.totalCalories || 0) / Math.max(300, 1), 1.5);
      
      // For fat_loss, exceeding calories is negative; for muscle_gain, it can be positive
      if (goal === 'fat_loss' && calorieProgress > 1) {
        calorieScore = weights.calories * Math.max(0.5 - (calorieProgress - 1), 0.2);
      } else if (goal === 'muscle_gain' && calorieProgress < 0.9) {
        calorieScore = weights.calories * calorieProgress * 0.8; // Penalty for undereating
      } else {
        calorieScore = Math.min(calorieProgress * weights.calories, weights.calories);
      }
      
      proteinScore = Math.min(proteinProgress * weights.protein, weights.protein);
      workoutScore = Math.min(workoutProgress * weights.workout, weights.workout);
      trendScore = weights.trend * 0.5; // Neutral when no trend data
    }
    
    // ═══════════════════════════════════════════════════════════
    // HYDRATION AND STREAK (always calculated from current data)
    // ═══════════════════════════════════════════════════════════
    const hydrationTarget = hydration.target || 0;
    const hydrationProgress = Math.min((hydration.current || 0) / Math.max(hydrationTarget, 1), 1.5);
    const hydrationScore = Math.min(hydrationProgress * weights.hydration, weights.hydration);
    
    const streakProgress = Math.min(userStreak / 30, 1); // 30 days = max streak bonus
    const streakScore = streakProgress * weights.streak;
    
    // ═══════════════════════════════════════════════════════════
    // FINAL SCORE
    // ═══════════════════════════════════════════════════════════
    const finalScore = Math.round(
      Math.max(0, Math.min(100, calorieScore + proteinScore + workoutScore + hydrationScore + streakScore + trendScore))
    );

    // Reduce confidence if analytics data is not available
    if (!hasAnalyticsData || analyticsLoading) scoreConfidence -= 30;
    if (!workoutSummary) scoreConfidence -= 10;
    if (foodLogCount < 3) scoreConfidence -= 15; // Not enough food data

    const result = { score: finalScore, confidence: Math.max(20, scoreConfidence), isDefaultGoal };
    bodyScoreRef.current = result;
    return result;
  }, [
    // Use stable primitives instead of deep object references
    primaryGoal,
    nutrition.calories.current,
    nutrition.calories.target,
    nutrition.protein.current,
    nutrition.protein.target,
    workoutSummary?.totalCalories,
    workoutSummary?.workoutCount,
    hydration.current,
    hydration.target,
    userStreak,
    // Stable analytics primitives instead of analyticsData object
    analyticsCaloricBalanceScore,
    analyticsProteinScore,
    analyticsVolumeScore,
    analyticsRecoveryScore,
    analyticsTrend,
    analyticsPercentChange,
    analyticsLoading,
    foodLogEntries?.length,
  ]);

  // Destructure body score results
  const { score: bodyScoreValue, confidence: bodyScoreConfidence, isDefaultGoal } = bodyScore;

  // ─── AI Home Insights ──────────────────────────────────────
  const [aiInsightText, setAiInsightText] = React.useState<string | undefined>();
  const [aiInsightSource, setAiInsightSource] = React.useState<'ai' | 'rule' | undefined>();
  const [aiAggregateData, setAiAggregateData] = React.useState<{
    hydrationMl: number;
    caloriesBurned: number;
    proteinG: number;
    caloriesConsumed: number;
    streak: number;
    workoutsThisWeek: number;
    weightTrend: string;
    primaryGoal: string;
    hasFoodToday: boolean;
    hasWorkoutToday: boolean;
  } | null>(null);
  const [aiInsightsList, setAiInsightsList] = React.useState<Array<{
    title: string;
    description: string;
    actionSuggestion?: string;
    category: string;
    confidence: number;
    dataSources: string[];
  }>>([]);

  React.useEffect(() => {
    let cancelled = false;
    const fetchInsights = async () => {
      try {
        const res = await fetch('/api/ai/home-insights');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          if (data.bodyIntelligenceInsight) {
            setAiInsightText(data.bodyIntelligenceInsight);
            setAiInsightSource(data.source || 'rule');
          }
          if (data.aggregateData) {
            setAiAggregateData(data.aggregateData);
          }
          if (data.insights?.length) {
            setAiInsightsList(data.insights);
          }
        }
      } catch {
        // Silently fail — fallback insight will show
      }
    };
    fetchInsights();
    return () => { cancelled = true; };
  }, [foodLogEntries?.length]);

  // Progress trend
  const progressTrend = useMemo(() => {
    if (latestWeight && measurements.length > 1) {
      const prev = measurements[1]?.value;
      const curr = latestWeight.value;
      if (curr < prev) return 'up';
      if (curr > prev) return 'down';
    }
    return 'stable';
  }, [latestWeight, measurements]);

  // Daily Action Modules - Real data from APIs
  const actionModules = [
    {
      id: 'nutrition',
      icon: Utensils,
      label: t('dashboard.nutrition'),
      value: Math.round(calculatePercent(nutrition.protein.current, nutrition.protein.target)),
      color: 'from-emerald-400 to-teal-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      comingSoon: false,
    },
    {
      id: 'hydration',
      icon: Droplets,
      label: t('dashboard.hydration'),
      value: Math.round(calculatePercent(hydration.current, hydration.target)),
      color: 'from-cyan-400 to-teal-500',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
      comingSoon: false,
    },
    {
      id: 'activity',
      icon: Footprints,
      label: t('dashboard.steps'),
      value: Math.round(calculatePercent(steps.current, steps.target)),
      color: 'from-emerald-400 to-teal-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      comingSoon: false,
    },
    {
      id: 'workout',
      icon: Dumbbell,
      label: t('dashboard.workout'),
      value: Math.min(100, Math.round(calculatePercent(workoutSummary?.totalCalories, WORKOUT_CALORIE_TARGET))),
      color: 'from-emerald-400 to-teal-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      comingSoon: false,
    },
  ];

  // Tabs - Unified Living System
  const tabs = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'workouts', label: t('nav.workouts'), icon: Activity },
    { id: 'foods', label: t('nav.foods'), icon: Utensils },
    { id: 'analytics', label: t('nav.intelligence'), icon: BarChart3 },
    { id: 'profile', label: t('nav.profile'), icon: User },
  ];
  
  // Pull to refresh with proper error handling and state recovery
  // Uses ref-based lock to prevent race conditions with tab focus refresh
  const handleRefresh = useCallback(async () => {
    // Check ref-based lock first (prevents race with tab focus)
    if (isRefreshInProgressRef.current) return;
    
    // Set both state and ref lock
    isRefreshInProgressRef.current = true;
    setIsRefreshing(true);
    setRefreshError(null);
    
    try {
      // Use Promise.allSettled to ensure all requests complete even if some fail
      const results = await Promise.allSettled([
        refetchNutrition(),
        refetchWorkouts(),
      ]);
      
      // Check for any failures
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        const errorMessage = failures.length === results.length
          ? 'Failed to refresh data. Please check your connection.'
          : 'Some data failed to refresh.';
        setRefreshError(errorMessage);
        
        // Auto-clear error after 5 seconds
        setTimeout(() => setRefreshError(null), 5000);
      }
    } catch (error) {
      // Log error only in development to avoid exposing internal structure
      devError('Unexpected error refreshing data:', error);
      setRefreshError('An unexpected error occurred. Please try again.');
      
      // Auto-clear error after 5 seconds
      setTimeout(() => setRefreshError(null), 5000);
    } finally {
      // Always clear both loading state and ref lock
      setIsRefreshing(false);
      isRefreshInProgressRef.current = false;
    }
  }, [refetchNutrition, refetchWorkouts]);

  // Keep handleRefreshRef in sync so BroadcastChannel handler always calls latest version
  const handleRefreshRef = useRef(handleRefresh);
  useEffect(() => { handleRefreshRef.current = handleRefresh; }, [handleRefresh]);
  
  // Tab focus refresh - automatically refresh data when user returns to tab
  // Uses ref-based check to prevent race conditions with ongoing refresh
  // Increased throttle to 30 seconds to prevent excessive API calls
  const lastTabFocusRefreshRef = useRef(0);
  
  useTabFocus(
    useCallback(() => {
      // Check ref lock to prevent race condition
      if (!isAuthenticated || isRefreshInProgressRef.current) return;
      
      // Only refresh if more than 30 seconds since last tab focus refresh
      const now = Date.now();
      if (now - lastTabFocusRefreshRef.current < 30000) return;
      lastTabFocusRefreshRef.current = now;
      
      handleRefresh();
    }, [isAuthenticated, handleRefresh]),
    [isAuthenticated, handleRefresh],
    { throttleMs: 30000 } // Minimum 30 seconds between tab focus refreshes
  );
  
  // Onboarding completion removed — personalization handled by SetupModal
  
  // Loading State - Minimal, premium iOS-like loading
  // Show loading until we have essential user data and all critical data is loaded
  // (prevents flash of 'User' name and wrong numbers)
  // Also ensure minimum splash screen display time for a polished feel
  // Only check user data when authenticated - otherwise show auth screen
  const isDataLoading = isAuthenticated && (
    !user?.id || 
    !userSettings ||
    !targets ||
    userLoading || 
    nutritionLoading || 
    targetsLoading ||
    foodLogLoading ||
    measurementsLoading ||
    workoutsLoading ||
    hydrationLoading ||
    stepsLoading ||
    analyticsLoading
  );
  
  // Core data ready — enough to show the app without splash (profile, settings, targets)
  // Full data (workouts, nutrition, analytics) loads progressively in tabs
  const isCoreDataReady = isAuthenticated && user?.id && userSettings && targets;
  const isAppReady = !isAuthenticated || (!authLoading && (isCoreDataReady || !isDataLoading));
  
  // ═══════════════════════════════════════════════════════════════
  // SPLASH SCREEN LOGIC - Wait for app ready + minimum 4 seconds
  // ═══════════════════════════════════════════════════════════════
  
  // Hide splash when BOTH: app is ready AND minimum time (4s) has elapsed
  useEffect(() => {
    // If splash was skipped (back nav, return from settings), never show it
    if (skipSplash || splashSkippedRef.current) return;
    
    // Wait until BOTH conditions are met
    if (isAppReady && minTimeElapsed && splashVisible) {
      // Small delay for smooth transition
      const timer = setTimeout(() => {
        setSplashVisible(false);
        __splashHasBeenShown = true;
        sessionStorage.setItem('splash-shown', 'true');
      }, 300); // 300ms delay for smooth fade
      
      return () => clearTimeout(timer);
    }
  }, [isAppReady, minTimeElapsed, splashVisible, skipSplash]);
  
  // Safety timeout - max 15 seconds to prevent infinite splash
  useEffect(() => {
    if (skipSplash || splashSkippedRef.current || !splashVisible) return;
    
    const timer = setTimeout(() => {
      if (splashVisible) {
        setSplashVisible(false);
        __splashHasBeenShown = true;
        splashSkippedRef.current = true;
        sessionStorage.setItem('splash-shown', 'true');
      }
    }, 15000);
    
    return () => clearTimeout(timer);
  }, [skipSplash, splashVisible]);
  
  // ═══════════════════════════════════════════════════════════════
  // RENDER - Content always visible, splash overlays until ready
  // ═══════════════════════════════════════════════════════════════
  
  return (
    <>
      {/* ═══ MAIN CONTENT LAYER (always renders) ═══ */}
      {!isAuthenticated ? (
        // Auth screen
        <SupabaseAuthScreen />
      ) : (
        // Main app content
        <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
          {/* Skip Link for Keyboard Navigation */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-500 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {t('skipToContent')}
          </a>
          
          {/* Dynamic Safe Area - Top (handles notch/Dynamic Island) */}
          <div 
            className="safe-area-top-spacer" 
            aria-hidden="true"
          />
          
          {/* Main Content */}
          <main 
            id="main-content"
            className="flex-1 overflow-y-auto pb-24 -webkit-overflow-scrolling-touch gymbro-page-subtle gymbro-page-subtle-strong"
            role="main"
            aria-label="Main content area"
          >
            <AnimatePresence mode="wait">
              {activeTab === 'home' && (
                <motion.div
                  key="home"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="min-h-full"
                  role="region"
                  aria-label="Home dashboard"
                >
                  <ErrorBoundary 
                    onReset={handleRefresh} 
                    showDetails={process.env.NODE_ENV === 'development'}
                  >
                    {/* ═══ REFRESH ERROR TOAST ═══ */}
                    {refreshError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mx-5 my-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800"
                        role="alert"
                        aria-live="polite"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                          <p className="text-sm text-rose-700 dark:text-rose-300">{refreshError}</p>
                        </div>
                      </motion.div>
                    )}
                    
                    {/* ═══ DYNAMIC IDENTITY HEADER ═══ */}
                <IdentityHeader
                  name={user?.name || 'User'}
                  avatarUrl={user?.avatarUrl}
                  greeting={greeting}
                  bodyScore={bodyScoreValue}
                  trend={progressTrend}
                  streak={userStreak}
                  scoreConfidence={bodyScoreConfidence}
                  isDefaultGoal={isDefaultGoal}
                />
                
                {/* ═══ OFFLINE INDICATOR ═══ */}
                <OfflineIndicator 
                  isOnline={isOnline} 
                  pendingSyncCount={(offlineStats?.unsyncedCount || 0) + (offlineStats?.unsyncedFoodCount || 0)}
                />
                
                {/* ═══ TODAY'S TIMELINE (Today's Fuel) ═══ */}
                <TodayTimeline
                  entries={foodLogEntries}
                  nutrition={nutrition}
                  onAddFood={() => setActiveTab('foods')}
                  currentTimestamp={currentTimestamp}
                  calorieTargetMode={
                    Number(userSettings?.customCalorieTarget ?? NaN) > 0 ||
                    Boolean(targets?.customCaloriesApplied)
                      ? 'custom'
                      : 'auto'
                  }
                />
                
                {/* ═══ BODY INTELLIGENCE CARD ═══ */}
                <BodyIntelligenceCard
                  bodyScore={bodyScoreValue}
                  hydration={hydration}
                  workoutSummary={workoutSummary}
                  weight={latestWeight}
                  trend={progressTrend}
                  streak={userStreak}
                  isLoading={nutritionLoading}
                  currentTimestamp={currentTimestamp}
                  scoreConfidence={bodyScoreConfidence}
                  isDefaultGoal={isDefaultGoal}
                  aiInsight={aiInsightText}
                  insightSource={aiInsightSource}
                  aiAggregateData={aiAggregateData}
                  aiInsightsList={aiInsightsList}
                />
                
                {/* ═══ DAILY ACTION STRIP ═══ */}
                <DailyActionStrip
                  modules={actionModules}
                  onModuleTap={(id) => {
                    if (id === 'nutrition') {
                      setActiveTab('foods');
                    } else if (id === 'workout') {
                      setActiveTab('workouts');
                    }
                  }}
                />
                
                {/* ═══ LIVE PROGRESS MIRROR ═══ */}
                <ProgressMirrorPreview
                  trend={progressTrend}
                  weight={latestWeight?.value}
                  weightUnit={latestWeight?.unit}
                />
              </ErrorBoundary>
            </motion.div>
          )}
          
          {activeTab === 'foods' && (
            <motion.div
              key="foods"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="h-full overflow-y-auto"
              role="region"
              aria-label="Foods and nutrition tracking"
            >
              <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
                <Suspense fallback={<PageLoader />}>
                  <FoodsPage />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}
          
          {activeTab === 'workouts' && (
            <motion.div
              key="workouts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="h-full overflow-y-auto"
              role="region"
              aria-label="Workouts and activity tracking"
            >
              <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
                <Suspense fallback={<PageLoader />}>
                  <WorkoutsPage />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}
          
          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              role="region"
              aria-label="Analytics and insights"
            >
              <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
                <Suspense fallback={<PageLoader />}>
                  <AnalyticsPage />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}
          
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="px-4 py-4"
              role="region"
              aria-label="User profile and settings"
            >
              <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
                <Suspense fallback={<PageLoader />}>
                  <ProfilePage onOpenSettings={() => setSettingsOpen(true)} />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      
      {/* Screen Reader Announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {activeTab === 'home' && 'Home dashboard loaded'}
        {activeTab === 'foods' && 'Foods tracking page loaded'}
        {activeTab === 'workouts' && 'Workouts tracking page loaded'}
        {activeTab === 'analytics' && 'Analytics page loaded'}
        {activeTab === 'profile' && 'Profile page loaded'}
      </div>
      

      
      {/* ═══ iOS TAB BAR ═══ */}
      <nav 
        className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/30 z-40"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Dynamic Safe Area - Bottom (handles home indicator/keyboard) */}
        <div 
          aria-hidden="true"
          className={isKeyboardVisible ? "safe-area-bottom-keyboard" : "safe-area-bottom-spacer"}
        />
        <div className="flex justify-around items-center h-14 px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  "flex flex-col items-center justify-center relative btn-press",
                  // Minimum 44px touch target for accessibility
                  "min-w-12 min-h-12 px-3 py-2 rounded-xl",
                  isActive ? 'text-emerald-500' : 'text-muted-foreground/70 hover:text-muted-foreground'
                )}
              >
                {/* Active indicator pill */}
                {isActive && (
                  <motion.div
                    layoutId="tabIndicator"
                    className="absolute -top-0.5 w-8 h-1 rounded-full bg-emerald-500"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={cn(
                  "text-[10px] mt-1 font-medium",
                  isActive ? "opacity-100" : "opacity-70"
                )}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      

      
      {/* Iron Coach - Premium AI Assistant */}
      <Suspense fallback={null}>
        <IronCoach />
      </Suspense>
    </div>
      )}
      
      {/* ═══ SETTINGS SHEET - Embedded full-height panel (no route change) ═══ */}
      <Suspense fallback={<PageLoader />}>
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto">
            <SheetHeader className="sr-only">
              <SheetTitle>{t('settings.title')}</SheetTitle>
            </SheetHeader>
            <ErrorBoundary>
              <SettingsSheet />
            </ErrorBoundary>
          </SheetContent>
        </Sheet>
      </Suspense>

      {/* ═══ SPLASH SCREEN OVERLAY - Waits until app ready, skips on back nav ═══ */}
      {splashVisible && (
        <div data-splash-overlay className="fixed inset-0 z-50 transition-opacity duration-500 ease-out">
          <SplashScreen isLoading={!isAppReady} />
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// IDENTITY HEADER - Dynamic Greeting
// ═══════════════════════════════════════════════════════════════

const IdentityHeader = React.memo(function IdentityHeader({
  name,
  avatarUrl,
  greeting,
  bodyScore,
  trend,
  streak,
  scoreConfidence,
  isDefaultGoal,
}: {
  name: string;
  avatarUrl?: string | null;
  greeting: string;
  bodyScore: number;
  trend: 'up' | 'down' | 'stable';
  streak: number;
  scoreConfidence?: number;
  isDefaultGoal?: boolean;
}) {
  // Unique ID for gradient to avoid SVG ID collisions
  const gradientId = useId();
  const { t } = useLocale();
  
  // Generate intelligent insight - prioritize non-streak insights since streak is shown elsewhere
  const insight = useMemo(() => {
    // Only show streak insight for very impressive streaks (>= 14 days)
    if (streak >= 14) return `🔥 ${streak}${t('home.insight.incredibleStreak')}`;
    if (bodyScore >= 80) return t('home.insight.peakState');
    if (bodyScore >= 50) return t('home.insight.solidProgress');
    if (streak >= 3) return `${streak}${t('home.insight.streak')}`;
    if (bodyScore > 0) return t('home.insight.startSmall');
    return t('home.insight.ready');
  }, [bodyScore, streak, t]);
  
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="px-5 pt-4 pb-2"
    >
      <div className="flex items-start justify-between">
        {/* Left: Greeting + Insight */}
        <div className="flex-1">
          <motion.h1
            className="text-2xl font-semibold tracking-tight"
            variants={fadeInUp}
            suppressHydrationWarning
          >
            {greeting}{greeting.includes(name) ? '' : `, ${name || 'User'}.`}
          </motion.h1>
          <motion.p
            className="text-sm text-muted-foreground mt-0.5"
            variants={fadeIn}
          >
            {insight}
          </motion.p>
          {/* Goal warning indicator */}
          {isDefaultGoal && (
            <motion.p
              className="text-xs text-amber-600 dark:text-amber-400 mt-1"
              variants={fadeIn}
            >
              {t('home.defaultGoalWarning')}
            </motion.p>
          )}
        </div>
        
        {/* Right: Progress Halo */}
        <motion.div
          className="relative w-14 h-14"
          variants={scaleIn}
        >
          {/* Animated Progress Ring */}
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted/20"
            />
            <motion.circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={150.8}
              initial={{ strokeDashoffset: 150.8 }}
              animate={{ strokeDashoffset: 150.8 - (150.8 * bodyScore) / 100 }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#14b8a6" />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Center Avatar */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-semibold"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {avatarUrl ? (
                <img src={sanitizeUrl(avatarUrl)} alt={name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
            </motion.div>
          </div>
          
          {/* Breathing Glow */}
          <motion.div
            className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl"
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
});

// ═══════════════════════════════════════════════════════════════
// BODY INTELLIGENCE CARD - Glassmorphism Hero
// ═══════════════════════════════════════════════════════════════

/** Tap-friendly info panel for Body Intelligence — works on mobile and desktop */
const BodyScoreInfoPanel = React.memo(function BodyScoreInfoPanel() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-full p-0.5 hover:bg-amber-100 dark:hover:bg-amber-800/30 active:scale-90 transition-all"
        aria-label="What is Body Intelligence?"
        aria-expanded={open}
      >
        <Info className="w-3.5 h-3.5 text-amber-500/70 dark:text-amber-400/70" />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-2 z-[100] w-64 p-3 rounded-xl bg-popover text-popover-foreground border shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
          role="dialog"
          aria-label="Body Intelligence info"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">What is Body Intelligence?</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-0.5 rounded-full hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A holistic score (0-100) reflecting how well you&apos;re supporting your body&apos;s needs. Combines nutrition, hydration, activity, and consistency.
            </p>
            <div className="pt-1.5 border-t text-xs text-muted-foreground">
              <p className="font-medium mb-1">Score factors:</p>
              <ul className="space-y-0.5">
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Nutrition — calorie &amp; protein</li>
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> Hydration — water intake</li>
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Activity — workout calories</li>
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> Streak — consecutive days</li>
              </ul>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Weights adapt based on your primary goal.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

const BodyIntelligenceCard = React.memo(function BodyIntelligenceCard({
  bodyScore,
  hydration,
  workoutSummary,
  weight,
  trend,
  streak,
  isLoading,
  currentTimestamp,
  scoreConfidence,
  isDefaultGoal,
  aiInsight,
  insightSource,
  aiAggregateData,
  aiInsightsList,
}: {
  bodyScore: number;
  hydration: { current: number; target: number };
  workoutSummary: TodayWorkoutSummary | null;
  weight?: { value: number; unit: string } | null;
  trend: 'up' | 'down' | 'stable';
  streak: number;
  isLoading: boolean;
  currentTimestamp: Date;
  scoreConfidence?: number;
  isDefaultGoal?: boolean;
  aiInsight?: string;
  insightSource?: 'ai' | 'rule';
  aiAggregateData?: {
    hydrationMl: number;
    caloriesBurned: number;
    proteinG: number;
    caloriesConsumed: number;
    streak: number;
    workoutsThisWeek: number;
    weightTrend: string;
    primaryGoal: string;
    hasFoodToday: boolean;
    hasWorkoutToday: boolean;
  } | null;
  aiInsightsList?: Array<{
    title: string;
    description: string;
    actionSuggestion?: string;
    category: string;
    confidence: number;
    dataSources: string[];
  }>;
}) {
  const { t } = useLocale();
  const [animatedScore, setAnimatedScore] = useState(0);
  const [showInsightDetails, setShowInsightDetails] = React.useState(false);
  const animationRef = useRef<number | null>(null);
  
  // Animate score using requestAnimationFrame (memory efficient)
  useEffect(() => {
    const startTime = performance.now();
    const startScore = animatedScore;
    const targetScore = isNaN(bodyScore) ? 0 : bodyScore;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / SCORE_ANIMATION_DURATION, 1);
      // Cubic ease-out for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      
      setAnimatedScore(Math.round(startScore + (targetScore - startScore) * eased));
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [bodyScore]);
  
  // Trend message
  const trendMessage = useMemo(() => {
    if (trend === 'up') return t('home.trendingLeaner');
    if (trend === 'down') return t('home.buildingStrength');
    return t('home.stableProgress');
  }, [trend, t]);

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'from-emerald-500 to-teal-500';
    if (score >= 50) return 'from-amber-500 to-orange-500';
    return 'from-rose-400 to-pink-500';
  };
  
  // Check hydration danger level using utility function
  const hydrationPercent = calculateHydrationPercent(hydration.current, hydration.target);
  const hydrationDangerous = isHydrationDangerous(hydrationPercent);

  // Use aggregate data for provenance when available, otherwise fall back to client state
  const provenanceData = aiAggregateData ? [
    `Hydration: ${aiAggregateData.hydrationMl}ml/day avg`,
    `Workout: ${aiAggregateData.caloriesBurned} cal burned`,
    `Protein: ${Math.round(aiAggregateData.proteinG / 7)}g/day avg`,
    `Goal: ${aiAggregateData.primaryGoal}`,
  ] : [
    `Hydration: ${Math.round(hydration.current)}ml`,
    workoutSummary ? `Workout: ${workoutSummary.totalCalories} cal burned` : 'No workout today',
    isDefaultGoal ? 'Goal: default' : 'Goal: custom'
  ];

  const insightConfidence = insightSource === 'ai' ? 82 : scoreConfidence || 70;
  
  return (
    <motion.div
      className="px-5 py-3"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      <motion.div 
        className="relative overflow-hidden rounded-3xl white-card athena-card-marble athena-accent-inlay"
        variants={fadeInUp}
      >
        {/* Warm Glassmorphism Background */}
        <div className="absolute inset-0 bg-linear-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl" />
        <div className="absolute inset-0 bg-linear-to-br from-amber-500/5 via-orange-500/3 to-rose-500/5" />
        <div className="absolute inset-0 border border-amber-200/20 dark:border-amber-800/10 rounded-3xl" />
        
        {/* Subtle Inner Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-linear-to-b from-amber-100/20 to-transparent dark:from-amber-500/5 rounded-full blur-2xl" />
        
        {/* Content */}
        <div className="relative p-4 sm:p-5">
          {/* Top Row: Score + Trend */}
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 uppercase tracking-widest font-medium">Body Intelligence</p>
                <BodyScoreInfoPanel />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <motion.span 
                  className={cn("text-3xl sm:text-4xl font-bold tracking-tight bg-linear-to-r bg-clip-text text-transparent", getScoreColor(bodyScore))}
                >
                  {animatedScore}
                </motion.span>
                <span className="text-muted-foreground text-xs sm:text-sm">/ 100</span>
              </div>
            </div>
            
            {/* Trend Indicator with warm accent */}
            <motion.div
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium",
                trend === 'up' && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                trend === 'down' && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                trend === 'stable' && "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              )}
              animate={trend === 'up' ? { y: [0, -2, 0] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {trend === 'up' && <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {trend === 'down' && <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {trend === 'stable' && <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {trendMessage}
            </motion.div>
          </div>
          
          {/* Metrics Row - Unique metrics complementing Today's Fuel */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
            {/* Activity - Workout Calories Burned */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                <Flame className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500" />
                <p className="text-lg sm:text-2xl font-semibold">{workoutSummary?.totalCalories || 0}</p>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">burned</p>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-linear-to-r from-orange-400 via-red-500 to-rose-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(((workoutSummary?.totalCalories || 0) / 500) * 100, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
            
            {/* Hydration */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                <Droplets className={cn("w-3 h-3 sm:w-4 sm:h-4", hydrationDangerous ? "text-red-500" : "text-cyan-500")} />
                <p className={cn("text-lg sm:text-2xl font-semibold", hydrationDangerous && "text-red-600 dark:text-red-400")}>
                  {Math.round(hydration.current / 250)}<span className="text-sm sm:text-base text-muted-foreground">/{Math.round(hydration.target / 250)}</span>
                </p>
              </div>
              <p className={cn("text-[10px] sm:text-xs", hydrationDangerous ? "text-red-500/70 dark:text-red-400/70" : "text-muted-foreground")}>
                {hydrationDangerous ? (hydrationPercent > 150 ? "too much!" : "drink more!") : "glasses"}
              </p>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    hydrationDangerous 
                      ? "bg-linear-to-r from-red-400 to-red-600" 
                      : "bg-linear-to-r from-sky-400 via-cyan-500 to-teal-500"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((hydration.current / Math.max(hydration.target, 1)) * 100, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
            
            {/* Streak */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-amber-500" />
                <p className="text-lg sm:text-2xl font-semibold">{streak}</p>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">day streak</p>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-linear-to-r from-amber-400 via-yellow-500 to-orange-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(streak * 10, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
          
          {/* AI Insight with warm accent */}
          <motion.div
            className="p-3.5 rounded-2xl bg-linear-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 border border-amber-200/20 dark:border-amber-800/10"
            variants={fadeIn}
          >
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    AI Insight
                    {insightSource === 'ai' && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">Gemini</span>
                    )}
                  </p>
                  {/* Tap-friendly info button for mobile — expands details inline */}
                  <button
                    type="button"
                    onClick={() => setShowInsightDetails(!showInsightDetails)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all",
                      "bg-muted/60 text-muted-foreground hover:bg-muted active:scale-95",
                      showInsightDetails && "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    )}
                    aria-label="Toggle insight details"
                    aria-expanded={showInsightDetails}
                  >
                    <Info className="w-3 h-3" />
                    <span>{insightConfidence >= 80 ? 'High' : insightConfidence >= 50 ? 'Med' : 'Low'} ({insightConfidence}%)</span>
                    <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", showInsightDetails && "rotate-180")} />
                  </button>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {aiInsight || (bodyScore >= 80 
                    ? "Excellent momentum. Your body is responding well to your current routine."
                    : bodyScore >= 50
                    ? "Steady progress. Focus on protein timing for better recovery."
                    : "Start with small wins. Even a short walk moves you forward.")}
                </p>

                {/* Expandable details — tap to show on mobile, always visible info */}
                {showInsightDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-3 border-t border-amber-200/20 dark:border-amber-800/10 space-y-2.5"
                  >
                    {/* Source */}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Brain className="w-3 h-3" />
                      <span className="font-medium">{insightSource === 'ai' ? 'AI Model' : 'Rule-based'}</span>
                      <span className="text-muted-foreground/60">·</span>
                      <span>Recorded {currentTimestamp.toLocaleDateString()}</span>
                    </div>

                    {/* Data Sources */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1">Data sources used</p>
                      <div className="flex flex-wrap gap-1.5">
                        {provenanceData.map((item, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground"
                          >
                            <span className="w-1 h-1 rounded-full bg-amber-500/70" />
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* How derived */}
                    <p className="text-[11px] text-muted-foreground/80 italic leading-relaxed">
                      How derived: {insightSource === 'ai'
                        ? 'Generated from your workout, nutrition, and body data using Gemini AI'
                        : 'Based on your activity patterns and training data'}
                    </p>

                    {/* Additional Insight Cards */}
                    {aiInsightsList && aiInsightsList.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Detailed insights</p>
                        {aiInsightsList.map((insight, i) => (
                          <div
                            key={i}
                            className={cn(
                              "p-2.5 rounded-xl text-xs space-y-1 border",
                              insight.category === 'anomaly' && "bg-rose-50/50 dark:bg-rose-950/10 border-rose-200/20 dark:border-rose-800/10",
                              insight.category === 'trend' && "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200/20 dark:border-emerald-800/10",
                              insight.category === 'prediction' && "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/20 dark:border-amber-800/10",
                              insight.category === 'correlation' && "bg-cyan-50/50 dark:bg-cyan-950/10 border-cyan-200/20 dark:border-cyan-800/10",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-foreground/90">{insight.title}</p>
                              <span className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                insight.confidence >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                                insight.confidence >= 50 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                                "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                              )}>
                                {insight.confidence}%
                              </span>
                            </div>
                            <p className="text-foreground/70 leading-relaxed">{insight.description}</p>
                            {insight.actionSuggestion && (
                              <p className="text-foreground/60 italic">→ {insight.actionSuggestion}</p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {insight.dataSources.map((ds, j) => (
                                <span key={j} className="text-[10px] text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded">{ds}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
});

// ═══════════════════════════════════════════════════════════════
// DAILY ACTION STRIP - Horizontal Modules with Warm Accents
// ═══════════════════════════════════════════════════════════════

const DailyActionStrip = React.memo(function DailyActionStrip({
  modules,
  onModuleTap,
}: {
  modules: Array<{
    id: string;
    icon: React.ElementType;
    label: string;
    value: number;
    color: string;
    bgColor: string;
    comingSoon?: boolean;
  }>;
  onModuleTap: (id: string) => void;
}) {
  const { t } = useLocale();
  
  // Check if module value indicates a dangerous condition (uses utility function)
  const checkDangerous = (id: string, value: number) => {
    if (id === 'hydration') {
      return isHydrationDangerous(value);
    }
    return false;
  };

  return (
    <motion.section
      className="px-3 py-2"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      aria-label="Daily action modules"
    >
      {/* Wrapper for centering on mobile */}
      <div className="flex justify-center sm:justify-start">
        {/* Scrollable container with iOS momentum scrolling */}
        <ul 
          className="horizontal-scroll-touch inline-flex gap-2 sm:gap-3 overflow-x-auto pb-2 pt-1 snap-x snap-mandatory"
        >
        {modules.map((module) => {
          const safeValue = Math.max(0, toFiniteNumber(module.value, 0));
          const Icon = module.icon;
          const isComingSoon = module.comingSoon === true;
          const isExceeded = safeValue > 100;
          const isDangerous = checkDangerous(module.id, safeValue);
          const showWarning = isExceeded || isDangerous;
          
          return (
            <li key={module.id} className="list-none snap-start">
              <motion.button
                variants={fadeInUp}
                whileTap={isComingSoon ? {} : { scale: 0.95 }}
                onClick={() => !isComingSoon && onModuleTap(module.id)}
                disabled={isComingSoon}
                aria-label={isComingSoon 
                  ? `${module.label}: Coming soon` 
                  : showWarning
                  ? (isExceeded 
                    ? `${module.label}: Over target at ${safeValue}%`
                    : `${module.label}: Low intake at ${safeValue}%`)
                  : `${module.label}: ${safeValue}% progress. Tap to view details.`
                }
                className={cn(
                  "shrink-0 w-[72px] sm:w-20 p-2 sm:p-3 rounded-xl sm:rounded-2xl flex flex-col items-center gap-1.5 sm:gap-2 relative",
                  "border transition-all duration-300",
                  showWarning
                    ? "bg-red-50 dark:bg-red-950/30 border-red-400 dark:border-red-600 shadow-lg shadow-red-500/20"
                    : "bg-card/50 dark:bg-card/30 border-border/50",
                  isComingSoon 
                    ? "opacity-70 cursor-not-allowed" 
                  : "hover:bg-accent/50 cursor-pointer active:scale-95"
              )}
              >
              {/* Coming Soon Badge */}
              {isComingSoon && (
                <div className="absolute -top-2 right-0 px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-semibold rounded-full shadow-md">
                  Soon
                </div>
              )}
              
              {/* Warning Badge - More Visible */}
              {showWarning && !isComingSoon && (
                <motion.div 
                  className={cn(
                    "absolute -top-2 right-0 px-1.5 py-0.5 text-white text-[8px] font-bold rounded-full shadow-lg z-10",
                    isExceeded ? "bg-red-500" : "bg-amber-500"
                  )}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring" }}
                >
                  <motion.span
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    {isExceeded ? t('home.over') : t('home.low')}
                  </motion.span>
                </motion.div>
              )}
              
              {/* Progress Ring with gradient */}
              <div className="relative w-8 h-8 sm:w-10 sm:h-10" aria-hidden="true">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 -rotate-90" viewBox="0 0 40 40">
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={showWarning ? "text-red-200/30 dark:text-red-800/20" : "text-emerald-200/30 dark:text-emerald-800/20"}
                  />
                  {!isComingSoon && (
                    <motion.circle
                      cx="20"
                      cy="20"
                      r="16"
                      fill="none"
                      stroke={`url(#modGrad-${module.id})`}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={100.5}
                      initial={{ strokeDashoffset: 100.5 }}
                      animate={{ strokeDashoffset: 100.5 - (100.5 * Math.min(safeValue, 100)) / 100 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  )}
                  <defs>
                    <linearGradient id={`modGrad-${module.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={showWarning ? "#ef4444" : "#10b981"} />
                      <stop offset="100%" stopColor={showWarning ? "#dc2626" : "#14b8a6"} />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon className={cn(
                    "w-3.5 h-3.5 sm:w-4 sm:h-4",
                    isComingSoon ? "text-muted-foreground/50" : showWarning ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                  )} />
                </div>
              </div>
              
              <div className="text-center">
                <p className={cn(
                  "text-[10px] sm:text-xs font-semibold",
                  isComingSoon && "text-muted-foreground",
                  showWarning && !isComingSoon && "text-red-600 dark:text-red-400"
                )}>
                  {module.label}
                </p>
                <p className={cn(
                  "text-[9px] sm:text-[10px] font-medium mt-0.5",
                  isComingSoon 
                    ? "text-muted-foreground" 
                    : showWarning 
                    ? "text-red-500 dark:text-red-400" 
                    : "text-emerald-600/70 dark:text-emerald-400/70"
                )}>
                  {isComingSoon ? t('home.comingSoon') : `${Math.round(safeValue)}%`}
                </p>
              </div>
              </motion.button>
            </li>
          );
        })}
      </ul>
      </div>
    </motion.section>
  );
});

// ═══════════════════════════════════════════════════════════════
// PROGRESS MIRROR PREVIEW - Abstract Evolution Visualization
// ═══════════════════════════════════════════════════════════════

const ProgressMirrorPreview = React.memo(function ProgressMirrorPreview({
  trend,
  weight,
  weightUnit,
}: {
  trend: 'up' | 'down' | 'stable';
  weight?: number | null;
  weightUnit?: string;
}) {
  // Convert weight to kg for display, handling various input formats
  // Reasonable human weight range: 30-300 kg (66-660 lbs)
  const displayWeight = useMemo(() => {
    if (!weight || !Number.isFinite(weight)) return null;
    
    const unit = (weightUnit || '').toLowerCase().trim();
    const isLbs = unit === 'lb' || unit === 'lbs' || unit === 'pound' || unit === 'pounds';
    const isKg = unit === 'kg' || unit === 'kilogram' || unit === 'kilograms';
    
    // Case 1: Explicitly in lbs - convert to kg
    if (isLbs) {
      const kgValue = weight / 2.20462;
      // Sanity check: if converted value is in reasonable range, use it
      if (kgValue >= 30 && kgValue <= 300) {
        return { value: kgValue, unit: 'kg' };
      }
      // Otherwise the input might be wrong
      return null;
    }
    
    // Case 2: Explicitly in kg - validate range
    if (isKg) {
      if (weight >= 30 && weight <= 300) {
        return { value: weight, unit: 'kg' };
      }
      // Out of reasonable range - might be wrong unit
      // Try treating as lbs
      const kgValue = weight / 2.20462;
      if (kgValue >= 30 && kgValue <= 300) {
        return { value: kgValue, unit: 'kg' };
      }
      return null;
    }
    
    // Case 3: No unit specified - try to infer
    // If weight is in reasonable kg range (30-300), treat as kg
    if (weight >= 30 && weight <= 300) {
      return { value: weight, unit: 'kg' };
    }
    
    // If weight looks like lbs (100-660), convert to kg
    if (weight >= 100 && weight <= 660) {
      const kgValue = weight / 2.20462;
      if (kgValue >= 30 && kgValue <= 300) {
        return { value: kgValue, unit: 'kg' };
      }
    }
    
    // If weight is very high, might be grams (30000-300000g = 30-300kg)
    if (weight >= 30000 && weight <= 300000) {
      return { value: weight / 1000, unit: 'kg' };
    }
    
    // Cannot determine reasonable weight - return null to hide display
    return null;
  }, [weight, weightUnit]);
  
  return (
    <motion.div
      className="px-5 py-3"
      variants={fadeIn}
      initial="hidden"
      animate="show"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">Progress Mirror</h3>
        <span className="text-xs text-muted-foreground">30-day evolution</span>
      </div>
      
      <div className="relative h-32 rounded-2xl bg-linear-to-br from-card/60 to-card/40 backdrop-blur-sm border border-border/50 overflow-hidden">
        {/* Abstract Silhouette Visualization */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            className="relative"
            animate={trend === 'up' ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Abstract body shape */}
            <svg width="80" height="100" viewBox="0 0 80 100" className="opacity-30">
              {/* Head */}
              <circle cx="40" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500" />
              {/* Torso */}
              <path
                d="M25 28 Q40 25 55 28 L52 65 Q40 68 28 65 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-teal-500"
              />
              {/* Arms */}
              <path d="M25 30 L12 55 L18 57" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500" />
              <path d="M55 30 L68 55 L62 57" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500" />
              {/* Legs */}
              <path d="M28 65 L22 95" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" />
              <path d="M52 65 L58 95" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" />
            </svg>
            
            {/* Glowing Aura */}
            <motion.div
              className="absolute inset-0 -m-4 rounded-full bg-linear-to-br from-emerald-500/10 via-teal-500/5 to-transparent blur-2xl"
              animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
          </motion.div>
        </div>
        
        {/* Trend Overlay */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-500"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs text-muted-foreground">Evolving</span>
          </div>
          <span className="text-xs font-medium text-foreground">
            {displayWeight ? `${displayWeight.value.toFixed(1)} ${displayWeight.unit}` : '—'}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

// ═══════════════════════════════════════════════════════════════
// TODAY'S TIMELINE - Daily Nutrition Summary
// ═══════════════════════════════════════════════════════════════

function TodayTimeline({
  entries,
  nutrition,
  onAddFood,
  currentTimestamp,
  calorieTargetMode,
}: {
  entries: FoodLogEntry[];
  nutrition: {
    calories: { current: number; target: number };
    protein: { current: number; target: number };
    carbs: { current: number; target: number };
    fat: { current: number; target: number };
  };
  onAddFood: () => void;
  currentTimestamp: Date;
  calorieTargetMode: 'auto' | 'custom';
}) {
  const { t } = useLocale();
  // Calculate progress percentages (uncapped for visual feedback)
  const caloriePercent = nutrition.calories.target > 0 
    ? calculatePercent(nutrition.calories.current, nutrition.calories.target)
    : 0;
  const calorieProgress = Math.min(caloriePercent, 100);
  const calorieExceeded = caloriePercent > 100;
  
  const proteinPercent = nutrition.protein.target > 0 
    ? calculatePercent(nutrition.protein.current, nutrition.protein.target)
    : 0;
  const proteinExceeded = proteinPercent > 100;
  
  const carbsPercent = nutrition.carbs.target > 0 
    ? calculatePercent(nutrition.carbs.current, nutrition.carbs.target)
    : 0;
  const carbsExceeded = carbsPercent > 100;
  
  const fatPercent = nutrition.fat.target > 0 
    ? calculatePercent(nutrition.fat.current, nutrition.fat.target)
    : 0;
  const fatExceeded = fatPercent > 100;
  
  return (
    <motion.section
      className="px-5 py-3"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      aria-label="Today's nutrition summary"
    >
      <motion.div 
        className="flex items-center justify-between mb-3"
        variants={fadeIn}
      >
        <h3 className="text-sm font-medium text-muted-foreground">{t('home.todaysFuel')}</h3>
        <span className="text-xs text-muted-foreground">{format(currentTimestamp, 'EEEE, MMM d')}</span>
      </motion.div>
      
      {/* Warm Nutrition Card */}
      <motion.div
        variants={fadeInUp}
        className="relative overflow-hidden rounded-3xl"
        onClick={onAddFood}
        role="button"
        tabIndex={0}
        aria-label="View nutrition details"
        onKeyDown={(e) => e.key === 'Enter' && onAddFood()}
      >
        {/* Warm gradient background */}
        <div className="absolute inset-0 bg-linear-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-rose-950/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.15),transparent_50%)]" />
        <div className="absolute inset-0 border border-amber-200/30 dark:border-amber-800/20 rounded-3xl" />
        
        <div className="relative p-5">
          {/* Header with calorie ring */}
          <div className="flex items-center gap-4 mb-4">
            {/* Calorie Ring */}
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className={calorieExceeded ? "text-red-100 dark:text-red-900/50" : "text-amber-100 dark:text-amber-900/50"}
                />
                <motion.circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke={calorieExceeded ? "url(#exceededGradient)" : "url(#warmGradient)"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={163.4}
                  initial={{ strokeDashoffset: 163.4 }}
                  animate={{ strokeDashoffset: 163.4 - (163.4 * calorieProgress) / 100 }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
                <defs>
                  <linearGradient id="warmGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                  <linearGradient id="exceededGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                  "text-lg font-bold",
                  calorieExceeded ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"
                )}>
                  {Math.round(nutrition.calories.current || 0)}
                </span>
                <span className={cn(
                  "text-[8px]",
                  calorieExceeded ? "text-red-500/60 dark:text-red-400/60" : "text-amber-600/60 dark:text-amber-400/60"
                )}>kcal</span>
              </div>
            </div>
            
            {/* Stats */}
            <div className="flex-1">
              <p className={cn(
                "text-sm font-medium mb-1",
                calorieExceeded ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-200"
              )}>
                {calorieExceeded 
                  ? t('home.kcalOverGoal').replace('{value}', String(Math.round((nutrition.calories.current || 0) - (nutrition.calories.target || 0))))
                  : (nutrition.calories.current || 0) > 0 
                  ? t('home.kcalRemaining').replace('{value}', String(Math.round((nutrition.calories.target || 0) - (nutrition.calories.current || 0))))
                  : t('home.startLogging')
                }
              </p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
                {t('home.dailyGoal').replace('{value}', String(nutrition.calories.target))}
              </p>
              <div className="mt-1">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
                    calorieTargetMode === 'custom'
                      ? "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400"
                      : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                  )}
                >
                  {calorieTargetMode === 'custom' ? t('home.customTarget') : t('home.autoTarget')}
                </span>
              </div>
            </div>
          </div>
          
          {/* Macro Pills */}
          <div className="flex gap-2">
            {/* Protein */}
            <div className={cn(
              "flex-1 p-2.5 rounded-2xl border transition-colors duration-300",
              proteinExceeded 
                ? "bg-red-100/50 dark:bg-red-900/20 border-red-200/30 dark:border-red-800/20"
                : "bg-rose-100/50 dark:bg-rose-900/20 border border-rose-200/30 dark:border-rose-800/20"
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-[10px] font-medium",
                  proteinExceeded ? "text-red-600 dark:text-red-400" : "text-rose-600 dark:text-rose-400"
                )}>{t('home.protein')}</span>
                <span className={cn(
                  "text-[10px]",
                  proteinExceeded ? "text-red-500/60 dark:text-red-400/60" : "text-rose-500/60 dark:text-rose-400/60"
                )}>
                  {Math.round(nutrition.protein.current || 0)}g
                </span>
              </div>
              <div className={cn(
                "h-1.5 rounded-full overflow-hidden",
                proteinExceeded ? "bg-red-200/80 dark:bg-red-800/30" : "bg-rose-200/80 dark:bg-rose-800/30"
              )}>
                <motion.div
                  key={`protein-${nutrition.protein.current}-${nutrition.protein.target}`}
                  className={cn(
                    "h-full rounded-full",
                    proteinExceeded 
                      ? "bg-linear-to-r from-red-400 to-red-600" 
                      : "bg-linear-to-r from-rose-500 to-pink-600"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(proteinPercent, 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
            
            {/* Carbs */}
            <div className={cn(
              "flex-1 p-2.5 rounded-2xl border transition-colors duration-300",
              carbsExceeded 
                ? "bg-red-100/50 dark:bg-red-900/20 border-red-200/30 dark:border-red-800/20"
                : "bg-sky-100/50 dark:bg-sky-900/20 border border-sky-200/30 dark:border-sky-800/20"
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-[10px] font-medium",
                  carbsExceeded ? "text-red-600 dark:text-red-400" : "text-sky-600 dark:text-sky-400"
                )}>{t('home.carbs')}</span>
                <span className={cn(
                  "text-[10px]",
                  carbsExceeded ? "text-red-500/60 dark:text-red-400/60" : "text-sky-500/60 dark:text-sky-400/60"
                )}>
                  {Math.round(nutrition.carbs.current || 0)}g
                </span>
              </div>
              <div className={cn(
                "h-1.5 rounded-full overflow-hidden",
                carbsExceeded ? "bg-red-200/80 dark:bg-red-800/30" : "bg-sky-200/80 dark:bg-sky-800/30"
              )}>
                <motion.div
                  key={`carbs-${nutrition.carbs.current}-${nutrition.carbs.target}`}
                  className={cn(
                    "h-full rounded-full",
                    carbsExceeded 
                      ? "bg-linear-to-r from-red-400 to-red-600" 
                      : "bg-linear-to-r from-sky-500 to-cyan-600"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(carbsPercent, 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
            
            {/* Fat */}
            <div className={cn(
              "flex-1 p-2.5 rounded-2xl border transition-colors duration-300",
              fatExceeded 
                ? "bg-red-100/50 dark:bg-red-900/20 border-red-200/30 dark:border-red-800/20"
                : "bg-amber-100/50 dark:bg-amber-900/20 border border-amber-200/30 dark:border-amber-800/20"
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-[10px] font-medium",
                  fatExceeded ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                )}>{t('home.fat')}</span>
                <span className={cn(
                  "text-[10px]",
                  fatExceeded ? "text-red-500/60 dark:text-red-400/60" : "text-amber-500/60 dark:text-amber-400/60"
                )}>
                  {Math.round(nutrition.fat.current || 0)}g
                </span>
              </div>
              <div className={cn(
                "h-1.5 rounded-full overflow-hidden",
                fatExceeded ? "bg-red-200/80 dark:bg-red-800/30" : "bg-amber-200/80 dark:bg-amber-800/30"
              )}>
                <motion.div
                  key={`fat-${nutrition.fat.current}-${nutrition.fat.target}`}
                  className={cn(
                    "h-full rounded-full",
                    fatExceeded 
                      ? "bg-linear-to-r from-red-400 to-red-600" 
                      : "bg-linear-to-r from-amber-500 to-orange-600"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(fatPercent, 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
          
          {/* Tap hint */}
          <p className="text-center text-[10px] text-amber-500/50 dark:text-amber-400/50 mt-3">
            Tap to log meals
          </p>
        </div>
      </motion.div>
    </motion.section>
  );
}

// ═══════════════════════════════════════════════════════════════
// AI COACH PRESENCE - Floating Icon
// ═══════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════
// Default Export with AppProvider wrapper for global state
// ═══════════════════════════════════════════════════════════════

export default function App() {
  // AppProvider is already in layout.tsx — do NOT wrap again here.
  // A duplicate provider would create two independent data-fetching
  // loops, doubling every /api/profile call and causing a request flood.
  return <ProgressCompanionHome />;
}
 
