"use client";

import * as React from "react";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Camera,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  X,
  Sparkles,
  Flame,
  Zap,
  ArrowRight,
  Utensils,
  Coffee,
  Sun,
  Moon,
  Apple,
  Pill,
  Shield,
  Droplets,
  Minus,
  Edit3,
  Trash2,
  Activity,
  AlertCircle,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiFetch } from '@/lib/mobile-api';
import { useApp } from "@/contexts/app-context";
import { useLocale } from "@/lib/i18n/locale-context";
import type { AnalyzedFood } from "./food-photo-scanner";
import { FoodPhotoScanner } from "./food-photo-scanner";
import { UnifiedFoodScanner } from "./unified-food-scanner";
import { ScannedFoodQuickAdd } from "./scanned-food-quick-add";
import type { ScannedFood } from "@/hooks/use-barcode-scanner";
import { toast } from "@/hooks/use-toast";

// Helper: map raw supplement_logs DB rows (snake_case) to MealEntry[]
function mapSupplementLogEntries(entries: any[]): MealEntry[] {
  return (entries || []).map((entry: any) => ({
    id: entry.id,
    food: {
      id: entry.supplement_id || entry.id,
      name: entry.supplement_name || 'Unknown Supplement',
      calories: entry.calories ?? 0,
      protein: entry.protein ?? 0,
      carbs: entry.carbs ?? 0,
      fat: entry.fat ?? 0,
      servingSize: entry.quantity ?? 1,
      servingUnit: entry.unit ?? 'serving',
      isVerified: true,
      tags: ['supplement'],
      confidence: 0.9,
      source: 'supplements' as const,
    },
    quantity: entry.quantity ?? 1,
    loggedAt: new Date(entry.logged_at || entry.created_at),
    nutrition: {
      calories: entry.calories ?? 0,
      protein: entry.protein ?? 0,
      carbs: entry.carbs ?? 0,
      fat: entry.fat ?? 0,
    },
  }));
}

// ============================================
// Types
// ============================================

type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "supplements";

interface Food {
  id: string;
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
  isVerified: boolean;
  tags: string[];
  confidence: number;
  source?: 'global' | 'local' | 'manual' | 'supplements'; // Where the food data comes from
}

interface MealEntry {
  id: string;
  food: Food;
  quantity: number;
  loggedAt: Date;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

interface MealCardData {
  type: MealType;
  entries: MealEntry[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

// ============================================
// Constants
// ============================================

// Type for meal config
type MealConfig = {
  icon: React.ElementType;
  label: string;
  color: string;
  time: string;
};

// Get meal config with translations
const getMealConfig = (t: (key: string) => string): Record<MealType, MealConfig> => ({
  breakfast: { icon: Coffee, label: t('foods.log.breakfast'), color: "from-amber-500/20 to-orange-500/20", time: "6:00 - 10:00 AM" },
  lunch: { icon: Sun, label: t('foods.log.lunch'), color: "from-yellow-500/20 to-amber-500/20", time: "11:00 AM - 2:00 PM" },
  dinner: { icon: Moon, label: t('foods.log.dinner'), color: "from-indigo-500/20 to-purple-500/20", time: "5:00 - 9:00 PM" },
  snack: { icon: Apple, label: t('foods.log.snack'), color: "from-emerald-500/20 to-teal-500/20", time: "Anytime" },
  supplements: { icon: Pill, label: t('foods.supplements'), color: "from-rose-500/20 to-pink-500/20", time: "Daily" },
});

// Static config for components that don't have access to t (icon and color only)
const MEAL_CONFIG_STATIC = {
  breakfast: { icon: Coffee, color: "from-amber-500/20 to-orange-500/20", time: "6:00 - 10:00 AM" },
  lunch: { icon: Sun, color: "from-yellow-500/20 to-amber-500/20", time: "11:00 AM - 2:00 PM" },
  dinner: { icon: Moon, color: "from-indigo-500/20 to-purple-500/20", time: "5:00 - 9:00 PM" },
  snack: { icon: Apple, color: "from-emerald-500/20 to-teal-500/20", time: "Anytime" },
  supplements: { icon: Pill, color: "from-rose-500/20 to-pink-500/20", time: "Daily" },
};

const DEFAULT_TARGETS = {
  calories: 2200,
  protein: 165,
  carbs: 220,
  fat: 75,
  water: 2500,
};

// ============================================
// Utility Components
// ============================================

// Animated Ring Progress with color change when exceeded
// Memoized to prevent re-renders when parent updates
const RingProgress = React.memo(function RingProgress({
  progress,
  size = 160,
  strokeWidth = 10,
  isExceeded = false,
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  isExceeded?: boolean;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Show actual progress, even if over 100%
  const displayProgress = Math.min(progress, 100);
  const offset = circumference - (displayProgress / 100) * circumference;

  return (
    <div className="relative inline-block">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress ring */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={isExceeded ? "text-rose-500" : "text-emerald-500"}
          style={{ strokeDasharray: circumference }}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
});

// Macro Progress Bar with Full Name - shows red when exceeded
// Memoized to prevent re-renders when parent updates
const MacroProgressBar = React.memo(function MacroProgressBar({
  label,
  current,
  target,
  color,
  icon: Icon,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  icon: React.ElementType;
}) {
  const percentage = Math.min((current / target) * 100, 100);
  const isExceeded = current > target;
  const isComplete = current >= target && !isExceeded;

  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center",
        isExceeded ? "bg-rose-500/10" : `bg-${color}-500/10`
      )}>
        <Icon className={cn(
          "w-4 h-4",
          isExceeded ? "text-rose-500" : `text-${color}-500`
        )} />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">{label}</span>
          <span className={cn(
            "text-sm font-bold",
            isExceeded ? "text-rose-500" : isComplete ? `text-${color}-500` : "text-foreground"
          )}>
            {Math.round(current)}g <span className="text-muted-foreground font-normal">/ {target}g</span>
            {isExceeded && <span className="ml-1 text-rose-500">⚠️</span>}
          </span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", isExceeded ? "bg-rose-500" : `bg-${color}-500`)}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
});

// Hydration Tracker with Tube-style UI
// Memoized to prevent re-renders when parent updates
const HydrationTracker = React.memo(function HydrationTracker({
  current,
  target,
  onAddWater,
  onRemoveWater,
  onClearWater,
  onUpdateTarget,
  entries,
  isSyncing,
  t,
}: {
  current: number;
  target: number;
  onAddWater: (ml: number) => Promise<void>;
  onRemoveWater: () => Promise<void>;
  onClearWater: () => Promise<void>;
  onUpdateTarget: (ml: number) => void;
  entries: { id: string; value: number; capturedAt: string }[];
  isSyncing?: boolean;
  t: (key: string) => string;
}) {
  const [showActions, setShowActions] = React.useState(false);
  const [showTargetEdit, setShowTargetEdit] = React.useState(false);
  
  const isExceeded = current > target;
  const isGoalMet = current >= target && !isExceeded;
  const percentage = Math.min((current / target) * 100, 100);

  const handleAddWater = async (ml: number) => {
    await onAddWater(ml);
  };

  const handleRemoveWater = async () => {
    await onRemoveWater();
    setShowActions(false);
  };

  const handleClearWater = async () => {
    await onClearWater();
    setShowActions(false);
  };

  const waterAmounts = [
    { label: t('foods.glass'), ml: 250 },
    { label: t('foods.bottle'), ml: 500 },
    { label: t('foods.large'), ml: 750 },
  ];

  return (
    <div className={cn(
      "rounded-2xl p-4 border",
      isExceeded 
        ? "bg-linear-to-br from-rose-500/10 to-red-500/10 border-rose-500/20"
        : isGoalMet
          ? "bg-linear-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20"
          : "bg-linear-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplets className={cn(
            "w-5 h-5",
            isExceeded ? "text-rose-500" : isGoalMet ? "text-emerald-500" : "text-cyan-500"
          )} />
          <span className="font-medium">{t('foods.hydration')}</span>
          {isGoalMet && <span className="text-emerald-500 text-xs font-medium">✓ {t('foods.goal')}!</span>}
        </div>
        <button
          onClick={() => setShowTargetEdit(!showTargetEdit)}
          aria-label="Edit daily water goal"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {Math.round(current)} / {target} ml
        </button>
      </div>

      {/* Tube Progress Bar - Simple and fast */}
      <div className="relative h-10 bg-muted/30 rounded-xl overflow-hidden mb-3">
        {/* Water fill - instant spring animation */}
        <motion.div
          className={cn(
            "absolute bottom-0 left-0 right-0 rounded-xl",
            isExceeded 
              ? "bg-linear-to-t from-rose-500 to-rose-400"
              : isGoalMet
                ? "bg-linear-to-t from-emerald-500 to-emerald-400"
                : "bg-linear-to-t from-cyan-500 to-cyan-400"
          )}
          initial={false}
          animate={{ height: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
        
        {/* Percentage text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white drop-shadow-sm">
            {Math.round(percentage)}%
          </span>
        </div>
      </div>

      {/* Target adjustment */}
      <AnimatePresence>
        {showTargetEdit && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-3"
          >
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/30">
              <span className="text-xs text-muted-foreground">{t('foods.dailyGoal')}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateTarget(target - 250)}
                  aria-label="Decrease water goal by 250ml"
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors active:scale-95"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium w-16 text-center">{target} ml</span>
                <button
                  onClick={() => onUpdateTarget(target + 250)}
                  aria-label="Increase water goal by 250ml"
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons - Instant response */}
      <div className="flex items-center gap-2">
        {/* Quick add buttons */}
        {waterAmounts.map((amount) => (
          <button
            key={amount.ml}
            onClick={() => handleAddWater(amount.ml)}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-xl text-sm font-medium active:scale-[0.97] touch-manipulation transition-transform",
              isExceeded
                ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                : isGoalMet
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400"
            )}
          >
            +{amount.ml}
          </button>
        ))}
        
        {/* Actions toggle */}
        {entries.length > 0 && (
          <button
            onClick={() => setShowActions(!showActions)}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              showActions ? "bg-muted" : "bg-muted/50"
            )}
          >
            <span className="text-xs font-medium">{entries.length}</span>
          </button>
        )}
      </div>

      {/* Undo/Clear buttons - Instant */}
      <AnimatePresence>
        {showActions && entries.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden mt-2"
          >
            <div className="flex items-center gap-2 pt-2 border-t border-muted/30">
              <button
                onClick={handleRemoveWater}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 active:scale-[0.97] touch-manipulation transition-transform"
              >
                {t('foods.undoLast')}
              </button>
              <button
                onClick={handleClearWater}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-rose-500/20 text-rose-600 dark:text-rose-400 active:scale-[0.97] touch-manipulation transition-transform"
              >
                {t('foods.clearAll')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// Date Navigation Component - Navigate between days
// ═══════════════════════════════════════════════════════════════

const DateNavigation = React.memo(function DateNavigation({
  selectedDate,
  onDateChange,
  onGoToToday,
  onOpenHistory,
  t,
}: {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onGoToToday: () => void;
  onOpenHistory: () => void;
  t: (key: string) => string;
}) {
  // Get today's date - ALWAYS compute fresh on every render to avoid stale closure issues
  // This ensures the date comparison is always accurate even after navigating away and back
  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;

  // Format date for display - computed without useCallback to always use fresh 'today'
  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const todayDate = new Date(today + 'T00:00:00');
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);

    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    if (dateStr === today) return t('common.today');
    if (dateStr === yesterdayStr) return t('common.yesterday');
    if (dateStr === tomorrowStr) return t('foods.tomorrow');

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  // Navigate to previous day
  const goToPrevious = useCallback(() => {
    const date = new Date(selectedDate + 'T00:00:00');
    date.setDate(date.getDate() - 1);
    onDateChange(date.toISOString().split('T')[0]);
  }, [selectedDate, onDateChange]);

  // Navigate to next day - can only go up to today
  const goToNext = useCallback(() => {
    const date = new Date(selectedDate + 'T00:00:00');
    date.setDate(date.getDate() + 1);
    onDateChange(date.toISOString().split('T')[0]);
  }, [selectedDate, onDateChange]);

  // Can go next only if selectedDate is before today
  const canGoNext = selectedDate < today;

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="flex items-center justify-between bg-card/50 rounded-2xl p-2 border border-border/50">
        {/* Previous Day */}
        <button
          onClick={goToPrevious}
          type="button"
          className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors active:scale-95"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>

        {/* Date Display */}
        <button
          onClick={onOpenHistory}
          type="button"
          className="flex-1 flex flex-col items-center py-2 hover:bg-muted/30 rounded-xl transition-colors active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              {formatDisplayDate(selectedDate)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground mt-0.5">{t('foods.tapForHistory')}</span>
        </button>

        {/* Next Day */}
        <button
          onClick={goToNext}
          type="button"
          disabled={!canGoNext}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
            !canGoNext
              ? "bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
              : "bg-muted/50 hover:bg-muted active:scale-95 text-foreground"
          )}
          aria-label="Next day"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* History indicator */}
      {!isToday && (
        <div className="mt-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
            {t('foods.viewingHistory')}
          </p>
        </div>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// History Sheet - Elegant iOS-style weekly food history
// ═══════════════════════════════════════════════════════════════

interface DayHistory {
  date: string;
  dayName: string;
  dayNumber: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  hasLogs: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const HistorySheet = React.memo(function HistorySheet({
  open,
  onClose,
  selectedDate,
  onSelectDate,
  weeklyHistory,
  calorieTarget,
  t,
}: {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  weeklyHistory: DayHistory[];
  calorieTarget: number;
  t: (key: string) => string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 pb-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <History className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{t('foods.weeklyHistory')}</h2>
                    <p className="text-xs text-muted-foreground">Your nutrition journey this week</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Week Grid */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(85vh-140px)]">
              {weeklyHistory.length === 0 ? (
                <div className="py-12 text-center">
                  <History className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">{t('foods.noHistory')}</p>
                </div>
              ) : (
                weeklyHistory.map((day, index) => {
                  const progress = calorieTarget > 0 ? Math.min((day.calories / calorieTarget) * 100, 100) : 0;
                  const isExceeded = day.calories > calorieTarget;
                  const circumference = 2 * Math.PI * 28;
                  const strokeDashoffset = circumference - (progress / 100) * circumference;

                  return (
                    <motion.button
                      key={day.date}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        onSelectDate(day.date);
                        onClose();
                      }}
                      className={cn(
                        "w-full p-4 rounded-2xl border transition-all active:scale-[0.98]",
                        day.isSelected
                          ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/10"
                          : "bg-muted/30 border-border/50 hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        {/* Progress Ring */}
                        <div className="relative w-16 h-16 shrink-0">
                          <svg className="w-16 h-16 -rotate-90">
                            <circle
                              cx="32"
                              cy="32"
                              r="28"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="4"
                              className="text-muted/30"
                            />
                            {day.hasLogs && (
                              <circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeLinecap="round"
                                className={isExceeded ? "text-rose-500" : "text-emerald-500"}
                                style={{
                                  strokeDasharray: circumference,
                                  strokeDashoffset,
                                }}
                              />
                            )}
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold">
                              {day.hasLogs ? `${Math.round(progress)}%` : "—"}
                            </span>
                          </div>
                        </div>

                        {/* Day Info */}
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {day.isToday ? t('common.today') : day.dayName}
                            </span>
                            {day.isToday && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                                {t('foods.now')}
                              </span>
                            )}
                            {day.isSelected && !day.isToday && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                                {t('foods.selected')}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{day.dayNumber}</span>

                          {/* Macro Pills */}
                          {day.hasLogs && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 font-medium">
                                {Math.round(day.protein)}g P
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
                                {Math.round(day.carbs)}g C
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">
                                {Math.round(day.fat)}g F
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Calories */}
                        <div className="text-right">
                          <div className={cn(
                            "text-xl font-bold",
                            !day.hasLogs && "text-muted-foreground/50",
                            isExceeded && "text-rose-500"
                          )}>
                            {day.hasLogs ? Math.round(day.calories) : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {day.hasLogs ? t('foods.kcal') : t('foods.noLogs')}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>

            {/* Safe Area */}
            <div className="h-[env(safe-area-inset-bottom,16px)]" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

// ═══════════════════════════════════════════════════════════════
// Inline Weekly History - Shows weekly history directly on the page
// ═══════════════════════════════════════════════════════════════

const InlineWeeklyHistory = React.memo(function InlineWeeklyHistory({
  weeklyHistory,
  calorieTarget,
  selectedDate,
  onSelectDate,
  isLoading,
  t,
}: {
  weeklyHistory: DayHistory[];
  calorieTarget: number;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isLoading?: boolean;
  t: (key: string) => string;
}) {
  if (isLoading) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('foods.weeklyHistory')}</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('foods.weeklyHistory')}</span>
      </div>

      {/* Day Cards Grid */}
      <div className="space-y-3">
        {weeklyHistory.length === 0 ? (
          <div className="py-8 text-center bg-muted/30 rounded-2xl">
            <History className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t('foods.noHistory')}</p>
          </div>
        ) : (
          weeklyHistory.map((day, index) => {
            const progress = calorieTarget > 0 ? Math.min((day.calories / calorieTarget) * 100, 100) : 0;
            const isExceeded = day.calories > calorieTarget;
            const circumference = 2 * Math.PI * 28;
            const strokeDashoffset = circumference - (progress / 100) * circumference;

            return (
              <motion.button
                key={day.date}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => onSelectDate(day.date)}
                className={cn(
                  "w-full p-4 rounded-2xl border transition-all active:scale-[0.98]",
                  day.isSelected
                    ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/10"
                    : "bg-muted/30 border-border/50 hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-4">
                  {/* Progress Ring */}
                  <div className="relative w-14 h-14 shrink-0">
                    <svg className="w-14 h-14 -rotate-90">
                      <circle
                        cx="28"
                        cy="28"
                        r="24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="text-muted/30"
                      />
                      {day.hasLogs && (
                        <circle
                          cx="28"
                          cy="28"
                          r="24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeLinecap="round"
                          className={isExceeded ? "text-rose-500" : "text-emerald-500"}
                          style={{
                            strokeDasharray: circumference,
                            strokeDashoffset,
                          }}
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold">
                        {day.hasLogs ? `${Math.round(progress)}%` : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Day Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {day.isToday ? t('common.today') : day.dayName}
                      </span>
                      {day.isToday && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                          {t('foods.now')}
                        </span>
                      )}
                      {day.isSelected && !day.isToday && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                          {t('foods.selected')}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{day.dayNumber}</span>

                    {/* Macro Pills */}
                    {day.hasLogs && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 font-medium">
                          {Math.round(day.protein)}g P
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
                          {Math.round(day.carbs)}g C
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">
                          {Math.round(day.fat)}g F
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Calories */}
                  <div className="text-right">
                    <div className={cn(
                      "text-lg font-bold",
                      !day.hasLogs && "text-muted-foreground/50",
                      isExceeded && "text-rose-500"
                    )}>
                      {day.hasLogs ? Math.round(day.calories) : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {day.hasLogs ? t('foods.kcal') : t('foods.noLogs')}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
});

// Smart Header with Centered Calorie Ring
// Memoized to prevent re-renders when parent updates
const SmartHeader = React.memo(function SmartHeader({
  calories,
  protein,
  carbs,
  fat,
  t,
}: {
  calories: { current: number; target: number };
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fat: { current: number; target: number };
  t: (key: string) => string;
}) {
  const targetCalories = calories.target || 2000; // Fallback to avoid NaN
  const currentCalories = calories.current || 0;
  
  const remaining = targetCalories - currentCalories;
  const progress = (currentCalories / targetCalories) * 100;
  const isExceeded = currentCalories > targetCalories;

  const getInsight = React.useCallback(() => {
    if (isExceeded) {
      return t('foods.insight.overTarget').replace('{amount}', String(Math.round(Math.abs(remaining))));
    }
    if (protein.current >= (protein.target || 165) * 0.8) {
      return t('foods.insight.proteinOnTrack');
    }
    if (protein.current < (protein.target || 165) * 0.5) {
      return t('foods.insight.addProtein');
    }
    return t('foods.insight.keepLogging');
  }, [isExceeded, remaining, protein.current, protein.target, t]);

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Centered Calorie Ring */}
      <div className="flex flex-col items-center mb-6">
        <RingProgress progress={progress} size={160} strokeWidth={12} isExceeded={isExceeded}>
          <div className="text-center">
            <motion.div
              className={cn("text-4xl font-bold", isExceeded && "text-rose-500")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {isExceeded ? "+" : ""}{Math.round(Math.abs(remaining))}
            </motion.div>
            <div className="text-sm text-muted-foreground">
              {isExceeded ? t('foods.overTarget') : t('foods.caloriesLeft')}
            </div>
          </div>
        </RingProgress>
        
        {/* Consumed / Target */}
        <div className="mt-3 text-center">
          <span className={cn("text-2xl font-bold", isExceeded && "text-rose-500")}>
            {Math.round(currentCalories)}
          </span>
          <span className="text-muted-foreground"> / {targetCalories} {t('foods.kcal')}</span>
        </div>
      </div>

      {/* Macros with Full Names */}
      <div className="space-y-3 mb-4">
        <MacroProgressBar
          label={t('foods.protein')}
          current={protein.current}
          target={protein.target}
          color="rose"
          icon={Flame}
        />
        <MacroProgressBar
          label={t('foods.carbohydrates')}
          current={carbs.current}
          target={carbs.target}
          color="blue"
          icon={Zap}
        />
        <MacroProgressBar
          label={t('foods.fat')}
          current={fat.current}
          target={fat.target}
          color="amber"
          icon={Flame}
        />
      </div>

      {/* AI Insight */}
      <motion.div
        className={cn(
          "px-4 py-3 rounded-2xl border",
          isExceeded 
            ? "bg-linear-to-r from-rose-500/10 to-red-500/10 border-rose-500/20"
            : "bg-linear-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20"
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className={cn("w-4 h-4", isExceeded ? "text-rose-500" : "text-emerald-500")} />
          <span className="text-sm text-foreground/80">{getInsight()}</span>
        </div>
      </motion.div>
    </div>
  );
});

// Meal Card Component
// Memoized to prevent re-renders in meal lists
const MealCard = React.memo(function MealCard({
  meal,
  isExpanded,
  onToggle,
  onAddFood,
  onEditEntry,
  onDeleteEntry,
  mealLabel,
  t,
}: {
  meal: MealCardData;
  isExpanded: boolean;
  onToggle: () => void;
  onAddFood: () => void;
  onEditEntry: (entry: MealEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  mealLabel: string;
  t: (key: string) => string;
}) {
  const config = MEAL_CONFIG_STATIC[meal.type];
  const Icon = config.icon;
  const entryCount = meal.entries.length;

  return (
    <motion.div
      className="bg-card rounded-3xl border border-border overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-4 flex items-center gap-4 touch-manipulation"
      >
        {/* Icon */}
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center bg-linear-to-br",
          config.color
        )}>
          <Icon className="w-6 h-6 text-foreground/70" />
        </div>

        {/* Info */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{mealLabel}</span>
            {entryCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {entryCount} {entryCount === 1 ? "item" : "items"}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{config.time}</span>
        </div>

        {/* Calories */}
        <div className="text-right">
          <div className="text-lg font-bold">{Math.round(meal.totalCalories)}</div>
          <div className="text-xs text-muted-foreground">{t('foods.kcal')}</div>
        </div>

        {/* Expand Icon */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {/* Macro Mini Bars */}
              {entryCount > 0 && (
                <div className="mb-4 p-3 rounded-2xl bg-muted/30">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-rose-500 rounded-full origin-left"
                          initial={false}
                          animate={{ scaleX: Math.min(meal.totalProtein / 50, 1) }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 block">{Math.round(meal.totalProtein)}g P</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-blue-500 rounded-full origin-left"
                          initial={false}
                          animate={{ scaleX: Math.min(meal.totalCarbs / 60, 1) }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 block">{Math.round(meal.totalCarbs)}g C</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-amber-500 rounded-full origin-left"
                          initial={false}
                          animate={{ scaleX: Math.min(meal.totalFat / 25, 1) }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 block">{Math.round(meal.totalFat)}g F</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Food Entries */}
              <div className="space-y-2">
                {meal.entries.map((entry) => (
                  <FoodEntryItem
                    key={entry.id}
                    entry={entry}
                    onEdit={() => onEditEntry(entry)}
                    onDelete={() => onDeleteEntry(entry.id)}
                  />
                ))}

                {/* Empty State */}
                {entryCount === 0 && (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
                      <Icon className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('foods.noFoodsLogged')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('foods.tapToAdd')}</p>
                  </div>
                )}
              </div>

              {/* Add Button */}
              <button
                onClick={onAddFood}
                className="w-full mt-4 py-3 rounded-2xl border-2 border-dashed border-muted-foreground/20 flex items-center justify-center gap-2 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-500 transition-colors touch-manipulation"
              >
                <Plus className="w-5 h-5" />
                <span className="text-sm font-medium">{t('foods.addFood')}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// Food Entry Item with edit/delete buttons
// Memoized to prevent re-renders in food lists
const FoodEntryItem = React.memo(function FoodEntryItem({
  entry,
  onEdit,
  onDelete,
}: {
  entry: MealEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative bg-muted/30 p-3 rounded-2xl flex items-center gap-3">
      {/* Food Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{entry.food.name}</span>
          {entry.food.isVerified && (
            <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-muted-foreground">{entry.quantity}{entry.food.servingUnit}</span>
          <span className="text-xs font-medium text-rose-500">{Math.round(entry.nutrition.protein)}g protein</span>
        </div>
      </div>

      {/* Calories */}
      <div className="text-right">
        <div className="font-bold">{Math.round(entry.nutrition.calories)}</div>
        <div className="text-xs text-muted-foreground">kcal</div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          aria-label="Edit food entry"
          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors touch-manipulation"
        >
          <Edit3 className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete food entry"
          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-500 transition-colors touch-manipulation"
        >
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
});

// Search Food Sheet
function SearchFoodSheet({
  open,
  onClose,
  onSelectFood,
  mealType,
  onOpenScanner,
}: {
  open: boolean;
  onClose: () => void;
  onSelectFood: (food: Food) => void;
  mealType: MealType;
  onOpenScanner: () => void;
}) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const resultsViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const autoLoadTriggeredRef = useRef(false);
  const supportsAutoPaging = typeof window !== 'undefined' && 'IntersectionObserver' in window;

  // Reset list state when query or source changes
  useEffect(() => {
    if (!open) return;
    setPage(1);
    setFoods([]);
    setHasMore(false);
    setFetchError(null);
    autoLoadTriggeredRef.current = false;
  }, [open, query, mealType]);

  // Fetch foods from API when sheet opens, query changes, or page changes
  useEffect(() => {
    if (!open) return;
    
    const fetchFoods = async () => {
      const loadingMore = page > 1;
      if (loadingMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setFetchError(null);
      try {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        params.set('limit', '50');
        params.set('page', String(page));
        
        let url = '';
        if (mealType === 'supplements') {
          url = `/api/supplements?${params.toString()}`;
        } else {
          params.set('excludeSupplements', 'true');
          url = `/api/foods?${params.toString()}`;
        }
        
        const response = await apiFetch(url);
        if (response.ok) {
          const data = await response.json();
          const items = mealType === 'supplements' ? (data.supplements || []) : (data.foods || []);
          const canLoadMore = Boolean(data?.pagination?.hasMore);
          setHasMore(canLoadMore);
          setFoods(prev => loadingMore ? [...prev, ...items] : items);
        } else {
          const errBody = await response.text().catch(() => '');
          console.error(`[SearchFoodSheet] ${response.status} from ${url}:`, errBody);
          if (response.status === 401) {
            setFetchError('Sign in required. Please refresh the page.');
          } else {
            setFetchError(`Failed to load (${response.status})`);
          }
          if (!loadingMore) {
            setFoods([]);
          }
          setHasMore(false);
        }
      } catch (err) {
        console.error('[SearchFoodSheet] fetch error:', err);
        setFetchError('Network error. Check your connection.');
        if (!loadingMore) {
          setFoods([]);
        }
        setHasMore(false);
      } finally {
        if (loadingMore) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
        autoLoadTriggeredRef.current = false;
      }
    };

    // Debounce search
    const timer = setTimeout(fetchFoods, page === 1 && query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, query, mealType, page]);

  // Infinite scroll: load next page when sentinel becomes visible in results viewport
  useEffect(() => {
    if (!supportsAutoPaging || !open || !hasMore || isLoading || isLoadingMore) return;

    const sentinel = loadMoreSentinelRef.current;
    const viewport = resultsViewportRef.current;
    if (!sentinel || !viewport) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && !autoLoadTriggeredRef.current) {
          autoLoadTriggeredRef.current = true;
          setPage((prev) => prev + 1);
        }
      },
      {
        root: viewport,
        rootMargin: '120px 0px 120px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [supportsAutoPaging, open, hasMore, isLoading, isLoadingMore, foods.length]);

  const results = foods;

  const handleSelect = (food: Food) => {
    onSelectFood(food);
    onClose();
    setQuery("");
    setPage(1);
    setHasMore(false);
  };

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const config = MEAL_CONFIG_STATIC[mealType];

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="rounded-t-3xl px-0 max-h-[85vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Search Foods</DrawerTitle>
          <DrawerDescription>Search the food database</DrawerDescription>
        </DrawerHeader>

        {/* Header - Fixed at top */}
        <div className="px-4 pb-4 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center bg-linear-to-br",
              config.color
            )}>
              <config.icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Add to {config.label}</h2>
              <p className="text-xs text-muted-foreground">{config.time}</p>
            </div>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-3 bg-muted/50 rounded-2xl px-4 py-3">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mealType === "supplements" ? "Search supplements..." : "Search foods..."}
              autoFocus
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent outline-none text-base placeholder:text-muted-foreground min-w-0"
            />
            {query && (
              <button onClick={() => setQuery("")} type="button" aria-label="Clear search" title="Clear search" className="touch-manipulation shrink-0">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </div>
          
          {/* Scan Food with Camera Button */}
          <div className="mt-3">
            <button
              onClick={() => onOpenScanner()}
              type="button"
              className="w-full py-3 px-4 rounded-xl bg-linear-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 hover:from-emerald-500/20 hover:to-teal-500/20 transition-colors touch-manipulation"
            >
              <Camera className="w-5 h-5" />
              <span className="font-medium">Scan Food with Camera</span>
            </button>
          </div>
        </div>

        {/* Results - Scrollable section */}
        <div ref={resultsViewportRef} className="flex-1 px-4 min-h-0 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2 pb-6">
              {results.map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleSelect(food)}
                  className="w-full p-4 rounded-2xl bg-muted/30 flex items-center gap-4 touch-manipulation"
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{food.name}</span>
                      {food.isVerified && (
                        <Shield className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                    </div>
                    {food.brand && (
                      <span className="text-xs text-muted-foreground">{food.brand}</span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{(food.calories ?? 0)} kcal</span>
                      {(food.protein ?? 0) > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-rose-500">{(food.protein ?? 0)}g protein</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </button>
              ))}
              {hasMore && supportsAutoPaging && (
                <div ref={loadMoreSentinelRef} className="h-2 w-full" aria-hidden="true" />
              )}
              {hasMore && !supportsAutoPaging && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoadingMore}
                    onClick={handleLoadMore}
                  >
                    {isLoadingMore ? 'Loading more...' : 'Load more'}
                  </Button>
                </div>
              )}
              {isLoadingMore && (
                <div className="py-3 text-center text-sm text-muted-foreground">
                  Loading more...
                </div>
              )}
            </div>
          ) : fetchError ? (
            <div className="py-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
              <p className="text-red-500 font-medium">{fetchError}</p>
              <button
                onClick={() => { setFetchError(null); setQuery(q => q + ''); }}
                className="mt-3 text-sm text-primary underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No items found</p>
              <p className="text-xs text-muted-foreground mt-2">Try a different search term</p>
            </div>
          )}
        </div>

        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </DrawerContent>
    </Drawer>
  );
}

// Quick Add Dialog - NO MEAL SELECTOR, meal is pre-determined
function QuickAddDialog({
  open,
  onClose,
  food,
  mealType,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  food: Food | null;
  mealType: MealType;
  onConfirm: (food: Food, quantity: number, meal: MealType) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(food?.servingSize ?? 100);
  const [isAdding, setIsAdding] = useState(false);

  // Reset quantity when food changes
  React.useEffect(() => {
    if (food) {
      setQuantity(food.servingSize);
    }
  }, [food]);

  if (!food) return null;

  const isSupplement = mealType === 'supplements';
  const ratio = isSupplement ? (quantity / (food.servingSize || 1)) : (quantity / 100);

  const nutrition = {
    calories: Math.round((food.calories ?? 0) * ratio),
    protein: Math.round((food.protein ?? 0) * ratio),
    carbs: Math.round((food.carbs ?? 0) * ratio),
    fat: Math.round((food.fat ?? 0) * ratio),
  };

  const config = MEAL_CONFIG_STATIC[mealType];

  const handleConfirm = async () => {
    setIsAdding(true);
    try {
      await onConfirm(food, quantity, mealType);
      onClose();
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-3xl max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {food.name}
            {food.isVerified && <Shield className="w-4 h-4 text-emerald-500" />}
          </DialogTitle>
          <DialogDescription>
            {food.brand || "Generic"} • {food.calories} kcal per {isSupplement ? 'serving' : '100g'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Meal Type Display - NOT editable */}
          <div className="p-3 rounded-xl bg-muted/50 flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center bg-linear-to-br",
              config.color
            )}>
              <config.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Adding to {config.label}</p>
              <p className="text-xs text-muted-foreground">{config.time}</p>
            </div>
          </div>

          {/* Quantity - Free Input */}
          <div>
            <span className="text-sm font-medium mb-2 block">Amount</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - (isSupplement ? 1 : 10)))}
                aria-label={`Decrease quantity by ${isSupplement ? 1 : 10}`}
                className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center touch-manipulation"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                value={quantity || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  // Handle empty input or just "0"
                  if (val === '' || val === '0') {
                    setQuantity(0);
                    return;
                  }
                  // Parse and strip leading zeros by converting to number
                  const num = parseInt(val, 10);
                  setQuantity(isNaN(num) ? 0 : Math.max(0, num));
                }}
                onFocus={(e) => {
                  // Select all text on focus so user can easily replace
                  e.target.select();
                }}
                aria-label={isSupplement ? "Number of servings" : "Quantity in grams"}
                className="w-24 h-10 text-center text-lg font-bold bg-muted rounded-xl border-none outline-none"
                min="0"
                step={isSupplement ? 1 : 10}
              />
              <button
                onClick={() => setQuantity(quantity + (isSupplement ? 1 : 10))}
                aria-label="Increase quantity by 10"
                className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center touch-manipulation"
              >
                <Plus className="w-5 h-5" />
              </button>
              <span className="text-muted-foreground">{food.servingUnit}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Typical serving: {food.servingSize}{food.servingUnit}
            </p>
          </div>

          {/* Nutrition Preview */}
          <div className="p-4 rounded-2xl bg-muted/50">
            <span className="text-xs text-muted-foreground block mb-3">Nutrition Preview</span>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-xl font-bold">{nutrition.calories}</div>
                <div className="text-xs text-muted-foreground">kcal</div>
              </div>
              <div>
                <div className="text-xl font-bold text-rose-500">{nutrition.protein}g</div>
                <div className="text-xs text-muted-foreground">Protein</div>
              </div>
              <div>
                <div className="text-xl font-bold text-blue-500">{nutrition.carbs}g</div>
                <div className="text-xs text-muted-foreground">Carbs</div>
              </div>
              <div>
                <div className="text-xl font-bold text-amber-500">{nutrition.fat}g</div>
                <div className="text-xs text-muted-foreground">Fat</div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isAdding || quantity <= 0}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            {isAdding ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Adding...
              </span>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add {quantity}{food.servingUnit}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Note: Foods are now fetched from the real /api/foods endpoint
// No mock data - all data comes from the database

// ============================================
// Main Foods Page Component
// ============================================

export function FoodsPage() {
  // Translation
  const { t } = useLocale();
  
  // Get meal config with translations - must be before callbacks that use it
  const mealConfig = useMemo(() => getMealConfig(t), [t]);

  // State
  const [expandedMeal, setExpandedMeal] = useState<MealType | null>("breakfast");
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealType>("breakfast");
  const [photoScannerOpen, setPhotoScannerOpen] = useState(false);
  const [unifiedScannerOpen, setUnifiedScannerOpen] = useState(false);
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [scannedFoodQuickAddOpen, setScannedFoodQuickAddOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [weeklyHistory, setWeeklyHistory] = useState<DayHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Global Context - All data is synced across all pages
  const {
    nutrition,
    foodLogEntries,
    hydration,
    hydrationSyncing,
    workoutSummary,
    addFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    addWater,
    removeLastWater,
    clearAllWater,
    updateWaterTarget,
    refreshAll,
    selectedFoodDate,
    setSelectedFoodDate,
    goToToday,
    dataVersion,
  } = useApp();

  // ── Helper: format a Date as local YYYY-MM-DD ──────────────────────
  const toLocalDateStr = useCallback((d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  
  // Supplement logs state - fetched from separate supplements table
  const [supplementLogs, setSupplementLogs] = useState<MealEntry[]>([]);
  const [supplementsLoading, setSupplementsLoading] = useState(false);
  
  // Fetch supplement logs from the supplements table
  const fetchSupplementLogs = useCallback(async () => {
    setSupplementsLoading(true);
    try {
      const response = await apiFetch(`/api/supplement-log?date=${selectedFoodDate}`);
      if (response.ok) {
        const data = await response.json();
        setSupplementLogs(mapSupplementLogEntries(data.entries));
      } else {
        console.error('Error fetching supplement logs: HTTP', response.status);
      }
    } catch (err) {
      console.error('Error fetching supplement logs:', err);
    } finally {
      setSupplementsLoading(false);
    }
  }, [selectedFoodDate]);

  // Fetch supplement logs when date changes
  useEffect(() => {
    fetchSupplementLogs();
  }, [fetchSupplementLogs]);

  // Compute today's macros from foodLogEntries + supplementLogs for instant optimistic display.
  // This runs synchronously on every render — no effects, no timing issues.
  const todayMacrosFromEntries = useMemo(() => {
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    for (const e of foodLogEntries) {
      calories += e.calories || 0;
      protein += e.protein || 0;
      carbs += e.carbs || 0;
      fat += e.fat || 0;
    }
    // Include supplement macros
    for (const s of supplementLogs) {
      calories += s.calories || 0;
      protein += s.protein || 0;
      carbs += s.carbs || 0;
      fat += s.fat || 0;
    }
    return { calories, protein, carbs, fat, hasLogs: foodLogEntries.length > 0 || supplementLogs.length > 0 };
  }, [foodLogEntries, supplementLogs]);

  // Synchronously merge API-fetched weekly data with live foodLogEntries for today.
  // This guarantees today's macros are always instant (0ms delay), while other
  // days use the API-fetched data. No effects, no debouncing, no race conditions.
  const displayWeeklyHistory = useMemo(() => {
    if (weeklyHistory.length === 0) return weeklyHistory;
    const todayStr = toLocalDateStr(new Date());
    if (selectedFoodDate !== todayStr) return weeklyHistory;
    const todayIdx = weeklyHistory.findIndex(d => d.isToday);
    if (todayIdx === -1) return weeklyHistory;
    const existing = weeklyHistory[todayIdx];
    if (existing.calories === todayMacrosFromEntries.calories &&
        existing.protein === todayMacrosFromEntries.protein &&
        existing.carbs === todayMacrosFromEntries.carbs &&
        existing.fat === todayMacrosFromEntries.fat &&
        existing.hasLogs === todayMacrosFromEntries.hasLogs) {
      return weeklyHistory;
    }
    const patched = weeklyHistory.slice();
    patched[todayIdx] = {
      ...existing,
      calories: todayMacrosFromEntries.calories,
      protein: todayMacrosFromEntries.protein,
      carbs: todayMacrosFromEntries.carbs,
      fat: todayMacrosFromEntries.fat,
      hasLogs: todayMacrosFromEntries.hasLogs,
    };
    return patched;
  }, [weeklyHistory, todayMacrosFromEntries, selectedFoodDate, toLocalDateStr]);

  // Fetch weekly history for history sheet and inline history
  // Uses a single date-range API call instead of 7 sequential calls.
  // All dates are computed in LOCAL timezone to match selectedFoodDate.
  // Refetches on dataVersion change (realtime events) for past days' accuracy.
  const fetchWeeklyHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const today = new Date();
      const todayStr = toLocalDateStr(today);

      // Compute 7 local dates (today, yesterday, ..., 6 days ago)
      const localDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        localDates.push(toLocalDateStr(d));
      }

      // Use WIDE UTC range (±1 day padding) to cover timezone edge cases.
      // Entries near midnight local time may have UTC timestamps on the adjacent day.
      const padStart = new Date(today);
      padStart.setDate(today.getDate() - 8); // 6 days ago - 2 days buffer
      const padEnd = new Date(today);
      padEnd.setDate(today.getDate() + 2); // +2 days buffer
      const apiStartDate = padStart.toISOString().split('T')[0];
      const apiEndDate = padEnd.toISOString().split('T')[0];

      // Fetch food logs and supplement logs in parallel
      const [foodRes, suppRes] = await Promise.all([
        apiFetch(`/api/food-logs?startDate=${apiStartDate}&endDate=${apiEndDate}`),
        apiFetch(`/api/supplement-log?startDate=${apiStartDate}&endDate=${apiEndDate}`),
      ]);

      if (!foodRes.ok) throw new Error(`HTTP ${foodRes.status}`);
      const data = await foodRes.json();
      const allEntries = data.data || data.entries || [];

      // Parse supplement logs (non-blocking — if it fails, we still show food data)
      let suppEntries: any[] = [];
      if (suppRes.ok) {
        try {
          const suppData = await suppRes.json();
          suppEntries = suppData.entries || [];
        } catch { /* ignore parse error */ }
      }

      // Group entries by LOCAL date (not UTC!) to match selectedFoodDate
      const dailyTotals: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};
      for (const entry of allEntries) {
        let entryDate: string;
        if (entry.logged_at) {
          // Convert ISO timestamp to LOCAL date string
          entryDate = toLocalDateStr(new Date(entry.logged_at));
        } else if (entry.date) {
          // Fallback: if already a date string, use as-is
          entryDate = String(entry.date).substring(0, 10);
        } else {
          continue;
        }
        if (!dailyTotals[entryDate]) {
          dailyTotals[entryDate] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
        }
        const t = dailyTotals[entryDate];
        t.calories += entry.calories || 0;
        t.protein += entry.protein || 0;
        t.carbs += entry.carbs || 0;
        t.fat += entry.fat || 0;
        t.count += 1;
      }

      // Merge supplement macros into the same daily totals
      for (const supp of suppEntries) {
        let entryDate: string;
        if (supp.logged_at) {
          entryDate = toLocalDateStr(new Date(supp.logged_at));
        } else if (supp.date) {
          entryDate = String(supp.date).substring(0, 10);
        } else {
          continue;
        }
        if (!dailyTotals[entryDate]) {
          dailyTotals[entryDate] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
        }
        const t = dailyTotals[entryDate];
        t.calories += supp.calories || 0;
        t.protein += supp.protein || 0;
        t.carbs += supp.carbs || 0;
        t.fat += supp.fat || 0;
        t.count += 1;
      }

      // Build DayHistory array using LOCAL dates
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const days: DayHistory[] = [];

      for (let i = 0; i < 7; i++) {
        const dateStr = localDates[i];
        // Parse local date at noon to avoid DST midnight edge cases
        const dateObj = new Date(dateStr + 'T12:00:00');
        const totals = dailyTotals[dateStr];

        days.push({
          date: dateStr,
          dayName: dayNames[dateObj.getDay()],
          dayNumber: `${months[dateObj.getMonth()]} ${dateObj.getDate()}`,
          calories: totals?.calories || 0,
          protein: totals?.protein || 0,
          carbs: totals?.carbs || 0,
          fat: totals?.fat || 0,
          hasLogs: (totals?.count || 0) > 0,
          isToday: dateStr === todayStr,
          isSelected: dateStr === selectedFoodDate,
        });
      }

      setWeeklyHistory(days);
    } catch (err) {
      console.error('Error fetching weekly history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedFoodDate, toLocalDateStr]);

  // Fetch weekly history on mount and date change
  useEffect(() => {
    fetchWeeklyHistory();
  }, [fetchWeeklyHistory]);

  // Refetch weekly history on realtime events (dataVersion change)
  // This ensures past days stay accurate without affecting today (which is
  // already instant via the synchronous useMemo merge above).
  useEffect(() => {
    fetchWeeklyHistory();
  }, [dataVersion]);
  
  // Track editing state
  const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
  
  // Calculate workout-based protein recommendation
  const workoutProteinRecommendation = useMemo(() => {
    if (!workoutSummary || workoutSummary.workoutCount === 0) return null;
    // Recommend additional protein based on calories burned
    const additionalProtein = Math.round(20 + (workoutSummary.totalCalories * 0.03));
    return {
      additionalProtein,
      reason: workoutSummary.totalCalories > 300 
        ? "Post-workout recovery" 
        : "Support training adaptation"
    };
  }, [workoutSummary]);

  // Transform entries into meal structure
  const meals: MealCardData[] = useMemo(() => {
    const mealMap = new Map<MealType, MealEntry[]>();

    // Initialize all meals
    (["breakfast", "lunch", "dinner", "snack", "supplements"] as MealType[]).forEach(type => {
      mealMap.set(type, []);
    });

    // Group entries by meal (excluding supplements - they come from supplement_logs table)
    foodLogEntries.forEach(entry => {
      // Skip supplements - they're handled separately
      if (entry.source === 'supplements') return;
      
      // Use mealType field for grouping, fallback to snack if not set
      const mealType = (entry.mealType as MealType) || "snack";
      const entriesForMeal = mealMap.get(mealType) || [];

      // Extract food name from rationale if food relation is null
      let foodName = entry.food?.name;
      if (!foodName && entry.rationale?.startsWith('Food: ')) {
        foodName = entry.rationale.replace('Food: ', '');
      }
      // Fix: Use stored foodName if relation is broken, prevent "Unknown Food"
      foodName = foodName || entry.foodName || "Unknown Food";

      const food: Food = {
        id: entry.foodId || "unknown",
        name: foodName,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        servingSize: 100,
        servingUnit: entry.unit,
        isVerified: true,
        tags: [],
        confidence: 0.9,
      };

      entriesForMeal.push({
        id: entry.id,
        food,
        quantity: entry.quantity,
        loggedAt: new Date(entry.loggedAt),
        nutrition: {
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
        },
      });

      mealMap.set(mealType, entriesForMeal);
    });

    // Add supplement logs from the separate supplements table
    mealMap.set('supplements', supplementLogs);

    // Convert to array with totals
    return (["breakfast", "lunch", "dinner", "snack", "supplements"] as MealType[]).map(type => {
      const entriesForMeal = mealMap.get(type) || [];
      return {
        type,
        entries: entriesForMeal,
        totalCalories: entriesForMeal.reduce((sum, e) => sum + e.nutrition.calories, 0),
        totalProtein: entriesForMeal.reduce((sum, e) => sum + e.nutrition.protein, 0),
        totalCarbs: entriesForMeal.reduce((sum, e) => sum + e.nutrition.carbs, 0),
        totalFat: entriesForMeal.reduce((sum, e) => sum + e.nutrition.fat, 0),
      };
    });
  }, [foodLogEntries, supplementLogs]);

  // Handlers
  const handleFoodSelect = useCallback((food: Food) => {
    setSelectedFood(food);
    setQuickAddOpen(true);
  }, []);

  const handleConfirmAdd = useCallback(async (food: Food, quantity: number, meal: MealType) => {
    // Calculate nutrition values
    const isSupplement = meal === 'supplements';
    const ratio = isSupplement ? (quantity / (food.servingSize || 1)) : (quantity / 100);

    const newCalories = (food.calories * ratio);
    const newProtein = (food.protein * ratio);
    const newCarbs = (food.carbs * ratio);
    const newFat = (food.fat * ratio);

    // Determine the source - if food.source is 'global', pass that to avoid FK constraint issues
    // Otherwise use 'manual' for user-created foods
    const foodSource = food.source || 'manual';

    // Handle supplements separately - use the supplements table
    if (meal === 'supplements') {
      // Build the new entry shape for optimistic update
      const newSuppEntry: MealEntry = {
        id: editingEntry?.id || `temp-supp-${Date.now()}`,
        food: {
          id: food.id,
          name: food.name,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          servingSize: food.servingSize || 1,
          servingUnit: food.servingUnit || 'serving',
          isVerified: true,
          tags: ['supplement'],
          confidence: 0.9,
          source: 'supplements' as const,
        },
        quantity,
        loggedAt: new Date(),
        nutrition: {
          calories: newCalories,
          protein: newProtein,
          carbs: newCarbs,
          fat: newFat,
        },
      };

      // Optimistic update: immediately update local supplementLogs
      if (editingEntry) {
        setSupplementLogs(prev => prev.map(e => e.id === editingEntry.id ? newSuppEntry : e));
      } else {
        setSupplementLogs(prev => [newSuppEntry, ...prev]);
      }

      try {
        if (editingEntry) {
          // Update existing supplement log
          const response = await apiFetch('/api/supplement-log', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: editingEntry.id,
              supplementId: food.id,
              supplementName: food.name,
              quantity,
              unit: food.servingUnit,
              calories: newCalories,
              protein: newProtein,
              carbs: newCarbs,
              fat: newFat,
            }),
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to update supplement');
          }
        } else {
          // Add new supplement log
          const response = await apiFetch('/api/supplement-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supplementId: food.source === 'supplements' ? food.id : null,
              supplementName: food.name,
              quantity,
              unit: food.servingUnit || 'serving',
              calories: newCalories,
              protein: newProtein,
              carbs: newCarbs,
              fat: newFat,
            }),
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to add supplement');
          }
        }
        
        // Refresh supplement logs using shared fetch
        await fetchSupplementLogs();
        // Refresh nutrition totals so the header ring includes supplements
        refreshAll();
        
        setEditingEntry(null);
        toast({ title: editingEntry ? 'Supplement updated' : 'Supplement logged', description: `${food.name} — ${Math.round(newCalories)} kcal` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error saving supplement:', msg);
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      }
    } else {
      // Regular food handling
      // FIX: Only pass foodId if the food is from the user's local foods table
      // Global foods have IDs that don't exist in the foods table, causing FK constraint violations
      const actualFoodId = food.source === 'local' ? food.id : null;
      
      // Check if we're editing an existing entry
      if (editingEntry) {
        await updateFoodEntry(editingEntry.id, {
          foodId: actualFoodId,
          foodName: food.name,
          quantity,
          unit: food.servingUnit,
          calories: newCalories,
          protein: newProtein,
          carbs: newCarbs,
          fat: newFat,
          source: foodSource,
          mealType: meal,
        });
        setEditingEntry(null);
      } else {
        // Add new entry - nutrition is updated automatically by the context
        await addFoodEntry({
          foodId: actualFoodId,
          foodName: food.name,
          quantity,
          unit: food.servingUnit,
          calories: newCalories,
          protein: newProtein,
          carbs: newCarbs,
          fat: newFat,
          source: foodSource,
          mealType: meal,
        });
      }
    }
    
    setQuickAddOpen(false);
    setSelectedFood(null);
  }, [addFoodEntry, updateFoodEntry, editingEntry, fetchSupplementLogs, refreshAll]);

  const handleDeleteEntry = useCallback(async (entryId: string, mealType?: MealType) => {
    // If it's a supplement, delete from supplement-log API
    if (mealType === 'supplements') {
      // Optimistic update: remove from local state immediately
      setSupplementLogs(prev => prev.filter(e => e.id !== entryId));
      try {
        const response = await apiFetch(`/api/supplement-log?id=${entryId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          // Revert on failure
          await fetchSupplementLogs();
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to delete supplement');
        }
        // Refresh nutrition totals so the header ring includes supplements
        refreshAll();
        toast({ title: 'Supplement removed' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error deleting supplement:', msg);
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      }
    } else {
      // Delete regular food entry
      await deleteFoodEntry(entryId);
    }
  }, [deleteFoodEntry, fetchSupplementLogs, refreshAll]);

  const handleEditEntry = useCallback((entry: MealEntry, mealType: MealType) => {
    setEditingEntry(entry);
    setSelectedFood({
      ...entry.food,
      servingSize: entry.quantity, // Set servingSize to current quantity for editing
    });
    setSelectedMealType(mealType);
    setQuickAddOpen(true);
  }, []);

  const handleAddToMeal = useCallback((mealType: MealType) => {
    setSelectedMealType(mealType);
    setSearchSheetOpen(true);
  }, []);

  // Handle food photo scan result - Add directly to meal section (NOT to global_foods database)
  const handleFoodPhotoScan = useCallback(async (analyzedFood: AnalyzedFood, mealType: MealType) => {
    // Create a temporary food object for the log entry
    const foodId = `photo-${Date.now()}`;
    
    // Add directly to the meal section using addFoodEntry
    // This only logs to food_logs table, NOT to global_foods
    await addFoodEntry({
      foodId,
      foodName: analyzedFood.name,
      quantity: analyzedFood.servingSize,
      unit: analyzedFood.servingUnit,
      calories: analyzedFood.calories,
      protein: analyzedFood.protein,
      carbs: analyzedFood.carbs,
      fat: analyzedFood.fat,
      source: 'photo',
      mealType,
    });
    
    // Close scanner
    setPhotoScannerOpen(false);
    
    toast({
      title: `Added to ${mealConfig[mealType].label}`,
      description: `${analyzedFood.name} - ${analyzedFood.calories} kcal`,
    });
  }, [addFoodEntry, mealConfig, t]);

  // Handle barcode scan result - Open quick add dialog
  const handleBarcodeScan = useCallback((food: ScannedFood) => {
    setScannedFood(food);
    setScannedFoodQuickAddOpen(true);
  }, []);

  // Handle barcode scan confirmation - Add to meal
  const handleBarcodeScanConfirm = useCallback(async (food: ScannedFood, quantity: number, mealType: MealType) => {
    const foodId = food.id || `barcode-${food.barcode}-${Date.now()}`;
    
    await addFoodEntry({
      foodId,
      foodName: food.name,
      quantity,
      unit: 'g',
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      source: 'barcode',
      mealType,
    });
    
    setScannedFoodQuickAddOpen(false);
    setScannedFood(null);
    
    toast({
      title: `Added to ${mealConfig[mealType].label}`,
      description: `${food.name} (${quantity}g) - ${food.calories} kcal`,
    });
  }, [addFoodEntry, mealConfig]);

  const handleAddWater = useCallback(async (ml: number) => {
    await addWater(ml);
  }, [addWater]);

  return (
    <div className="min-h-screen pb-24 gymbro-page-subtle">
      {/* Date Navigation */}
      <DateNavigation
        selectedDate={selectedFoodDate}
        onDateChange={setSelectedFoodDate}
        onGoToToday={goToToday}
        onOpenHistory={() => setHistorySheetOpen(true)}
        t={t}
      />

      {/* Smart Header */}
      <SmartHeader
        calories={nutrition.calories}
        protein={nutrition.protein}
        carbs={nutrition.carbs}
        fat={nutrition.fat}
        t={t}
      />

      {/* Divider */}
      <div className="h-2 bg-muted/30" />

      {/* Hydration Tracker */}
      <div className="px-4 py-4">
        <HydrationTracker
          current={hydration.current}
          target={hydration.target}
          onAddWater={handleAddWater}
          onRemoveWater={removeLastWater}
          onClearWater={clearAllWater}
          onUpdateTarget={updateWaterTarget}
          entries={hydration.entries}
          isSyncing={hydrationSyncing}
          t={t}
        />
      </div>

      {/* Workout Recovery Recommendation */}
      {workoutProteinRecommendation && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-4 pb-4"
        >
          <div className="rounded-2xl p-4 bg-linear-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {workoutProteinRecommendation.reason}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Consider adding ~{workoutProteinRecommendation.additionalProtein}g of protein within the next 2 hours to optimize recovery.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Divider */}
      <div className="h-2 bg-muted/30" />

      {/* Meal Timeline */}
      <div className="px-4 py-4 space-y-3">
        {meals.map((meal) => (
          <MealCard
            key={meal.type}
            meal={meal}
            isExpanded={expandedMeal === meal.type}
            onToggle={() => setExpandedMeal(expandedMeal === meal.type ? null : meal.type)}
            onAddFood={() => handleAddToMeal(meal.type)}
            onEditEntry={(entry) => handleEditEntry(entry, meal.type)}
            onDeleteEntry={(entryId) => handleDeleteEntry(entryId, meal.type)}
            mealLabel={mealConfig[meal.type].label}
            t={t}
          />
        ))}
      </div>

      {/* History Button - At Bottom */}
      <div className="px-4 py-6 pb-8">
        <motion.button
          onClick={() => setHistorySheetOpen(true)}
          whileTap={{ scale: 0.98 }}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center gap-3 hover:from-primary/15 hover:to-primary/10 transition-all"
        >
          <History className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-primary">{t('foods.weeklyHistory')}</span>
          <ChevronRight className="w-4 h-4 text-primary/60" />
        </motion.button>
      </div>

      {/* Search Food Sheet */}
      <SearchFoodSheet
        open={searchSheetOpen}
        onClose={() => setSearchSheetOpen(false)}
        onSelectFood={handleFoodSelect}
        mealType={selectedMealType}
        onOpenScanner={() => {
          setSearchSheetOpen(false);
          setUnifiedScannerOpen(true);
        }}
      />

      {/* Quick Add Dialog - KEY ensures it remounts when mealType changes */}
      <QuickAddDialog
        key={`${selectedFood?.id}-${selectedMealType}-${editingEntry?.id || 'new'}`}
        open={quickAddOpen}
        onClose={() => {
          setQuickAddOpen(false);
          setSelectedFood(null);
          setEditingEntry(null);
        }}
        food={selectedFood}
        mealType={selectedMealType}
        onConfirm={handleConfirmAdd}
      />

      {/* Unified Food Scanner (Barcode + Photo) */}
      <UnifiedFoodScanner
        open={unifiedScannerOpen}
        onClose={() => setUnifiedScannerOpen(false)}
        onBarcodeScan={handleBarcodeScan}
        onPhotoScan={handleFoodPhotoScan}
      />

      {/* Scanned Food Quick Add Dialog */}
      <ScannedFoodQuickAdd
        open={scannedFoodQuickAddOpen}
        onClose={() => {
          setScannedFoodQuickAddOpen(false);
          setScannedFood(null);
        }}
        food={scannedFood}
        mealType={selectedMealType}
        onConfirm={handleBarcodeScanConfirm}
      />

      {/* Food Photo Scanner (Legacy - keeping for backward compatibility) */}
      <FoodPhotoScanner
        open={photoScannerOpen}
        onClose={() => setPhotoScannerOpen(false)}
        onSelectMeal={handleFoodPhotoScan}
      />

      {/* History Sheet - iOS-style weekly history */}
      <HistorySheet
        open={historySheetOpen}
        onClose={() => setHistorySheetOpen(false)}
        selectedDate={selectedFoodDate}
        onSelectDate={(date) => {
          setSelectedFoodDate(date);
          setHistorySheetOpen(false);
        }}
        weeklyHistory={displayWeeklyHistory}
        calorieTarget={nutrition.calories.target}
        t={t}
      />
    </div>
  );
}

export default FoodsPage;
