'use client';

/**
 * Precision Weekly Planner - Theme-Aware UI
 * 
 * A streamlined interface for viewing AI-generated weekly plans
 * with theme support (dark, light, gymbro, gymgirl).
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dumbbell, Utensils, Moon, Pill, 
  Flame, Loader2, Target, Droplets, Brain,
  AlertCircle, Coffee, Sun, Sunset, Info, ChevronDown, ChevronUp,
  Zap, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/mobile-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Exercise {
  name: string;
  type: string;
  sets: number;
  reps: string;
  weight_kg?: number;
  notes?: string;
}

interface Meal {
  meal_type: string;
  time?: string;
  foods: Array<{
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
  }>;
  total_calories: number;
  total_protein: number;
}

interface Workout {
  focus: string;
  duration_minutes: number;
  estimated_calories_burned: number;
  intensity: string;
  exercises: Exercise[];
  warm_up?: string;
  cool_down?: string;
  coach_notes?: string;
}

interface Nutrition {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  meals: Meal[];
  hydration_ml: number;
}

interface DailyPlan {
  date: string;
  day_name: string;
  is_workout_day: boolean;
  workout: Workout | null;
  nutrition: Nutrition;
  sleep: { target_bedtime: string; target_wake_time: string; target_duration_hours: number };
  supplements: Array<{ name: string; dose: string; timing: string }>;
  coach_message: string;
  confidence: number;
}

interface WeeklyPlan {
  week_start: string;
  week_end: string;
  plan_confidence: number;
  generation_reasoning: string;
  weekly_overview: {
    total_workout_days: number;
    total_rest_days: number;
    weekly_calorie_target: number;
    weekly_protein_target: number;
    focus_areas: string[];
    weekly_strategy: string;
  };
  daily_plan: DailyPlan[];
  recommendations?: Array<{ category: string; priority: string; recommendation: string; reasoning: string }>;
  weekly_nutrition_summary?: {
    avg_daily_calories: number;
    avg_daily_protein: number;
    training_day_calories: number;
    rest_day_calories: number;
  };
  weekly_workout_summary?: {
    training_split: string;
    volume_level: string;
    intensity_progression: string;
  };
}

interface WeeklyPlannerProps {
  theme?: string;
  onClose?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// THEME DETECTION HOOK
// ═══════════════════════════════════════════════════════════════

function useCurrentTheme() {
  const [theme, setTheme] = useState('dark');
  const initialRef = useRef(false);

  useEffect(() => {
    const detectTheme = () => {
      const html = document.documentElement;
      if (html.classList.contains('gymbro')) return 'gymbro';
      if (html.classList.contains('gymgirl')) return 'gymgirl';
      if (html.classList.contains('light') || html.classList.contains('white')) return 'light';
      if (html.classList.contains('dark')) return 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    if (!initialRef.current) {
      initialRef.current = true;
      queueMicrotask(() => setTheme(detectTheme()));
    }

    const observer = new MutationObserver(() => setTheme(detectTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

// ═══════════════════════════════════════════════════════════════
// THEME-AWARE STYLES
// ═══════════════════════════════════════════════════════════════

function getThemeStyles(theme: string) {
  switch (theme) {
    case 'gymbro':
      return {
        container: 'bg-[#050607]',
        header: 'border-red-900/50',
        card: 'bg-[#0A0C0E] border-red-900/30',
        cardAlt: 'bg-[#080A0C]',
        text: 'text-white',
        textMuted: 'text-zinc-400',
        textSub: 'text-red-300/70',
        accent: 'text-red-400',
        accentBg: 'bg-red-500/10 border-red-500/20',
        accentText: 'text-red-100',
        border: 'border-red-900/30',
        borderMuted: 'border-red-900/20',
        button: 'bg-red-500',
        buttonRing: 'ring-red-500/50',
        tabBg: 'bg-[#0A0C0E]',
        proteinColor: 'text-red-400',
        carbsColor: 'text-amber-400',
        fatColor: 'text-blue-400',
        calColor: 'text-red-400',
        proteinBar: 'bg-red-500',
        carbsBar: 'bg-amber-500',
        fatBar: 'bg-blue-500',
        barBg: 'bg-red-900/30',
        icon: 'text-red-400',
        selected: 'bg-red-500 text-white',
        today: 'bg-[#121517] text-red-400 ring-1 ring-red-500/50',
        unselected: 'bg-[#121517]/50 text-zinc-400 hover:bg-[#121517]',
      };
    case 'gymgirl':
      return {
        container: 'bg-[#FFE4EE]',
        header: 'border-pink-200',
        card: 'bg-white/90 border-pink-100',
        cardAlt: 'bg-pink-50/80',
        text: 'text-[#4A1A2C]',
        textMuted: 'text-pink-400',
        textSub: 'text-pink-500',
        accent: 'text-pink-500',
        accentBg: 'bg-pink-100 border-pink-200',
        accentText: 'text-[#4A1A2C]',
        border: 'border-pink-200',
        borderMuted: 'border-pink-100',
        button: 'bg-pink-500',
        buttonRing: 'ring-pink-400/50',
        tabBg: 'bg-white/80',
        proteinColor: 'text-rose-500',
        carbsColor: 'text-amber-500',
        fatColor: 'text-blue-400',
        calColor: 'text-pink-500',
        proteinBar: 'bg-rose-500',
        carbsBar: 'bg-amber-400',
        fatBar: 'bg-blue-400',
        barBg: 'bg-pink-200',
        icon: 'text-pink-500',
        selected: 'bg-pink-500 text-white',
        today: 'bg-white text-pink-500 ring-1 ring-pink-400/50',
        unselected: 'bg-white/50 text-pink-400 hover:bg-white/80',
      };
    case 'light':
      return {
        container: 'bg-white',
        header: 'border-zinc-200',
        card: 'bg-zinc-50 border-zinc-200',
        cardAlt: 'bg-zinc-100/50',
        text: 'text-zinc-900',
        textMuted: 'text-zinc-500',
        textSub: 'text-zinc-600',
        accent: 'text-violet-500',
        accentBg: 'bg-violet-50 border-violet-200',
        accentText: 'text-violet-900',
        border: 'border-zinc-200',
        borderMuted: 'border-zinc-100',
        button: 'bg-violet-500',
        buttonRing: 'ring-violet-400/50',
        tabBg: 'bg-zinc-100',
        proteinColor: 'text-red-500',
        carbsColor: 'text-amber-500',
        fatColor: 'text-blue-500',
        calColor: 'text-violet-500',
        proteinBar: 'bg-red-500',
        carbsBar: 'bg-amber-500',
        fatBar: 'bg-blue-500',
        barBg: 'bg-zinc-200',
        icon: 'text-violet-500',
        selected: 'bg-violet-500 text-white',
        today: 'bg-zinc-100 text-violet-500 ring-1 ring-violet-400/50',
        unselected: 'bg-zinc-100/50 text-zinc-500 hover:bg-zinc-100',
      };
    default: // dark
      return {
        container: 'bg-zinc-900',
        header: 'border-zinc-800',
        card: 'bg-zinc-800/50 border-zinc-700',
        cardAlt: 'bg-zinc-800/30',
        text: 'text-white',
        textMuted: 'text-zinc-400',
        textSub: 'text-zinc-500',
        accent: 'text-violet-400',
        accentBg: 'bg-violet-500/10 border-violet-500/20',
        accentText: 'text-violet-100',
        border: 'border-zinc-700',
        borderMuted: 'border-zinc-800',
        button: 'bg-violet-500',
        buttonRing: 'ring-violet-500/50',
        tabBg: 'bg-zinc-800',
        proteinColor: 'text-red-400',
        carbsColor: 'text-yellow-400',
        fatColor: 'text-blue-400',
        calColor: 'text-violet-400',
        proteinBar: 'bg-red-500',
        carbsBar: 'bg-yellow-500',
        fatBar: 'bg-blue-500',
        barBg: 'bg-zinc-700',
        icon: 'text-violet-500',
        selected: 'bg-violet-500 text-white',
        today: 'bg-zinc-800 text-violet-400 ring-1 ring-violet-500/50',
        unselected: 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800',
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════

function MealIcon({ type }: { type: string }) {
  const lower = type.toLowerCase();
  if (lower.includes('breakfast')) return <Coffee className="w-4 h-4" />;
  if (lower.includes('lunch')) return <Sun className="w-4 h-4" />;
  if (lower.includes('dinner')) return <Sunset className="w-4 h-4" />;
  return <Utensils className="w-4 h-4" />;
}

function MacroBar({ protein, carbs, fat, calories, styles }: { 
  protein: number; 
  carbs: number; 
  fat: number; 
  calories: number;
  styles: ReturnType<typeof getThemeStyles>;
}) {
  const total = protein * 4 + carbs * 4 + fat * 9;
  const proteinPct = total > 0 ? (protein * 4 / total) * 100 : 33;
  const carbsPct = total > 0 ? (carbs * 4 / total) * 100 : 33;
  const fatPct = total > 0 ? (fat * 9 / total) * 100 : 34;

  return (
    <div className="space-y-2">
      <div className={cn("flex h-2 rounded-full overflow-hidden", styles.barBg)}>
        <div className={styles.proteinBar} style={{ width: `${proteinPct}%` }} />
        <div className={styles.carbsBar} style={{ width: `${carbsPct}%` }} />
        <div className={styles.fatBar} style={{ width: `${fatPct}%` }} />
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className={cn("text-lg font-bold", styles.proteinColor)}>{protein}g</div>
          <div className={cn("text-xs", styles.textMuted)}>Protein</div>
        </div>
        <div>
          <div className={cn("text-lg font-bold", styles.carbsColor)}>{carbs}g</div>
          <div className={cn("text-xs", styles.textMuted)}>Carbs</div>
        </div>
        <div>
          <div className={cn("text-lg font-bold", styles.fatColor)}>{fat}g</div>
          <div className={cn("text-xs", styles.textMuted)}>Fat</div>
        </div>
        <div>
          <div className={cn("text-lg font-bold", styles.calColor)}>{calories}</div>
          <div className={cn("text-xs", styles.textMuted)}>Cal</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WHY THIS PLAN SECTION
// ═══════════════════════════════════════════════════════════════

function WhyThisPlanSection({ plan, styles }: { plan: WeeklyPlan; styles: ReturnType<typeof getThemeStyles> }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const overview = plan.weekly_overview;
  const recommendations = plan.recommendations || [];
  const workoutSummary = plan.weekly_workout_summary;
  const nutritionSummary = plan.weekly_nutrition_summary;

  return (
    <div className={cn("border-b", styles.border)}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn("w-full px-4 py-3 flex items-center justify-between transition-colors", styles.cardAlt, "hover:opacity-80")}
      >
        <div className="flex items-center gap-2">
          <Info className={cn("w-4 h-4", styles.icon)} />
          <span className={cn("text-sm font-medium", styles.text)}>Why This Plan?</span>
        </div>
        {isExpanded ? (
          <ChevronUp className={cn("w-4 h-4", styles.textMuted)} />
        ) : (
          <ChevronDown className={cn("w-4 h-4", styles.textMuted)} />
        )}
      </button>
      
      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Main Reasoning */}
              {plan.generation_reasoning && (
                <div className={cn("p-3 rounded-lg border", styles.accentBg)}>
                  <p className={cn("text-sm", styles.accentText)}>{plan.generation_reasoning}</p>
                </div>
              )}
              
              {/* Key Decisions Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className={cn("p-3 rounded-lg", styles.card)}>
                  <div className="flex items-center gap-2 mb-1">
                    <Dumbbell className={cn("w-3.5 h-3.5", styles.proteinColor)} />
                    <span className={cn("text-xs", styles.textMuted)}>Training</span>
                  </div>
                  <p className={cn("text-sm font-medium", styles.text)}>{overview.total_workout_days} days/week</p>
                  <p className={cn("text-xs mt-0.5", styles.textSub)}>{workoutSummary?.training_split || 'Balanced split'}</p>
                </div>
                
                <div className={cn("p-3 rounded-lg", styles.card)}>
                  <div className="flex items-center gap-2 mb-1">
                    <Utensils className={cn("w-3.5 h-3.5", styles.carbsColor)} />
                    <span className={cn("text-xs", styles.textMuted)}>Nutrition</span>
                  </div>
                  <p className={cn("text-sm font-medium", styles.text)}>{nutritionSummary?.avg_daily_calories || Math.round(overview.weekly_calorie_target / 7)} cal/day</p>
                  <p className={cn("text-xs mt-0.5", styles.textSub)}>{nutritionSummary?.avg_daily_protein || Math.round(overview.weekly_protein_target / 7)}g protein</p>
                </div>
                
                <div className={cn("p-3 rounded-lg", styles.card)}>
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-3.5 h-3.5 text-green-400" />
                    <span className={cn("text-xs", styles.textMuted)}>Intensity</span>
                  </div>
                  <p className={cn("text-sm font-medium capitalize", styles.text)}>{workoutSummary?.volume_level || 'Moderate'}</p>
                  <p className={cn("text-xs mt-0.5", styles.textSub)}>{workoutSummary?.intensity_progression || 'Steady progress'}</p>
                </div>
                
                <div className={cn("p-3 rounded-lg", styles.card)}>
                  <div className="flex items-center gap-2 mb-1">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span className={cn("text-xs", styles.textMuted)}>Recovery</span>
                  </div>
                  <p className={cn("text-sm font-medium", styles.text)}>{overview.total_rest_days} rest days</p>
                  <p className={cn("text-xs mt-0.5", styles.textSub)}>Essential for growth</p>
                </div>
              </div>
              
              {/* Key Recommendations */}
              {recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className={cn("text-xs font-semibold uppercase tracking-wider", styles.textMuted)}>Key Focus Areas</h4>
                  {recommendations.slice(0, 3).map((rec, i) => (
                    <div key={i} className={cn("flex items-start gap-2 p-2 rounded-lg", styles.cardAlt)}>
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        rec.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                        rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      )}>
                        <Zap className="w-3 h-3" />
                      </div>
                      <div>
                        <p className={cn("text-sm", styles.text)}>{rec.recommendation}</p>
                        <p className={cn("text-xs mt-0.5", styles.textSub)}>{rec.reasoning}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Focus Areas Tags */}
              {overview.focus_areas && overview.focus_areas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {overview.focus_areas.map((area, i) => (
                    <Badge key={i} variant="outline" className={cn("text-xs", styles.card)}>
                      {area.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function WeeklyPlanner({ theme: propTheme }: WeeklyPlannerProps) {
  const detectedTheme = useCurrentTheme();
  const theme = propTheme || detectedTheme;
  const styles = useMemo(() => getThemeStyles(theme), [theme]);
  
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [generationSource, setGenerationSource] = useState<'ai' | 'fallback' | null>(null);
  const [aiErrors, setAiErrors] = useState<Array<{ attempt: string; stage: string; error: string }> | null>(null);

  const loadPlan = useCallback(async (forceRegenerate = false) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiFetch('/api/iron-coach/weekly-planner', {
        method: 'POST',
        body: JSON.stringify({ force_regenerate: forceRegenerate }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to generate plan');
      }

      const data = await response.json();
      
      if (data.success && data.plan) {
        setPlan(data.plan);
        setGenerationSource(data.generation_source || null);
        setAiErrors(data.ai_errors || null);
        const today = new Date().toISOString().split('T')[0];
        const todayIndex = data.plan.daily_plan?.findIndex((d: DailyPlan) => d.date === today);
        if (todayIndex >= 0) setSelectedDayIndex(todayIndex);
      } else {
        throw new Error(data.message || 'Failed to generate plan');
      }
    } catch (err) {
      console.error('[WeeklyPlanner] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plan');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const currentDay = plan?.daily_plan[selectedDayIndex];

  // Derive a human-readable error summary from AI errors
  const aiErrorSummary = useMemo(() => {
    if (!aiErrors || aiErrors.length === 0) return null;
    const stages = new Set(aiErrors.map(e => e.stage));
    const messages = aiErrors.map(e => e.error);
    
    // Classify the main problem
    const apiErrors = aiErrors.filter(e => e.stage === 'api_call');
    const parseErrors = aiErrors.filter(e => e.stage === 'json_parse' || e.stage === 'json_repair');
    
    if (apiErrors.length === aiErrors.length) {
      // All failures were API-level
      const hasRateLimit = messages.some(m => m.includes('429') || m.includes('rate limit') || m.includes('high demand'));
      const hasTimeout = messages.some(m => m.includes('timeout') || m.includes('timed out'));
      const hasUnavailable = messages.some(m => m.includes('503') || m.includes('unavailable') || m.includes('busy'));
      
      if (hasRateLimit) return { type: 'rate_limit' as const, detail: 'Groq API rate limit hit. Too many requests — wait a minute and retry.' };
      if (hasTimeout) return { type: 'timeout' as const, detail: 'AI API timed out. The model may be overloaded.' };
      if (hasUnavailable) return { type: 'overloaded' as const, detail: 'All AI models are currently overloaded. Groq free tier limitation.' };
      return { type: 'api_error' as const, detail: apiErrors[apiErrors.length - 1]?.error || 'Unknown API error' };
    }
    if (parseErrors.length > 0) {
      return { type: 'parse_error' as const, detail: `AI returned invalid JSON after ${aiErrors.length} attempts. Model may be too small for this task.` };
    }
    return { type: 'mixed' as const, detail: `${aiErrors.length} failures across multiple stages. See logs for details.` };
  }, [aiErrors]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full p-8", styles.container)}>
        <Flame className={cn("w-10 h-10 mb-4 animate-pulse", styles.icon)} />
        <Loader2 className={cn("w-6 h-6 animate-spin mb-3", styles.icon)} />
        <div className={cn("text-lg font-semibold", styles.text)}>
          Building your plan...
        </div>
        <div className={cn("text-sm mt-1", styles.textMuted)}>
          Analyzing your fitness data
        </div>
      </div>
    );
  }

  // Error state
  if (error || !plan) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full p-8", styles.container)}>
        <AlertCircle className="w-10 h-10 mb-4 text-red-400" />
        <div className={cn("text-lg font-semibold mb-2", styles.text)}>Unable to Load Plan</div>
        <div className={cn("text-sm mb-4 text-center", styles.textMuted)}>{error}</div>
      </div>
    );
  }

  const overview = plan.weekly_overview;

  return (
    <div className={cn("flex flex-col h-full min-h-0", styles.container)}>
      {/* Fallback Banner — shown when AI was unavailable */}
      {generationSource === 'fallback' && aiErrorSummary && (
        <div className={cn("shrink-0 px-4 py-2.5 border-b", styles.border, "bg-amber-500/10")}>
          <div className="flex items-start gap-2">
            <AlertCircle className={cn("w-4 h-4 shrink-0 mt-0.5 text-amber-500")} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("text-xs font-semibold text-amber-600 dark:text-amber-400")}>
                  Smart Fallback Plan
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400">
                  not AI-generated
                </Badge>
              </div>
              <p className={cn("text-xs", styles.textMuted)}>
                AI is currently unavailable. This plan was built from your profile data.
              </p>
              {/* Collapsible error details */}
              <details className="mt-1.5">
                <summary className={cn("text-[10px] cursor-pointer hover:underline", styles.textSub)}>
                  Technical details ({aiErrors?.length || 0} errors)
                </summary>
                <div className={cn("mt-1 p-2 rounded text-[10px] font-mono overflow-x-auto max-h-24 overflow-y-auto", styles.card)}>
                  <div className="mb-1 font-semibold">Problem: {aiErrorSummary.detail}</div>
                  {aiErrors?.map((e, i) => (
                    <div key={i} className="opacity-70">
                      [{e.attempt}] {e.stage}: {e.error.length > 120 ? e.error.slice(0, 120) + '...' : e.error}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* AI Success Badge */}
      {generationSource === 'ai' && (
        <div className={cn("shrink-0 px-4 py-1.5 border-b", styles.border)}>
          <div className="flex items-center gap-1.5">
            <Brain className={cn("w-3.5 h-3.5 text-emerald-500")} />
            <span className={cn("text-[11px] font-medium text-emerald-600 dark:text-emerald-400")}>
              AI-Generated Plan
            </span>
          </div>
        </div>
      )}

      {/* Compact Header */}
      <div className={cn("shrink-0 px-4 py-3 border-b", styles.header)}>
        <div className="flex items-center gap-2">
          <Flame className={cn("w-5 h-5", styles.icon)} />
          <span className={cn("font-bold", styles.text)}>Weekly Plan</span>
          <Badge variant="outline" className={cn("text-xs", styles.card)}>
            {Math.round((plan.plan_confidence || 0.7) * 100)}% match
          </Badge>
        </div>
        <div className={cn("text-xs mt-1", styles.textMuted)}>
          {new Date(plan.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(plan.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          <span className="mx-2">•</span>
          {overview.total_workout_days} workouts / {overview.total_rest_days} rest
        </div>
      </div>

      {/* Why This Plan Section */}
      <WhyThisPlanSection plan={plan} styles={styles} />

      {/* Day Selector - Compact Pills */}
      <div className={cn("shrink-0 px-4 py-2 border-b", styles.border)}>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {plan.daily_plan?.map((day, index) => {
            const today = new Date().toISOString().split('T')[0];
            const isToday = day.date === today;
            const isSelected = index === selectedDayIndex;
            
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDayIndex(index)}
                className={cn(
                  "flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0",
                  isSelected 
                    ? styles.selected
                    : isToday 
                      ? styles.today
                      : styles.unselected
                )}
              >
                <span className="text-[10px] uppercase tracking-wider">{day.day_name.slice(0, 3)}</span>
                <span className={cn("text-base", day.is_workout_day && "font-bold")}>
                  {day.is_workout_day && day.workout ? '💪' : '😴'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content - Tabbed */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {currentDay && (
          <Tabs defaultValue="workout" className="w-full h-full flex flex-col">
            <TabsList className={cn("shrink-0 w-full grid grid-cols-3 rounded-none border-b", styles.tabBg, styles.border)}>
              <TabsTrigger value="workout" className={cn("data-[state=active]:", styles.tabBg)}>
                <Dumbbell className="w-4 h-4 mr-1" />
                Workout
              </TabsTrigger>
              <TabsTrigger value="nutrition" className={cn("data-[state=active]:", styles.tabBg)}>
                <Utensils className="w-4 h-4 mr-1" />
                Nutrition
              </TabsTrigger>
              <TabsTrigger value="recovery" className={cn("data-[state=active]:", styles.tabBg)}>
                <Moon className="w-4 h-4 mr-1" />
                Recovery
              </TabsTrigger>
            </TabsList>

            {/* Workout Tab */}
            <TabsContent value="workout" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0">
              {currentDay.workout ? (
                <div className="space-y-4">
                  {/* Coach Message */}
                  <Card className={cn("border", styles.card)}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <Brain className={cn("w-4 h-4 shrink-0 mt-0.5", styles.icon)} />
                        <p className={cn("text-sm", styles.textMuted)}>{currentDay.coach_message}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Workout Summary */}
                  <Card className={cn("border", styles.card)}>
                    <CardHeader className="pb-2 pt-3 px-3">
                      <CardTitle className={cn("text-base flex items-center justify-between", styles.text)}>
                        <span>{currentDay.workout.focus}</span>
                        <Badge variant="secondary" className="text-xs">
                          {currentDay.workout.duration_minutes} min
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3 px-3">
                      <div className={cn("flex gap-4 text-xs mb-3", styles.textMuted)}>
                        <span>🔥 {currentDay.workout.estimated_calories_burned} cal</span>
                        <span>⚡ {currentDay.workout.intensity}</span>
                      </div>
                      
                      {/* Exercise List */}
                      <div className="space-y-2">
                        {currentDay.workout.exercises?.slice(0, 5).map((ex, i) => (
                          <div key={i} className={cn("flex items-center justify-between p-2 rounded-lg", styles.cardAlt)}>
                            <div>
                              <div className={cn("font-medium text-sm", styles.text)}>{ex.name}</div>
                              <div className={cn("text-xs", styles.textSub)}>
                                {ex.sets} × {ex.reps} {ex.weight_kg ? `@ ${ex.weight_kg}kg` : ''}
                              </div>
                            </div>
                            <Badge variant="outline" className={cn("text-[10px]", styles.card)}>{ex.type}</Badge>
                          </div>
                        ))}
                      </div>

                      {currentDay.workout.warm_up && (
                        <div className={cn("mt-3 text-xs", styles.textSub)}>
                          <span className={cn("font-medium", styles.textMuted)}>Warm-up:</span> {currentDay.workout.warm_up}
                        </div>
                      )}
                      
                      {currentDay.workout.coach_notes && (
                        <div className={cn("mt-2 p-2 rounded text-xs", styles.accentBg, styles.accentText)}>
                          💡 {currentDay.workout.coach_notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Moon className={cn("w-12 h-12 mb-3", styles.textMuted, "opacity-50")} />
                  <div className={cn("text-lg font-semibold", styles.text)}>Rest Day</div>
                  <p className={cn("text-sm mt-1", styles.textSub)}>Recovery is when growth happens</p>
                </div>
              )}
            </TabsContent>

            {/* Nutrition Tab */}
            <TabsContent value="nutrition" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0">
              <div className="space-y-4">
                {/* Macro Overview */}
                <Card className={cn("border", styles.card)}>
                  <CardContent className="p-3">
                    <MacroBar
                      protein={currentDay.nutrition.target_protein}
                      carbs={currentDay.nutrition.target_carbs}
                      fat={currentDay.nutrition.target_fat}
                      calories={currentDay.nutrition.target_calories}
                      styles={styles}
                    />
                  </CardContent>
                </Card>

                {/* Hydration */}
                <div className={cn("flex items-center gap-2 p-3 rounded-lg border", styles.card, styles.border)}>
                  <Droplets className="w-4 h-4 text-blue-400" />
                  <span className={cn("text-sm", styles.textMuted)}>
                    {Math.round(currentDay.nutrition.hydration_ml / 1000)}L water ({Math.round(currentDay.nutrition.hydration_ml / 250)} glasses)
                  </span>
                </div>

                {/* Meals */}
                <div className="space-y-2">
                  {currentDay.nutrition.meals?.map((meal, i) => (
                    <Card key={i} className={cn("border", styles.card)}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <MealIcon type={meal.meal_type} />
                            <span className={cn("font-medium text-sm capitalize", styles.text)}>{meal.meal_type}</span>
                          </div>
                          <div className={cn("text-xs", styles.textMuted)}>
                            {meal.total_calories} cal • {meal.total_protein}g P
                          </div>
                        </div>
                        <div className={cn("text-xs", styles.textSub)}>
                          {meal.foods?.slice(0, 3).map(f => f.name).join(', ')}
                          {meal.foods?.length > 3 && '...'}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Recovery Tab */}
            <TabsContent value="recovery" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0">
              <div className="space-y-4">
                {/* Sleep */}
                <Card className={cn("border", styles.card)}>
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className={cn("text-base flex items-center gap-2", styles.text)}>
                      <Moon className="w-4 h-4 text-indigo-400" />
                      Sleep Target
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-3">
                    <div className="flex items-center justify-between">
                      <div className={cn("text-2xl font-bold", styles.text)}>
                        {currentDay.sleep.target_bedtime} → {currentDay.sleep.target_wake_time}
                      </div>
                      <Badge variant="secondary">{currentDay.sleep.target_duration_hours}h</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Supplements */}
                <Card className={cn("border", styles.card)}>
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className={cn("text-base flex items-center gap-2", styles.text)}>
                      <Pill className="w-4 h-4 text-green-400" />
                      Supplements
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-3">
                    {currentDay.supplements?.length > 0 ? (
                      <div className="space-y-2">
                        {currentDay.supplements.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className={styles.text}>{s.name}</span>
                            <span className={styles.textSub}>{s.dose} • {s.timing}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={cn("text-sm", styles.textSub)}>No supplements planned</div>
                    )}
                  </CardContent>
                </Card>

                {/* Weekly Strategy */}
                <Card className={cn("border", styles.card)}>
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className={cn("text-base flex items-center gap-2", styles.text)}>
                      <Target className={cn("w-4 h-4", styles.icon)} />
                      This Week's Focus
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-3">
                    <p className={cn("text-sm", styles.textMuted)}>{overview.weekly_strategy}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {overview.focus_areas?.map((area, i) => (
                        <Badge key={i} variant="outline" className={cn("text-xs", styles.card)}>
                          {area.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

export default WeeklyPlanner;
