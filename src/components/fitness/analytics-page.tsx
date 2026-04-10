"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Scale,
  Dumbbell,
  Moon,
  Zap,
  Target,
  Flame,
  Heart,
  Sparkles,
  Brain,
  X,
  ChevronRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type AnalyticsData } from "@/contexts/app-context";
import { useSystemReducedMotion } from "@/hooks/use-system-reduced-motion";
import { useLocale } from "@/lib/i18n/locale-context";
import { ProvenanceTag } from "./provenance-tag";
import { ConfidenceBadge } from "./confidence-badge";
import { 
  generateSuggestions, 
  type SetupSuggestions, 
  type PrimaryGoal,
  type UserSignals
} from "@/lib/human-state-engine";
import { onProfileEvent } from "@/lib/profile-events";

// ═══════════════════════════════════════════════════════════════
// DRILL-DOWN MODAL FOR CHART POINTS
// ═══════════════════════════════════════════════════════════════

interface DrillDownData {
  date: Date;
  value: number;
  metricMode: MetricMode;
  relatedData?: {
    workouts?: number;
    calories?: number;
    sleep?: number;
    water?: number;
  };
}

function DrillDownModal({
  isOpen,
  onClose,
  data,
}: {
  isOpen: boolean;
  onClose: () => void;
  data: DrillDownData | null;
}) {
  const { t } = useLocale();
  if (!isOpen || !data) return null;
  
  const getMetricLabel = () => {
    switch (data.metricMode) {
      case 'weight': return t('analytics.weight');
      case 'bodyFat': return t('analytics.bodyFat');
      case 'leanMass': return t('analytics.leanMass');
      case 'calories': return t('analytics.calories');
      case 'training': return t('analytics.training');
      case 'recovery': return t('analytics.recovery');
      default: return t('analytics.metric');
    }
  };
  
  const getMetricUnit = () => {
    switch (data.metricMode) {
      case 'weight': return 'kg';
      case 'bodyFat': return '%';
      case 'leanMass': return 'kg';
      case 'calories': return 'kcal';
      default: return '';
    }
  };
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-background rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Data Point Details</h3>
                  <p className="text-xs text-muted-foreground">
                    {data.date.toLocaleDateString('en-US', { 
                      weekday: 'long',
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Primary Metric */}
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-foreground">
                {data.value.toFixed(1)}
                <span className="text-lg text-muted-foreground ml-1">{getMetricUnit()}</span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">{getMetricLabel()}</p>
            </div>
            
            {/* Related Data */}
            {data.relatedData && (
              <div className="grid grid-cols-2 gap-3">
                {data.relatedData.workouts !== undefined && (
                  <div className="p-3 rounded-xl bg-card/60 border border-border/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Workouts</span>
                    </div>
                    <p className="text-lg font-semibold">{data.relatedData.workouts}</p>
                  </div>
                )}
                {data.relatedData.calories !== undefined && (
                  <div className="p-3 rounded-xl bg-card/60 border border-border/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Flame className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs text-muted-foreground">Calories</span>
                    </div>
                    <p className="text-lg font-semibold">{data.relatedData.calories}</p>
                  </div>
                )}
                {data.relatedData.sleep !== undefined && (
                  <div className="p-3 rounded-xl bg-card/60 border border-border/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Moon className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-xs text-muted-foreground">Sleep</span>
                    </div>
                    <p className="text-lg font-semibold">{data.relatedData.sleep}h</p>
                  </div>
                )}
                {data.relatedData.water !== undefined && (
                  <div className="p-3 rounded-xl bg-card/60 border border-border/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-3.5 h-3.5 text-cyan-500" />
                      <span className="text-xs text-muted-foreground">Water</span>
                    </div>
                    <p className="text-lg font-semibold">{data.relatedData.water}ml</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Provenance */}
            <div className="flex items-center gap-2 pt-2 border-t border-border/30">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Tap any chart point to see detailed breakdown
              </span>
            </div>
          </div>
          
          {/* Footer */}
          <div className="p-4 border-t border-border/30 bg-muted/30">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// ANALYTICS PAGE - Performance Intelligence System (Real Data)
// ═══════════════════════════════════════════════════════════════

type MetricMode = 'weight' | 'bodyFat' | 'leanMass' | 'calories' | 'training' | 'recovery';
type TimeRange = '7d' | '30d' | '90d';

// ═══════════════════════════════════════════════════════════════
// DATA SMOOTHING ALGORITHM (Exponential Moving Average)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply exponential moving average smoothing to data points
 * Reduces noise while preserving trend direction
 * @param data - Array of {date, value} points
 * @param alpha - Smoothing factor (0-1, higher = less smoothing)
 * @returns Smoothed data array
 */
function applySmoothing(
  data: Array<{ date: string; value: number }>,
  alpha: number = 0.3
): Array<{ date: string; value: number }> {
  if (data.length < 3) return data;
  
  const smoothed: Array<{ date: string; value: number }> = [];
  let previousValue = data[0].value;
  
  for (let i = 0; i < data.length; i++) {
    const smoothedValue = alpha * data[i].value + (1 - alpha) * previousValue;
    smoothed.push({
      date: data[i].date,
      value: smoothedValue,
    });
    previousValue = smoothedValue;
  }
  
  return smoothed;
}

/**
 * Calculate trend direction with smoothing consideration
 */
function calculateSmoothedTrend(
  data: Array<{ date: string; value: number }>,
  smoothingAlpha: number = 0.3
): { trend: 'up' | 'down' | 'stable'; percentChange: number } {
  if (data.length < 2) {
    return { trend: 'stable', percentChange: 0 };
  }
  
  const smoothed = applySmoothing(data, smoothingAlpha);
  const first = smoothed[0].value;
  const last = smoothed[smoothed.length - 1].value;
  const change = last - first;
  
  // P2 FIX: Handle edge cases properly instead of meaningless 0.001 fallback
  // For weight data, first value should be > 0 (no one weighs 0 kg)
  // If first is 0 or negative, we can't calculate meaningful % change
  const percentChange = first > 0 ? (change / first) * 100 : 0;
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (Math.abs(change) > 0.1) {
    trend = change > 0 ? 'up' : 'down';
  }
  
  return { trend, percentChange };
}

// ═══════════════════════════════════════════════════════════════
// HUMAN STATE ENGINE INTEGRATION
// ═══════════════════════════════════════════════════════════════

interface HumanStateInsight {
  suggestion: string;
  confidence: number;
  rationale: string;
  goalAligned: boolean;
  provenance: {
    source: 'human_state_engine';
    version: string;
    generatedAt: string;
    inputSignals: string[];
  };
}

/**
 * Generate AI-driven insight from HumanStateEngine based on analytics data
 */
function generateHumanStateInsight(
  analyticsData: AnalyticsData | null,
  profileGoal: PrimaryGoal | null
): HumanStateInsight | null {
  if (!analyticsData) return null;
  
  const signals: UserSignals = {
    existingGoal: profileGoal || undefined,
  };
  
  const suggestions = generateSuggestions(signals);
  
  // Determine which insight to use based on current metrics
  let suggestion = suggestions.goalSuggestion;
  let inputSignals = ['analytics_trend', 'nutrition_data', 'training_volume'];
  
  // Customize based on actual data
  if (analyticsData.training?.totalWorkouts === 0) {
    suggestion = {
      value: suggestion.value,
      confidence: Math.max(suggestion.confidence - 20, 30),
      rationale: 'Limited training data - ' + suggestion.rationale,
    };
    inputSignals.push('no_training_data');
  }
  
  if (analyticsData.nutrition?.avgCalories === 0) {
    suggestion = {
      value: suggestion.value,
      confidence: Math.max(suggestion.confidence - 15, 30),
      rationale: 'Limited nutrition data - ' + suggestion.rationale,
    };
    inputSignals.push('no_nutrition_data');
  }
  
  return {
    suggestion: suggestion.rationale,
    confidence: suggestion.confidence,
    rationale: suggestions.goalSuggestion.rationale,
    goalAligned: true,
    provenance: {
      source: 'human_state_engine',
      version: '1.0',
      generatedAt: new Date().toISOString(),
      inputSignals,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE CACHE UTILITIES
// Uses shared offline-storage analytics cache (single IndexedDB instance)
// ═══════════════════════════════════════════════════════════════

async function getCachedAnalytics(metric: string, range: string): Promise<AnalyticsData | null> {
  try {
    const { getCachedAnalytics: getShared } = await import('@/lib/offline-storage');
    return getShared<AnalyticsData>(`analytics-page-${metric}-${range}`);
  } catch {
    return null;
  }
}

async function setCachedAnalytics(metric: string, range: string, data: AnalyticsData): Promise<void> {
  try {
    const { cacheAnalytics } = await import('@/lib/offline-storage');
    await cacheAnalytics(`analytics-page-${metric}-${range}`, data);
  } catch {
    // Silently fail — cache is best-effort
  }
}

export function AnalyticsPage() {
  const { t } = useLocale();
  const [metricMode, setMetricMode] = useState<MetricMode>('weight');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  // humanStateInsight: populated asynchronously by the Iron Coach / signal engine.
  // Defaults to null for new users or when no AI insight is available yet.
   
  const [humanStateInsight, _setHumanStateInsight] = useState<HumanStateInsight | null>(null);
  const [showSmoothedGraph, setShowSmoothedGraph] = useState(true);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [drillDownData, setDrillDownData] = useState<{
    date: Date;
    value: number;
    metricMode: MetricMode;
    relatedData: { workouts?: number; calories?: number };
  } | null>(null);
  // Get dataVersion from context for cache invalidation
  const { isOnline, analyticsData, analyticsLoading } = useApp();
  
  // Respect user's reduced motion preference
  const prefersReducedMotion = useSystemReducedMotion();
  
  // Fetch analytics from global context (already derived from unified data service)
  const fetchedData = analyticsData;
  const isLoading = analyticsLoading;
  
  // Local state for data (supports offline cache)
  const [data, setData] = useState<AnalyticsData | null>(null);
  
  // Load from cache when offline or initial load
  useEffect(() => {
    async function loadData() {
      // If online and have fetched data, use it and cache it
      if (isOnline && fetchedData) {
        setData(fetchedData);
        setIsOffline(false);
        await setCachedAnalytics(metricMode, timeRange, fetchedData);
        return;
      }
      
      // If offline or no fetched data, try cache
      const cached = await getCachedAnalytics(metricMode, timeRange);
      if (cached) {
        setData(cached);
        setIsOffline(!isOnline);
      } else if (fetchedData) {
        setData(fetchedData);
        setIsOffline(false);
      }
    }
    
    loadData();
  }, [fetchedData, isOnline, metricMode, timeRange]);

  // Default data structure for loading/empty states
  const defaultData: AnalyticsData = {
    graphData: [],
    trend: 'stable',
    percentChange: 0,
    bodyComposition: {
      currentWeight: null,
      previousWeight: null,
      currentBodyFat: null,
      previousBodyFat: null,
      currentLeanMass: null,
      previousLeanMass: null,
      weightChange: null,
      bodyFatChange: null,
      leanMassChange: null,
    },
    nutrition: {
      avgCalories: 0,
      avgProtein: 0,
      avgCarbs: 0,
      avgFat: 0,
      caloricBalanceScore: 0,
      proteinScore: 0,
      carbTimingScore: 0,
      fatQualityScore: 0,
      metabolicStability: 0,
    },
    training: {
      totalWorkouts: 0,
      totalVolume: 0,
      totalDuration: 0,
      avgWorkoutDuration: 0,
      recoveryScore: 0,
      volumeTrend: 'stable',
      volumeScore: 0,
      recoveryScoreRadar: 75,
      sleepScore: 70,
      calorieScore: 50,
      stressScore: 50,
    },
    evolution: [],
  };
  
  // Deeply merge fetched data with defaultData to ensure all fields are always defined.
  // This prevents runtime TypeErrors like "Cannot read properties of undefined (reading 'length')"
  // when the API returns a partial response or when it's loading for the first time.
  const analytics: AnalyticsData = {
    ...defaultData,
    ...(data || {}),
    graphData: data?.graphData ?? [],
    caloriesGraphData: data?.caloriesGraphData ?? [],
    trainingGraphData: data?.trainingGraphData ?? [],
    nutrition: { ...defaultData.nutrition, ...(data?.nutrition ?? {}) },
    training: { ...defaultData.training, ...(data?.training ?? {}) },
    bodyComposition: { ...defaultData.bodyComposition, ...(data?.bodyComposition ?? {}) },
    evolution: data?.evolution ?? [],
  };
  
  // Select the correct graph data based on metric mode
  const activeGraphData = useMemo(() => {
    switch (metricMode) {
      case 'calories':
        return analytics.caloriesGraphData || [];
      case 'training':
      case 'recovery':
        return analytics.trainingGraphData || [];
      case 'weight':
      case 'bodyFat':
      case 'leanMass':
      default:
        return analytics.graphData || [];
    }
  }, [metricMode, analytics.graphData, analytics.caloriesGraphData, analytics.trainingGraphData]);
  
  // Calculate trend based on the active graph data
  const activeTrend = useMemo(() => {
    if (activeGraphData.length < 2) return 'stable';
    const { trend } = calculateSmoothedTrend(activeGraphData);
    return trend;
  }, [activeGraphData]);
  
  // Calculate percent change based on the active graph data
  const activePercentChange = useMemo(() => {
    if (activeGraphData.length < 2) return 0;
    const first = activeGraphData[0].value;
    const last = activeGraphData[activeGraphData.length - 1].value;
    if (first <= 0) return 0;
    return ((last - first) / first) * 100;
  }, [activeGraphData]);
  
  const trend = activeTrend;
  
  // Dynamic insight
  const insight = useMemo(() => {
    if (isLoading) return "Loading your data...";
    if (!data) return "Start tracking your progress to see personalized insights here.";
    
    switch (metricMode) {
      case 'weight':
        return trend === 'up' ? "Your weight has increased recently. If your goal is fat loss, consider slightly reducing calories or increasing activity." 
             : trend === 'down' ? "Great progress! Your weight is trending down. Keep maintaining your current routine." 
             : "Your weight is stable. This is good if you're in maintenance phase, or adjust intake if you want change.";
      case 'bodyFat':
        return trend === 'down' ? "Excellent! Your body fat percentage is decreasing, meaning you're losing fat while preserving muscle." 
             : trend === 'up' ? "Body fat has increased slightly. Focus on whole foods and consistent exercise to get back on track." 
             : "Body fat is stable. To change this, adjust your nutrition or training intensity.";
      case 'leanMass':
        return trend === 'up' ? "You're building muscle! Keep up the great work with your training and protein intake." 
             : trend === 'down' ? "Muscle mass may be decreasing. Ensure you're eating enough protein and training consistently." 
             : "Muscle mass is maintained. To build more, focus on progressive overload in training and adequate nutrition.";
      case 'calories':
        return `You're averaging ${analytics.nutrition.avgCalories} calories per day. Track consistently to see patterns and optimize your nutrition.`;
      case 'training':
        return analytics.training.totalWorkouts > 0 
          ? `You've completed ${analytics.training.totalWorkouts} workouts. Consistency is key to reaching your fitness goals!`
          : "Start logging workouts to track your training progress and see patterns over time.";
      case 'recovery':
        return "Recovery is essential for progress. Track your sleep, rest days, and how you feel to optimize performance.";
      default:
        return "Track your progress consistently to unlock personalized insights about your fitness journey.";
    }
  }, [metricMode, trend, analytics, isLoading, data]);
  
  // Metric explanation for users
  const metricExplanation = useMemo(() => {
    switch (metricMode) {
      case 'weight':
        return "Your body weight over time. Tracking weekly helps identify trends rather than daily fluctuations.";
      case 'bodyFat':
        return "The percentage of your body that is fat mass. Lower isn't always better — healthy ranges vary by gender and goals.";
      case 'leanMass':
        return "Everything in your body that isn't fat: muscles, bones, organs, and water. Increasing this means you're building muscle!";
      case 'calories':
        return "Energy from food you consume daily. Matching intake to your goals is key for fat loss, muscle gain, or maintenance.";
      case 'training':
        return "Your workout activity over time. Consistency matters more than intensity — aim for regular exercise each week.";
      case 'recovery':
        return "How well your body bounces back after workouts. Good recovery means better performance and fewer injuries.";
      default:
        return "Select a metric above to see detailed insights about your progress.";
    }
  }, [metricMode]);
  
  // Headline
  const headline = useMemo(() => {
    if (isLoading) return t('analytics.loading');
    if (!data) return t('analytics.welcome');
    
    switch (metricMode) {
      case 'weight':
        return trend === 'down' ? t('analytics.weightDown') 
             : trend === 'up' ? t('analytics.weightUp') 
             : t('analytics.weightStable');
      case 'bodyFat':
        return trend === 'down' ? t('analytics.bodyFatDown') 
             : trend === 'up' ? t('analytics.bodyFatUp') 
             : t('analytics.bodyFatStable');
      case 'leanMass':
        return trend === 'up' ? t('analytics.buildingMuscle') 
             : trend === 'down' ? t('analytics.muscleDeclining') 
             : t('analytics.muscleMaintained');
      case 'calories':
        return t('analytics.calorieIntake');
      case 'training':
        return t('analytics.trainingActivity');
      case 'recovery':
        return t('analytics.recoveryStatus');
      default:
        return t('analytics.performanceIntelligence');
    }
  }, [metricMode, trend, isLoading, data, t]);

  return (
    <div className="space-y-6 pb-8 gymbro-page-subtle">
      {/* ═══ ADAPTIVE INSIGHT HEADER ═══ */}
      <AdaptiveInsightHeader
        headline={headline}
        insight={insight}
        trend={trend}
        metricMode={metricMode}
        humanStateInsight={humanStateInsight}
        metricExplanation={metricExplanation}
      />
      
      {/* ═══ METRIC MODE SELECTOR ═══ */}
      <MetricModeSelector
        activeMode={metricMode}
        onModeChange={setMetricMode}
      />
      
      {/* ═══ SMOOTHING TOGGLE ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="px-5"
      >
        <div className="p-3 rounded-xl bg-card/40 border border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-medium">Trend Line</span>
                <p className="text-[10px] text-muted-foreground">Smooths out daily fluctuations to show overall direction</p>
              </div>
            </div>
            <button
              onClick={() => setShowSmoothedGraph(!showSmoothedGraph)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                showSmoothedGraph 
                  ? "bg-emerald-500/20 text-emerald-600" 
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {showSmoothedGraph ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </motion.div>
      
      {/* ═══ CORE INTELLIGENCE GRAPH ═══ */}
      <CoreIntelligenceGraph
        data={showSmoothedGraph ? applySmoothing(activeGraphData) : activeGraphData}
        metricMode={metricMode}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        selectedPoint={selectedPoint}
        onPointSelect={(index) => {
          setSelectedPoint(index);
          if (index !== null && activeGraphData[index]) {
            const point = activeGraphData[index];
            setDrillDownData({
              date: new Date(point.date),
              value: point.value,
              metricMode,
              relatedData: {
                workouts: analytics.training?.totalWorkouts,
                calories: analytics.nutrition?.avgCalories,
              },
            });
            setShowDrillDown(true);
          }
        }}
        trend={trend}
        percentChange={activePercentChange}
        isLoading={isLoading}
      />
      
      {/* ═══ DRILL-DOWN MODAL ═══ */}
      <DrillDownModal
        isOpen={showDrillDown}
        onClose={() => setShowDrillDown(false)}
        data={drillDownData}
      />
      
      {/* ═══ BODY COMPOSITION INTELLIGENCE ═══ */}
      <BodyCompositionSection 
        data={analytics.bodyComposition}
        isLoading={isLoading}
      />
      
      {/* ═══ METABOLIC & NUTRITION ANALYTICS ═══ */}
      <MetabolicNutritionSection 
        data={analytics.nutrition}
        isLoading={isLoading}
      />
      
      {/* ═══ TRAINING INTELLIGENCE ═══ */}
      <TrainingIntelligenceSection 
        data={analytics.training}
        isLoading={isLoading}
      />
      
      {/* ═══ OFFLINE INDICATOR ═══ */}
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="px-5"
        >
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-medium">
              Cached Data
            </span>
            <span className="text-xs text-muted-foreground">You're viewing cached analytics data</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE INSIGHT HEADER
// ═══════════════════════════════════════════════════════════════

function AdaptiveInsightHeader({
  headline,
  insight,
  trend,
  metricMode,
  humanStateInsight,
  metricExplanation,
}: {
  headline: string;
  insight: string;
  trend: 'up' | 'down' | 'stable';
  metricMode: MetricMode;
  humanStateInsight?: HumanStateInsight | null;
  metricExplanation?: string;
}) {
  // Get user-friendly trend explanation
  const getTrendExplanation = () => {
    if (trend === 'up') {
      return metricMode === 'weight' || metricMode === 'bodyFat' 
        ? 'Increasing' 
        : metricMode === 'leanMass' || metricMode === 'training' 
          ? 'Growing' 
          : 'Rising';
    }
    if (trend === 'down') {
      return metricMode === 'weight' || metricMode === 'bodyFat' 
        ? 'Decreasing' 
        : metricMode === 'leanMass' 
          ? 'Declining' 
          : 'Dropping';
    }
    return 'Stable';
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-5 pt-2"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-3">
          <motion.h1
            key={headline}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-semibold tracking-tight"
          >
            {headline}
          </motion.h1>
          
          {/* Metric explanation - what this metric means */}
          {metricExplanation && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="text-xs text-muted-foreground/70 mt-1 italic"
            >
              {metricExplanation}
            </motion.p>
          )}
          
          {/* Main insight */}
          <motion.p
            key={insight}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm text-foreground mt-2 leading-relaxed"
          >
            {insight}
          </motion.p>
          
          {/* HumanStateEngine AI-driven insight */}
          {humanStateInsight && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-3 flex items-center gap-2"
            >
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-linear-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                <Brain className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-700">AI Insight</span>
              </div>
              <p className="text-xs text-muted-foreground flex-1">
                {humanStateInsight.suggestion}
              </p>
              <ConfidenceBadge 
                confidence={humanStateInsight.confidence} 
                size="sm"
              />
            </motion.div>
          )}
        </div>
        
        {/* Animated Trend Indicator with label */}
        <motion.div
          className="flex flex-col items-center gap-1"
        >
          <motion.div
            className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center",
              trend === 'up' && "bg-emerald-500/10",
              trend === 'down' && "bg-amber-500/10",
              trend === 'stable' && "bg-slate-500/10"
            )}
            animate={trend === 'up' ? { y: [0, -3, 0] } : trend === 'down' ? { y: [0, 3, 0] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {trend === 'up' && <TrendingUp className="w-5 h-5 text-emerald-500" />}
            {trend === 'down' && <TrendingDown className="w-5 h-5 text-amber-500" />}
            {trend === 'stable' && <Minus className="w-5 h-5 text-slate-500" />}
          </motion.div>
          <span className={cn(
            "text-[10px] font-medium",
            trend === 'up' && "text-emerald-600",
            trend === 'down' && "text-amber-600",
            trend === 'stable' && "text-slate-500"
          )}>
            {getTrendExplanation()}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// METRIC MODE SELECTOR
// ═══════════════════════════════════════════════════════════════

function MetricModeSelector({
  activeMode,
  onModeChange,
}: {
  activeMode: MetricMode;
  onModeChange: (mode: MetricMode) => void;
}) {
  const { t } = useLocale();
  const modes: { id: MetricMode; label: string; icon: React.ElementType; shortDesc: string }[] = [
    { id: 'weight', label: t('analytics.weight'), icon: Scale, shortDesc: t('analytics.trackBodyWeight') },
    { id: 'bodyFat', label: t('analytics.bodyFat'), icon: Target, shortDesc: t('analytics.fatPercentage') },
    { id: 'leanMass', label: t('analytics.leanMass'), icon: Dumbbell, shortDesc: t('analytics.muscleMass') },
    { id: 'calories', label: t('analytics.calories'), icon: Flame, shortDesc: t('analytics.dailyIntake') },
    { id: 'training', label: t('analytics.training'), icon: Activity, shortDesc: t('analytics.workoutActivity') },
    { id: 'recovery', label: t('analytics.recovery'), icon: Moon, shortDesc: 'Rest & recovery' },
  ];
  
  return (
    <div className="px-5" role="group" aria-label="Metric mode selector">
      <p className="text-xs text-muted-foreground mb-2">Select what to analyze:</p>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              onClick={() => onModeChange(mode.id)}
              whileTap={{ scale: 0.95 }}
              aria-pressed={isActive ? "true" : "false"}
              aria-label={`${mode.label} - ${mode.shortDesc}${isActive ? ' (selected)' : ''}`}
              title={mode.shortDesc}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                isActive
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {mode.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CORE INTELLIGENCE GRAPH
// ═══════════════════════════════════════════════════════════════

function CoreIntelligenceGraph({
  data,
  metricMode,
  timeRange,
  onTimeRangeChange,
  selectedPoint,
  onPointSelect,
  trend,
  percentChange,
  isLoading,
}: {
  data: Array<{ date: string; value: number }>;
  metricMode: MetricMode;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  selectedPoint: number | null;
  onPointSelect: (index: number | null) => void;
  trend: 'up' | 'down' | 'stable';
  percentChange: number;
  isLoading: boolean;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // Convert data for graph
  const graphData = useMemo(() => {
    return data.map(d => ({
      date: new Date(d.date),
      value: d.value
    }));
  }, [data]);
  
  // Calculate graph dimensions
  const values = graphData.map(d => d.value);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 100;
  const range = maxValue - minValue || 1;
  const padding = range * 0.1;
  
  // Generate SVG path
  const pathD = useMemo(() => {
    if (graphData.length === 0) return '';
    const width = 350;
    const height = 180;
    const points = graphData.map((d, i) => {
      const x = (i / Math.max(graphData.length - 1, 1)) * width;
      const y = height - ((d.value - minValue + padding) / (range + padding * 2)) * height;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  }, [graphData, minValue, range, padding]);
  
  // Generate gradient fill path
  const fillD = useMemo(() => {
    if (!pathD) return '';
    const width = 350;
    const height = 180;
    return `${pathD} L ${width},${height} L 0,${height} Z`;
  }, [pathD]);
  
  // Get unit for metric
  const getUnit = () => {
    switch (metricMode) {
      case 'weight': return 'kg';
      case 'bodyFat': return '%';
      case 'leanMass': return 'kg';
      case 'calories': return 'kcal';
      default: return '';
    }
  };
  
  if (isLoading) {
    return (
      <div className="px-5">
        <div className="rounded-3xl bg-card/60 backdrop-blur-xl border border-border/30 p-5">
          <div className="h-48 flex items-center justify-center">
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-muted-foreground"
            >
              Loading data...
            </motion.div>
          </div>
        </div>
      </div>
    );
  }
  
  if (graphData.length === 0) {
    return (
      <div className="px-5">
        <div className="rounded-3xl bg-card/60 backdrop-blur-xl border border-border/30 p-5">
          <div className="h-48 flex flex-col items-center justify-center gap-3">
            <Activity className="w-12 h-12 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-muted-foreground">No {metricMode === 'bodyFat' ? 'body fat' : metricMode === 'leanMass' ? 'lean mass' : metricMode} data yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add measurements to see your progress</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="px-5"
    >
      {/* Glassmorphic Card */}
      <div className="relative overflow-hidden rounded-3xl">
        <div className="absolute inset-0 bg-card/60 backdrop-blur-xl" />
        <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 to-teal-500/5" />
        <div className="absolute inset-0 border border-white/10 dark:border-white/5 rounded-3xl" />
        
        <div className="relative p-5">
          {/* Time Range Selector */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span id="time-range-label" className="text-xs text-muted-foreground">Range</span>
              <div className="flex bg-muted/50 rounded-xl p-0.5" role="group" aria-labelledby="time-range-label">
                {(['7d', '30d', '90d'] as TimeRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => onTimeRangeChange(r)}
                    aria-pressed={timeRange === r}
                    aria-label={`View ${r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'} of data${timeRange === r ? ' (currently selected)' : ''}`}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                      timeRange === r
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Trend Badge */}
            <div className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
              trend === 'up' && "bg-emerald-500/10 text-emerald-600",
              trend === 'down' && "bg-amber-500/10 text-amber-600",
              trend === 'stable' && "bg-slate-500/10 text-slate-600"
            )}>
              {trend === 'up' && <TrendingUp className="w-3 h-3" />}
              {trend === 'down' && <TrendingDown className="w-3 h-3" />}
              {trend === 'stable' && <Minus className="w-3 h-3" />}
              {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
            </div>
          </div>
          
          {/* Graph Area */}
          <div className="relative h-48 overflow-hidden">
            <svg
              viewBox="0 0 350 180"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="graphGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="rgb(20, 184, 166)" stopOpacity="1" />
                  <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              
              {/* Grid lines (subtle) */}
              {[0.25, 0.5, 0.75].map((pos) => (
                <line
                  key={pos}
                  x1="0"
                  y1={180 * pos}
                  x2="350"
                  y2={180 * pos}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-muted/20"
                />
              ))}
              
              {/* Fill gradient */}
              <motion.path
                d={fillD}
                fill="url(#graphGradient)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
              />
              
              {/* Main line */}
              <motion.path
                d={pathD}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
              
              {/* Interactive points */}
              {graphData.map((d, i) => {
                const x = (i / Math.max(graphData.length - 1, 1)) * 350;
                const y = 180 - ((d.value - minValue + padding) / (range + padding * 2)) * 180;
                return (
                  <motion.circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={hoveredIndex === i ? 6 : 4}
                    fill="rgb(16, 185, 129)"
                    stroke="white"
                    strokeWidth="2"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => onPointSelect(i)}
                    whileHover={{ scale: 1.3 }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + i * 0.02 }}
                  />
                );
              })}
            </svg>
            
            {/* Floating Info Card */}
            <AnimatePresence>
              {(hoveredIndex !== null || selectedPoint !== null) && graphData.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-2xl bg-background/90 backdrop-blur-xl border border-border/50 shadow-lg"
                >
                  <div className="text-center">
                    <p className="text-2xl font-semibold">
                      {graphData[hoveredIndex ?? selectedPoint ?? 0]?.value.toFixed(1)}
                      <span className="text-sm text-muted-foreground ml-1">{getUnit()}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {graphData[hoveredIndex ?? selectedPoint ?? 0] && 
                        new Date(graphData[hoveredIndex ?? selectedPoint ?? 0].date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* X-axis labels */}
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{graphData[0] && new Date(graphData[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>{graphData[Math.floor(graphData.length / 2)] && new Date(graphData[Math.floor(graphData.length / 2)].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>{graphData[graphData.length - 1] && new Date(graphData[graphData.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BODY COMPOSITION INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

function BodyCompositionSection({ 
  data,
  isLoading 
}: { 
  data: AnalyticsData['bodyComposition'];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium">Body Composition</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Weight & Progress</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-card/60 animate-pulse h-36" />
          ))}
        </div>
      </div>
    );
  }
  
  // Show section if we have any weight data
  const hasData = data.currentWeight !== null || data.currentBodyFat !== null;
  
  if (!hasData) {
    return (
      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium">Body Composition</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Weight & Progress</span>
        </div>
        <div className="p-6 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 text-center">
          <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-medium">No body data yet</p>
          <p className="text-xs text-muted-foreground mt-1">Log your weight to track progress</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="px-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium">Body Composition</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Weight & Progress</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {/* Current Weight */}
        <div className="relative p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30">
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20" />
              <motion.span 
                className="text-2xl font-bold"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                {data.currentWeight?.toFixed(1) || '—'}
              </motion.span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Current (kg)</p>
            {data.weightChange !== null && data.weightChange !== 0 && (
              <p className={cn(
                "text-[10px] mt-0.5",
                data.weightChange < 0 ? "text-emerald-500" : data.weightChange > 0 ? "text-amber-500" : "text-muted-foreground"
              )}>
                {data.weightChange > 0 ? '+' : ''}{data.weightChange.toFixed(1)} kg
              </p>
            )}
          </div>
        </div>
        
        {/* Weight Trend */}
        <div className="relative p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30">
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 flex items-center justify-center">
              {data.weightChange !== null ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex items-center gap-1",
                    data.weightChange < 0 ? "text-emerald-500" : data.weightChange > 0 ? "text-amber-500" : "text-muted-foreground"
                  )}
                >
                  {data.weightChange < 0 ? (
                    <TrendingDown className="w-8 h-8" />
                  ) : data.weightChange > 0 ? (
                    <TrendingUp className="w-8 h-8" />
                  ) : (
                    <Activity className="w-8 h-8" />
                  )}
                </motion.div>
              ) : (
                <Activity className="w-8 h-8 text-muted-foreground/30" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Trend</p>
            <p className="text-[10px] mt-0.5 text-muted-foreground">
              {data.weightChange !== null 
                ? data.weightChange < 0 ? 'Losing' : data.weightChange > 0 ? 'Gaining' : 'Stable'
                : 'Log more data'}
            </p>
          </div>
        </div>
      </div>
      
      {/* Progress Summary */}
      {data.currentWeight && data.previousWeight && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10"
        >
          <div className="flex items-start gap-2">
            <Brain className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">Progress</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {data.weightChange !== null && data.weightChange < 0
                  ? `You've lost ${Math.abs(data.weightChange).toFixed(1)}kg. Keep up the great work!`
                  : data.weightChange !== null && data.weightChange > 0
                  ? `Weight increased by ${data.weightChange.toFixed(1)}kg. Review your nutrition goals.`
                  : "Weight is stable. Consistency is key to reaching your goals."}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// METABOLIC & NUTRITION ANALYTICS
// ═══════════════════════════════════════════════════════════════

function MetabolicNutritionSection({ 
  data,
  isLoading 
}: { 
  data: AnalyticsData['nutrition'];
  isLoading: boolean;
}) {
  const metrics = [
    { 
      label: 'Calorie Balance', 
      value: data.caloricBalanceScore, 
      color: 'from-amber-400 to-orange-500',
      tip: 'How close you are to your daily calorie target'
    },
    { 
      label: 'Protein Intake', 
      value: data.proteinScore, 
      color: 'from-rose-400 to-pink-500',
      tip: 'Protein helps build and maintain muscle'
    },
    { 
      label: 'Carb Timing', 
      value: data.carbTimingScore, 
      color: 'from-blue-400 to-cyan-500',
      tip: 'Eating carbs around workouts for energy'
    },
    { 
      label: 'Fat Quality', 
      value: data.fatQualityScore, 
      color: 'from-purple-400 to-violet-500',
      tip: 'Choosing healthy fats from whole foods'
    },
  ];
  
  if (isLoading) {
    return (
      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium">Nutrition Analysis</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Your Eating Habits</span>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-card/60 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  
  const hasData = data.avgCalories > 0;

  if (!hasData) {
    return (
      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium">Nutrition Analysis</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Your Eating Habits</span>
        </div>
        <div className="p-6 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 text-center">
          <Flame className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-medium">No nutrition data yet</p>
          <p className="text-xs text-muted-foreground mt-1">Start logging your meals to see how your nutrition affects your progress</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="px-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium">Nutrition Analysis</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Your Eating Habits</span>
      </div>
      
      {/* Daily average summary */}
      <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <p className="text-xs text-emerald-700">
          <span className="font-medium">Daily Average:</span> {data.avgCalories} calories, {data.avgProtein}g protein, {data.avgCarbs}g carbs, {data.avgFat}g fat
        </p>
      </div>
      
      <div className="space-y-3">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.05 }}
            className="relative"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm">{metric.label}</span>
              <span className="text-sm font-medium">{Math.round(metric.value)}%</span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <motion.div
                className={cn("h-full rounded-full bg-linear-to-r", metric.color)}
                initial={{ width: 0 }}
                animate={{ width: `${metric.value}%` }}
                transition={{ duration: 1, delay: 0.4 + i * 0.1, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        ))}
      </div>
      
      {/* Metabolic Stability Score */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-4 p-4 rounded-2xl bg-linear-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/10"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Metabolic Stability</p>
            <p className="text-2xl font-semibold mt-1">{data.metabolicStability}<span className="text-sm text-muted-foreground">/100</span></p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Avg {data.avgCalories} kcal • {data.avgProtein}g protein per day
        </p>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRAINING INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

function TrainingIntelligenceSection({ 
  data,
  isLoading 
}: { 
  data: AnalyticsData['training'];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium">Training Overview</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Your Workouts</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-card/60 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }
  
  const hasWorkouts = data.totalWorkouts > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="px-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium">Training Overview</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Your Workouts</span>
      </div>
      
      {!hasWorkouts ? (
        <div className="p-6 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 text-center">
          <Dumbbell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-medium">No workouts logged yet</p>
          <p className="text-xs text-muted-foreground mt-1">Start tracking your workouts to see your training progress</p>
        </div>
      ) : (
        <>
          {/* Quick stats summary */}
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-xs text-emerald-700">
              <span className="font-medium">Total:</span> {data.totalWorkouts} workouts · {data.totalDuration} minutes · {data.avgWorkoutDuration} min average
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Training Volume */}
            <div className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Training Volume</span>
              </div>
              <p className="text-2xl font-semibold">{data.totalVolume.toLocaleString()}<span className="text-sm text-muted-foreground ml-1">units</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">Total workload across all workouts</p>
            </div>
            
            {/* Recovery Score */}
            <div className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-4 h-4 text-rose-500" />
                <span className="text-xs text-muted-foreground">Recovery Score</span>
              </div>
              <p className="text-2xl font-semibold">{data.recoveryScore}<span className="text-sm text-muted-foreground ml-1">%</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">How well your body recovers</p>
            </div>
          </div>
        </>
      )}
      
      {/* Overtraining Radar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-3 p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Overtraining Radar</span>
          <span className="text-xs text-emerald-500">Balanced</span>
        </div>
        
        <div className="relative h-32 flex items-center justify-center">
          <svg width="120" height="120" viewBox="0 0 120 120">
            {/* Background circles */}
            {[0.3, 0.5, 0.7, 0.9].map((r) => (
              <circle
                key={r}
                cx="60"
                cy="60"
                r={50 * r}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-muted/20"
              />
            ))}
            
            {/* Axis lines */}
            {[0, 72, 144, 216, 288].map((angle) => (
              <line
                key={angle}
                x1="60"
                y1="60"
                x2={60 + 45 * Math.cos((angle - 90) * Math.PI / 180)}
                y2={60 + 45 * Math.sin((angle - 90) * Math.PI / 180)}
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-muted/20"
              />
            ))}
            
            {/* Distorted radar shape */}
            <motion.polygon
              points={generateRadarPoints({
                volume: data.volumeScore / 100,
                recovery: data.recoveryScoreRadar / 100,
                sleep: data.sleepScore / 100,
                calories: data.calorieScore / 100,
                stress: data.stressScore / 100,
              })}
              fill="rgba(16, 185, 129, 0.2)"
              stroke="rgb(16, 185, 129)"
              strokeWidth="2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
            />
            
            {/* Center dot */}
            <circle cx="60" cy="60" r="3" fill="rgb(16, 185, 129)" />
          </svg>
          
          {/* Labels */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 text-[10px] text-muted-foreground">Volume</div>
          <div className="absolute top-1/4 right-0 translate-x-2 text-[10px] text-muted-foreground">Recovery</div>
          <div className="absolute bottom-1/4 right-0 translate-x-2 text-[10px] text-muted-foreground">Sleep</div>
          <div className="absolute bottom-1/4 left-0 -translate-x-2 text-[10px] text-muted-foreground">Calories</div>
          <div className="absolute top-1/4 left-0 -translate-x-2 text-[10px] text-muted-foreground">Stress</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function generateRadarPoints(scores: {
  volume: number;
  recovery: number;
  sleep: number;
  calories: number;
  stress: number;
}): string {
  const points: string[] = [];
  const baseRadius = 35;
  const values = [
    Math.max(0.3, scores.volume),
    Math.max(0.3, scores.recovery),
    Math.max(0.3, scores.sleep),
    Math.max(0.3, scores.calories),
    Math.max(0.3, scores.stress),
  ];
  
  values.forEach((v, i) => {
    const angle = (i * 72 - 90) * Math.PI / 180;
    const r = baseRadius * v;
    const x = 60 + r * Math.cos(angle);
    const y = 60 + r * Math.sin(angle);
    points.push(`${x},${y}`);
  });
  
  return points.join(' ');
}

export default AnalyticsPage;
