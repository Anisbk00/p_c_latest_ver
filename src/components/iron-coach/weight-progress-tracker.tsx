"use client";

/**
 * Weight Progress Tracker — Premium Strength Logger
 * 
 * A doctor-level, professional weight tracking system:
 * - Weekly exercise logging with sets, reps, weight, RPE, effort
 * - Auto PR detection (weight, volume, reps, estimated 1RM)
 * - Exercise history grouped by week
 * - Mini sparkline progress charts per exercise
 * - Muscle group filtering
 * - Personal records showcase
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Trophy, TrendingUp, ChevronLeft, ChevronRight,
  Dumbbell, Loader2, Trash2, AlertTriangle,
  Zap, Target, Award, CalendarDays, ChevronDown, Edit3, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/mobile-api";
import { toast } from "sonner";
import { format, subWeeks, addWeeks, startOfWeek, endOfWeek, getISOWeek, getYear } from "date-fns";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface WeightLog {
  id: string;
  exercise_name: string;
  muscle_group: string;
  weight_kg: number;
  max_weight_kg: number | null;
  min_weight_kg: number | null;
  reps: number;
  sets: number;
  estimated_1rm: number | null;
  rpe: number | null;
  effort_level: string | null;
  rest_seconds: number;
  logged_at: string;
  notes: string | null;
  is_pr: boolean;
  pr_type: string | null;
  week_number: number;
  year: number;
}

interface ProgressStats {
  totalLogs: number;
  totalVolume: number;
  avgRPE: number;
  totalSets: number;
  uniqueExercises: number;
  personalRecords: number;
}

interface WeightProgressTrackerProps {
  theme: string;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MUSCLE_GROUPS = [
  { value: "chest", label: "Chest", emoji: "🫁" },
  { value: "back", label: "Back", emoji: "🔙" },
  { value: "shoulders", label: "Shoulders", emoji: "🤷" },
  { value: "biceps", label: "Biceps", emoji: "💪" },
  { value: "triceps", label: "Triceps", emoji: "🦾" },
  { value: "legs", label: "Legs", emoji: "🦵" },
  { value: "glutes", label: "Glutes", emoji: "🍑" },
  { value: "core", label: "Core", emoji: "🎯" },
  { value: "calves", label: "Calves", emoji: "🦶" },
  { value: "forearms", label: "Forearms", emoji: "🤜" },
  { value: "full_body", label: "Full Body", emoji: "⚡" },
  { value: "other", label: "Other", emoji: "🔧" },
];

const EFFORT_LEVELS = [
  { value: "easy", label: "Easy", color: "text-emerald-400" },
  { value: "moderate", label: "Moderate", color: "text-blue-400" },
  { value: "hard", label: "Hard", color: "text-orange-400" },
  { value: "max", label: "Max", color: "text-red-400" },
  { value: "failure", label: "Failure", color: "text-red-500" },
];

const DEFAULT_LOG = {
  exerciseName: "",
  muscleGroup: "other",
  weightKg: "",
  maxWeightKg: "",
  minWeightKg: "",
  reps: "1",
  sets: "1",
  rpe: "",
  effortLevel: "moderate" as string | null,
  restSeconds: "90",
  notes: "",
};

// ═══════════════════════════════════════════════════════════════
// Theme-aware styles
// ═══════════════════════════════════════════════════════════════

function getAccent(theme: string) {
  switch (theme) {
    case "gymbro": return { accent: "text-red-400", accentBg: "bg-red-500/10 border-red-500/20", accentBtn: "bg-red-500 hover:bg-red-600", accentGlow: "shadow-red-500/20" };
    case "gymgirl": return { accent: "text-pink-400", accentBg: "bg-pink-500/10 border-pink-500/20", accentBtn: "bg-pink-500 hover:bg-pink-600", accentGlow: "shadow-pink-500/20" };
    case "light": return { accent: "text-violet-500", accentBg: "bg-violet-500/10 border-violet-500/20", accentBtn: "bg-violet-500 hover:bg-violet-600", accentGlow: "shadow-violet-500/20" };
    default: return { accent: "text-violet-400", accentBg: "bg-violet-500/10 border-violet-500/20", accentBtn: "bg-violet-500 hover:bg-violet-600", accentGlow: "shadow-violet-500/20" };
  }
}

// ═══════════════════════════════════════════════════════════════
// Sparkline (pure CSS mini chart)
// ═══════════════════════════════════════════════════════════════

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// RPE Scale Visual
// ═══════════════════════════════════════════════════════════════

function RPEScale({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const rpe = parseInt(value) || 0;
  return (
    <div className="flex gap-1 mt-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          className={cn(
            "flex-1 h-6 rounded-sm text-[9px] font-bold transition-all",
            n <= rpe
              ? n <= 3 ? "bg-emerald-500 text-white"
                : n <= 6 ? "bg-yellow-500 text-white"
                : n <= 8 ? "bg-orange-500 text-white"
                : "bg-red-500 text-white"
              : "bg-muted/30 text-muted-foreground/40"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PR Badge
// ═══════════════════════════════════════════════════════════════

function PRBadge({ prType }: { prType: string | null }) {
  if (!prType) return null;
  const labels: Record<string, string> = {
    weight: "Weight PR",
    volume: "Volume PR",
    reps: "Rep PR",
    est_1rm: "Est. 1RM PR",
    sets: "Sets PR",
  };
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-bold"
    >
      <Trophy className="w-2.5 h-2.5" />
      {labels[prType] || "PR"}
    </motion.span>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function WeightProgressTracker({ theme }: WeightProgressTrackerProps) {
  const styles = useMemo(() => getAccent(theme), [theme]);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [prs, setPrs] = useState<WeightLog[]>([]);
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_LOG);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [activeMuscleFilter, setActiveMuscleFilter] = useState<string | null>(null);
  const [showMusclePicker, setShowMusclePicker] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentWeek = getISOWeek(currentWeekStart);
  const currentYear = getYear(currentWeekStart);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ week: String(currentWeek), year: String(currentYear) });
      if (activeMuscleFilter) params.set("muscleGroup", activeMuscleFilter);
      const res = await apiFetch(`/api/iron-coach/progress?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLogs(data.logs || []);
      setStats(data.stats);
      setPrs(data.prs || []);
    } catch {
      setLogs([]);
      setStats(null);
      setPrs([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentWeek, currentYear, activeMuscleFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Navigation
  const goPrevWeek = () => setCurrentWeekStart((d) => subWeeks(d, 1));
  const goNextWeek = () => setCurrentWeekStart((d) => addWeeks(d, 1));
  const goToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Save log
  const handleSave = async () => {
    const errors: Record<string, string> = {};
    const name = form.exerciseName.trim();

    if (!name) {
      errors.exerciseName = "Exercise name is required";
      toast.error("Exercise name is required");
    } else if (name.length > 100) {
      errors.exerciseName = "Max 100 characters";
      toast.error("Exercise name too long (max 100 chars)");
    }

    const weight = parseFloat(form.weightKg);
    if (isNaN(weight) || weight <= 0) {
      errors.weightKg = "Must be > 0 kg";
      toast.error("Weight must be greater than 0 kg");
    } else if (weight > 2000) {
      errors.weightKg = "Max 2000 kg";
      toast.error("Weight seems unrealistic (max 2000 kg)");
    }

    const reps = parseInt(form.reps);
    if (isNaN(reps) || reps < 1) {
      errors.reps = "At least 1";
      toast.error("Reps must be at least 1");
    } else if (reps > 100) {
      errors.reps = "Max 100";
      toast.error("Reps seem unrealistic (max 100)");
    }

    const sets = parseInt(form.sets);
    if (isNaN(sets) || sets < 1) {
      errors.sets = "At least 1";
      toast.error("Sets must be at least 1");
    } else if (sets > 50) {
      errors.sets = "Max 50";
      toast.error("Sets seem unrealistic (max 50)");
    }

    // Max/min weight logical checks
    if (form.maxWeightKg !== "" && form.maxWeightKg !== undefined) {
      const maxW = parseFloat(form.maxWeightKg);
      if (!isNaN(maxW) && !isNaN(weight) && weight > 0 && maxW < weight) {
        errors.maxWeightKg = "Can't be less than working weight";
        toast.error("Max weight can't be less than working weight", { description: "Max weight is your heaviest single rep" });
      }
    }
    if (form.minWeightKg !== "" && form.minWeightKg !== undefined) {
      const minW = parseFloat(form.minWeightKg);
      if (!isNaN(minW) && !isNaN(weight) && weight > 0 && minW > weight) {
        errors.minWeightKg = "Can't be greater than working weight";
        toast.error("Min weight can't be greater than working weight", { description: "Min weight is your lightest warm-up set" });
      }
      if (form.maxWeightKg !== "" && form.maxWeightKg !== undefined) {
        const maxW = parseFloat(form.maxWeightKg);
        if (!isNaN(maxW) && !isNaN(minW) && minW > maxW) {
          errors.minWeightKg = "Can't be greater than max weight";
          toast.error("Min weight can't be greater than max weight");
        }
      }
    }

    // RPE vs effort level consistency
    const rpe = form.rpe ? parseInt(form.rpe) : null;
    const effort = form.effortLevel;
    if (rpe && effort) {
      if (rpe <= 3 && (effort === "hard" || effort === "max" || effort === "failure")) {
        errors.rpe = "Conflicts with effort level";
        toast.error("RPE and effort conflict", { description: `RPE ${rpe} = very easy, but effort = ${effort}. Adjust one.` });
      }
      if (rpe >= 9 && (effort === "easy" || effort === "moderate")) {
        errors.rpe = "Conflicts with effort level";
        toast.error("RPE and effort conflict", { description: `RPE ${rpe} = near failure, but effort = ${effort}. Adjust one.` });
      }
    }

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    setValidationErrors({});
    try {
      const body: any = {
        exerciseName: name,
        muscleGroup: form.muscleGroup,
        weightKg: weight,
        reps: reps,
        sets: sets,
        effortLevel: form.effortLevel,
        restSeconds: parseInt(form.restSeconds) || 90,
        notes: form.notes.trim() || undefined,
      };
      if (form.maxWeightKg) body.maxWeightKg = parseFloat(form.maxWeightKg);
      if (form.minWeightKg) body.minWeightKg = parseFloat(form.minWeightKg);
      if (form.rpe) body.rpe = parseInt(form.rpe);

      const res = await apiFetch("/api/iron-coach/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.hint) {
          toast.error(data.error, { duration: 6000, description: data.hint });
        } else {
          toast.error(data.error || "Failed to save");
        }
        return;
      }

      if (data.isNewPR) {
        toast.success("🎉 New Personal Record!", {
          description: `${data.prType?.replace("_", " ")} PR on ${name}!`,
          duration: 4000,
        });
      } else {
        toast.success("Progress logged");
      }

      setShowForm(false);
      setForm(DEFAULT_LOG);
      fetchLogs();
    } catch (err) {
      console.error("[weight-progress] Save failed:", err);
      toast.error("Failed to save — check your connection");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete log
  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/api/iron-coach/progress?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Deleted");
        setDeleteConfirm(null);
        fetchLogs();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to delete");
      }
    } catch (err) {
      console.error("[weight-progress] Delete failed:", err);
      toast.error("Failed to delete — check your connection");
    }
  };

  // Group logs by exercise for this week
  const groupedByExercise = useMemo(() => {
    const groups: Record<string, WeightLog[]> = {};
    logs.forEach((l) => {
      const key = l.exercise_name.toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    });
    return groups;
  }, [logs]);

  // Get exercise history for sparklines (all time, per exercise)
  const exerciseHistory = useMemo(() => {
    const hist: Record<string, number[]> = {};
    logs.forEach((l) => {
      const key = l.exercise_name.toLowerCase();
      if (!hist[key]) hist[key] = [];
      const w = l.max_weight_kg || l.weight_kg;
      hist[key].push(parseFloat(w.toFixed(1)));
    });
    // Reverse for chronological order
    Object.keys(hist).forEach((k) => hist[k].reverse());
    return hist;
  }, [logs]);

  const isCurrentWeek = currentWeek === getISOWeek(new Date()) && currentYear === getYear(new Date());
  const weekLabel = `${format(currentWeekStart, "MMM d")} – ${format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), "MMM d")}`;

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  const isDark = theme === "gymbro" || theme === "dark";

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="p-4 pb-8 space-y-4">

        {/* ─── Week Navigator ─── */}
        <div className="flex items-center gap-2">
          <button onClick={goPrevWeek} className="p-2 rounded-lg bg-muted/30 active:scale-95 transition-all">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 text-center">
            <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-zinc-900")}>
              Week {currentWeek}
            </p>
            <p className="text-[11px] text-muted-foreground">{weekLabel}</p>
          </div>
          <button onClick={goNextWeek} className={cn("p-2 rounded-lg active:scale-95 transition-all", isCurrentWeek ? "bg-muted/10 opacity-30 pointer-events-none" : "bg-muted/30")}>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          {!isCurrentWeek && (
            <button onClick={goToday} className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-muted/30 text-muted-foreground active:scale-95 transition-all">
              Today
            </button>
          )}
        </div>

        {/* ─── Quick Stats Bar ─── */}
        {stats && stats.totalLogs > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Zap, label: "Volume", value: `${stats.totalVolume.toLocaleString()}kg`, color: "text-amber-400" },
              { icon: Target, label: "Sets", value: String(stats.totalSets), color: "text-blue-400" },
              { icon: Award, label: "PRs", value: String(stats.personalRecords), color: "text-red-400" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/20">
                <s.icon className={cn("w-3.5 h-3.5 shrink-0", s.color)} />
                <div>
                  <p className={cn("text-sm font-bold leading-tight", isDark ? "text-white" : "text-zinc-900")}>{s.value}</p>
                  <p className="text-[9px] text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Muscle Group Filter ─── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveMuscleFilter(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all",
              !activeMuscleFilter
                ? `${styles.accentBtn} text-white shadow-md ${styles.accentGlow}`
                : "bg-muted/30 text-muted-foreground"
            )}
          >
            All
          </button>
          {MUSCLE_GROUPS.map((mg) => (
            <button
              key={mg.value}
              onClick={() => setActiveMuscleFilter(activeMuscleFilter === mg.value ? null : mg.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all",
                activeMuscleFilter === mg.value
                  ? `${styles.accentBtn} text-white shadow-md ${styles.accentGlow}`
                  : "bg-muted/30 text-muted-foreground"
              )}
            >
              {mg.emoji} {mg.label}
            </button>
          ))}
        </div>

        {/* ─── PR Showcase (if any) ─── */}
        {prs.length > 0 && !activeMuscleFilter && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20"
          >
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400">Recent Personal Records</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {prs.slice(0, 5).map((pr) => (
                <div key={pr.id} className="shrink-0 px-3 py-2 rounded-lg bg-black/20">
                  <p className="text-[10px] text-amber-300 font-semibold truncate max-w-[120px]">{pr.exercise_name}</p>
                  <p className="text-sm font-bold text-amber-400">{pr.max_weight_kg || pr.weight_kg}kg</p>
                  <p className="text-[9px] text-amber-300/60">{format(new Date(pr.logged_at), "MMM d")}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── Loading ─── */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ─── Empty State ─── */}
        {!isLoading && logs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-10"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
              <Dumbbell className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className={cn("text-sm font-medium", isDark ? "text-zinc-300" : "text-zinc-700")}>
              No logs this week
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap + to log your first exercise
            </p>
          </motion.div>
        )}

        {/* ─── Exercise Groups ─── */}
        {!isLoading && Object.keys(groupedByExercise).length > 0 && (
          <div className="space-y-3">
            {Object.entries(groupedByExercise).map(([key, exerciseLogs]) => {
              const first = exerciseLogs[0];
              const mg = MUSCLE_GROUPS.find((m) => m.value === first.muscle_group);
              const histValues = exerciseHistory[key] || [];
              const maxWeight = Math.max(...exerciseLogs.map((l) => l.max_weight_kg || l.weight_kg));
              const best1RM = Math.max(...exerciseLogs.map((l) => l.estimated_1rm || 0));

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl overflow-hidden border border-border/50 bg-muted/10"
                >
                  {/* Exercise Header */}
                  <div className="px-3 py-2.5 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center text-sm shrink-0">
                      {mg?.emoji || "🔧"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn("text-sm font-semibold truncate", isDark ? "text-white" : "text-zinc-900")}>
                          {first.exercise_name}
                        </p>
                        {first.is_pr && <PRBadge prType={first.pr_type} />}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {mg?.label || "Other"} · {exerciseLogs.length} {exerciseLogs.length === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    {/* Mini sparkline */}
                    {histValues.length >= 2 && (
                      <MiniSparkline values={histValues} color={theme === "gymbro" ? "#f87171" : theme === "gymgirl" ? "#f472b6" : "#a78bfa"} />
                    )}
                  </div>

                  {/* Best Stats Row */}
                  <div className="flex border-t border-border/30">
                    <div className="flex-1 px-3 py-2 text-center border-r border-border/30">
                      <p className="text-[9px] text-muted-foreground">Max</p>
                      <p className={cn("text-sm font-bold", styles.accent)}>{maxWeight}kg</p>
                    </div>
                    <div className="flex-1 px-3 py-2 text-center border-r border-border/30">
                      <p className="text-[9px] text-muted-foreground">Est. 1RM</p>
                      <p className={cn("text-sm font-bold", styles.accent)}>{best1RM > 0 ? best1RM : "–"}</p>
                    </div>
                    <div className="flex-1 px-3 py-2 text-center">
                      <p className="text-[9px] text-muted-foreground">Total Sets</p>
                      <p className={cn("text-sm font-bold", styles.accent)}>{exerciseLogs.reduce((s, l) => s + l.sets, 0)}</p>
                    </div>
                  </div>

                  {/* Individual Entries */}
                  <div className="divide-y divide-border/20">
                    {exerciseLogs.map((log) => (
                      <div key={log.id} className="px-3 py-2.5 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{log.weight_kg}kg</span>
                            <span className="text-[10px] text-muted-foreground">× {log.reps} reps × {log.sets} sets</span>
                            {log.rpe && (
                              <span className={cn(
                                "text-[9px] px-1 py-0.5 rounded font-medium",
                                log.rpe <= 3 ? "bg-emerald-500/10 text-emerald-400"
                                  : log.rpe <= 6 ? "bg-yellow-500/10 text-yellow-400"
                                  : log.rpe <= 8 ? "bg-orange-500/10 text-orange-400"
                                  : "bg-red-500/10 text-red-400"
                              )}>
                                RPE {log.rpe}
                              </span>
                            )}
                            {log.effort_level && (
                              <span className={cn("text-[9px]", EFFORT_LEVELS.find(e => e.value === log.effort_level)?.color)}>
                                {log.effort_level}
                              </span>
                            )}
                          </div>
                          {log.notes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{log.notes}</p>
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground shrink-0">
                          {format(new Date(log.logged_at), "E")}
                        </p>
                        <button
                          onClick={() => setDeleteConfirm(log.id)}
                          className="p-1 rounded active:scale-90 transition-all"
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground/30 hover:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ─── Floating Add Button ─── */}
        {typeof document !== 'undefined' && createPortal(
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => { setShowForm(true); setEditingId(null); setForm(DEFAULT_LOG); setValidationErrors({}); }}
          className={cn(
            "fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-xl flex items-center justify-center z-[250]",
            styles.accentBtn,
            styles.accentGlow
          )}
          style={{ boxShadow: `0 8px 25px -5px ${theme === "gymbro" ? "rgba(239,68,68,0.4)" : theme === "gymgirl" ? "rgba(236,72,153,0.4)" : "rgba(139,92,246,0.4)"}` }}
        >
          <Plus className="w-6 h-6 text-white" />
        </motion.button>,
        document.body
        )}

        {/* ─── Delete Confirmation ─── */}
        <AnimatePresence>
          {deleteConfirm && typeof document !== 'undefined' && createPortal(
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-end justify-center"
              onClick={() => setDeleteConfirm(null)}
            >
              <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md mx-4 mb-8 p-4 rounded-2xl bg-card border border-border shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Delete this log?</p>
                    <p className="text-xs text-muted-foreground">This cannot be undone</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-muted/30 text-sm font-medium active:scale-95 transition-all">
                    Cancel
                  </button>
                  <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium active:scale-95 transition-all">
                    Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>,
            document.body
          )}
        </AnimatePresence>

        {/* ─── Log Entry Form ─── */}
        <AnimatePresence>
          {showForm && typeof document !== 'undefined' && createPortal(
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-end justify-center"
              onClick={() => setShowForm(false)}
            >
              <motion.div
                initial={{ y: 400 }}
                animate={{ y: 0 }}
                exit={{ y: 400 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md mx-0 rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[90vh] flex flex-col"
              >
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
                </div>

                {/* Header */}
                <div className="px-5 pb-3 flex items-center justify-between border-b border-border/50">
                  <h3 className={cn("text-base font-bold", isDark ? "text-white" : "text-zinc-900")}>
                    {editingId ? "Edit Entry" : "Log Exercise"}
                  </h3>
                  <button onClick={() => setShowForm(false)} className="p-2 rounded-lg bg-muted/30 active:scale-95 transition-all">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Form */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                  {/* Exercise Name */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Exercise</label>
                    <input
                      type="text"
                      value={form.exerciseName}
                      onChange={(e) => { setForm((f) => ({ ...f, exerciseName: e.target.value })); setValidationErrors((v) => { const n = { ...v }; delete n.exerciseName; return n; }); }}
                      placeholder="e.g. Bench Press, Deadlift..."
                      className={cn(
                        "w-full px-4 py-3 rounded-xl text-sm font-medium outline-none transition-all",
                        isDark
                          ? validationErrors.exerciseName
                            ? "bg-red-500/5 border border-red-500/40 text-white placeholder:text-zinc-500 focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20"
                            : "bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
                          : validationErrors.exerciseName
                            ? "bg-red-50 border border-red-300 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20"
                            : "bg-zinc-100 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/20"
                      )}
                      autoFocus
                    />
                    {validationErrors.exerciseName && (
                      <p className="text-[10px] text-red-400 mt-1 font-medium">{validationErrors.exerciseName}</p>
                    )}
                  </div>

                  {/* Muscle Group */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Muscle Group</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {MUSCLE_GROUPS.map((mg) => (
                        <button
                          key={mg.value}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, muscleGroup: mg.value }))}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                            form.muscleGroup === mg.value
                              ? `${styles.accentBtn} text-white`
                              : "bg-muted/30 text-muted-foreground"
                          )}
                        >
                          {mg.emoji} {mg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weight + Sets + Reps */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Weight (kg)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={form.weightKg}
                        onChange={(e) => { setForm((f) => ({ ...f, weightKg: e.target.value })); setValidationErrors((v) => { const n = { ...v }; delete n.weightKg; return n; }); }}
                        placeholder="60"
                        className={cn(
                          "w-full px-3 py-3 rounded-xl text-sm font-bold text-center outline-none transition-all",
                          isDark
                            ? validationErrors.weightKg
                              ? "bg-red-500/5 border border-red-500/40 text-white placeholder:text-zinc-600 focus:border-red-500/60"
                              : "bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:border-red-500/40"
                            : validationErrors.weightKg
                              ? "bg-red-50 border border-red-300 text-zinc-900 placeholder:text-zinc-300 focus:border-red-400/60"
                              : "bg-zinc-100 border border-zinc-200 text-zinc-900 placeholder:text-zinc-300 focus:border-violet-400/40"
                        )}
                      />
                      {validationErrors.weightKg && (
                        <p className="text-[9px] text-red-400 mt-1 font-medium text-center">{validationErrors.weightKg}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Sets</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={form.sets}
                        onChange={(e) => { setForm((f) => ({ ...f, sets: e.target.value })); setValidationErrors((v) => { const n = { ...v }; delete n.sets; return n; }); }}
                        placeholder="3"
                        className={cn(
                          "w-full px-3 py-3 rounded-xl text-sm font-bold text-center outline-none transition-all",
                          isDark
                            ? validationErrors.sets
                              ? "bg-red-500/5 border border-red-500/40 text-white placeholder:text-zinc-600 focus:border-red-500/60"
                              : "bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:border-red-500/40"
                            : validationErrors.sets
                              ? "bg-red-50 border border-red-300 text-zinc-900 placeholder:text-zinc-300 focus:border-red-400/60"
                              : "bg-zinc-100 border border-zinc-200 text-zinc-900 placeholder:text-zinc-300 focus:border-violet-400/40"
                        )}
                      />
                      {validationErrors.sets && (
                        <p className="text-[9px] text-red-400 mt-1 font-medium text-center">{validationErrors.sets}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Reps</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={form.reps}
                        onChange={(e) => { setForm((f) => ({ ...f, reps: e.target.value })); setValidationErrors((v) => { const n = { ...v }; delete n.reps; return n; }); }}
                        placeholder="10"
                        className={cn(
                          "w-full px-3 py-3 rounded-xl text-sm font-bold text-center outline-none transition-all",
                          isDark
                            ? validationErrors.reps
                              ? "bg-red-500/5 border border-red-500/40 text-white placeholder:text-zinc-600 focus:border-red-500/60"
                              : "bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:border-red-500/40"
                            : validationErrors.reps
                              ? "bg-red-50 border border-red-300 text-zinc-900 placeholder:text-zinc-300 focus:border-red-400/60"
                              : "bg-zinc-100 border border-zinc-200 text-zinc-900 placeholder:text-zinc-300 focus:border-violet-400/40"
                        )}
                      />
                      {validationErrors.reps && (
                        <p className="text-[9px] text-red-400 mt-1 font-medium text-center">{validationErrors.reps}</p>
                      )}
                    </div>
                  </div>

                  {/* Max / Min Weight (optional) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Max Weight (kg)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={form.maxWeightKg}
                        onChange={(e) => setForm((f) => ({ ...f, maxWeightKg: e.target.value }))}
                        placeholder="Heaviest set"
                        className={cn(
                          "w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all",
                          isDark
                            ? "bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:border-red-500/40"
                            : "bg-zinc-100 border border-zinc-200 text-zinc-900 placeholder:text-zinc-300 focus:border-violet-400/40"
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Min Weight (kg)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={form.minWeightKg}
                        onChange={(e) => setForm((f) => ({ ...f, minWeightKg: e.target.value }))}
                        placeholder="Warm-up"
                        className={cn(
                          "w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all",
                          isDark
                            ? "bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:border-red-500/40"
                            : "bg-zinc-100 border border-zinc-200 text-zinc-900 placeholder:text-zinc-300 focus:border-violet-400/40"
                        )}
                      />
                    </div>
                  </div>

                  {/* RPE Scale */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      RPE (Rate of Perceived Exertion)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-muted-foreground/30">1</span>
                      <div className="flex-1">
                        <RPEScale value={form.rpe} onChange={(v) => setForm((f) => ({ ...f, rpe: v }))} />
                      </div>
                      <span className="text-lg font-bold text-muted-foreground/30">10</span>
                    </div>
                    {form.rpe && (
                      <p className={cn("text-[10px] mt-1", parseInt(form.rpe) <= 3 ? "text-emerald-400" : parseInt(form.rpe) <= 6 ? "text-yellow-400" : parseInt(form.rpe) <= 8 ? "text-orange-400" : "text-red-400")}>
                        {parseInt(form.rpe) <= 3 ? "Light — could do many more reps"
                          : parseInt(form.rpe) <= 6 ? "Moderate — 3-4 reps in reserve"
                          : parseInt(form.rpe) <= 8 ? "Hard — 1-2 reps in reserve"
                          : parseInt(form.rpe) === 9 ? "Very hard — 1 rep in reserve"
                          : "Max effort / failure"}
                      </p>
                    )}
                  </div>

                  {/* Effort Level */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Effort Level</label>
                    <div className="flex gap-1.5">
                      {EFFORT_LEVELS.map((el) => (
                        <button
                          key={el.value}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, effortLevel: el.value }))}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all",
                            form.effortLevel === el.value
                              ? "bg-white/10 border border-white/20"
                              : "bg-muted/20 text-muted-foreground/60"
                          )}
                        >
                          {el.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rest Time */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Rest Between Sets (sec)</label>
                    <div className="flex gap-1.5">
                      {["60", "90", "120", "180", "300"].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, restSeconds: s }))}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all",
                            form.restSeconds === s
                              ? `${styles.accentBtn} text-white`
                              : "bg-muted/30 text-muted-foreground"
                          )}
                        >
                          {s === "60" ? "1m" : s === "90" ? "1.5m" : s === "120" ? "2m" : s === "180" ? "3m" : "5m"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Notes (optional)</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Felt strong, grip was slipping..."
                      rows={2}
                      maxLength={500}
                      className={cn(
                        "w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all",
                        isDark
                          ? "bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:border-red-500/40"
                          : "bg-zinc-100 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400/40"
                      )}
                    />
                  </div>
                </div>

                {/* Save Button */}
                <div className="p-5 pt-3 border-t border-border/50">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={cn(
                      "w-full py-3.5 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                      styles.accentBtn,
                      isSaving && "opacity-60 pointer-events-none"
                    )}
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {isSaving ? "Saving..." : "Log Exercise"}
                  </button>
                </div>

                {/* Safe area */}
                <div className="h-[env(safe-area-inset-bottom,0px)]" />
              </motion.div>
            </motion.div>,
            document.body
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
