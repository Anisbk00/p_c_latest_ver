/**
 * Workout Tracking Page - Premium iOS-Grade Experience
 * 
 * Features:
 * - Real-time GPS tracking with offline persistence
 * - Live map with animated path
 * - Comprehensive metrics with haptic feedback
 * - Auto-lap, auto-pause support
 * - Post-workout summary with AI insights
 * 
 * @module components/fitness/workout-tracking-page
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Play,
  Pause,
  Square,
  MapPin,
  Timer,
  Flame,
  Activity,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Award,
  Zap,
  Mountain,
  CheckCircle,
  Flag,
  Navigation,
  Share2,
  Download,
  X,
  Loader2,
  Wifi,
  WifiOff,
  Gauge,
  Clock,
  Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from '@/lib/mobile-api';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/app-context";
import { useWorkoutSync } from "@/hooks/use-workout-sync";
import { useGPSTracking } from "@/hooks/use-gps-tracking";
import {
  formatDuration,
  formatDistance,
  formatPace,
  formatSpeed,
  MetricsSnapshot,
  TrackingSession,
} from "@/lib/gps-tracking";
import { LiveTrackingMap } from "@/components/fitness/live-tracking-map";
import { GPXImport } from "@/components/fitness/gpx-import";
import { WorkoutImportData } from "@/lib/gpx-parser";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface Workout {
  id: string;
  activityType: string;
  workoutType: string;
  name: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  activeDuration: number | null;
  distanceMeters: number | null;
  routeData: string | null;
  elevationGain: number | null;
  avgPace: number | null;
  avgSpeed: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
  trainingLoad: number | null;
  intensityFactor: number | null;
  recoveryImpact: number | null;
  effortScore: number | null;
  isPR: boolean;
  prType: string | null;
  notes: string | null;
  rating: number | null;
}

interface ActivityType {
  id: string;
  name: string;
  icon: React.ReactNode;
  met: number;
  defaultSpeed: number; // km/h
  color: string;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const ACTIVITY_TYPES: ActivityType[] = [
  { id: "run", name: "Run", icon: <Activity className="w-5 h-5" />, met: 9.8, defaultSpeed: 10, color: "emerald" },
  { id: "cycle", name: "Ride", icon: <Navigation className="w-5 h-5" />, met: 7.5, defaultSpeed: 20, color: "blue" },
  { id: "walk", name: "Walk", icon: <MapPin className="w-5 h-5" />, met: 3.5, defaultSpeed: 5, color: "green" },
  { id: "hike", name: "Hike", icon: <Mountain className="w-5 h-5" />, met: 6.0, defaultSpeed: 4, color: "amber" },
  { id: "swim", name: "Swim", icon: <Zap className="w-5 h-5" />, met: 8.0, defaultSpeed: 2, color: "cyan" },
  { id: "other", name: "Other", icon: <Gauge className="w-5 h-5" />, met: 5.0, defaultSpeed: 0, color: "gray" },
];

// ═══════════════════════════════════════════════════════════════
// Activity Selection Component
// ═══════════════════════════════════════════════════════════════

function ActivitySelector({ 
  selected, 
  onSelect,
  disabled 
}: { 
  selected: string; 
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ACTIVITY_TYPES.map((activity) => (
        <motion.button
          key={activity.id}
          whileTap={{ scale: disabled ? 1 : 0.95 }}
          onClick={() => !disabled && onSelect(activity.id)}
          disabled={disabled}
          className={cn(
            "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
            selected === activity.id
              ? `border-${activity.color}-500 bg-${activity.color}-500/10`
              : "border-border/50 hover:border-border",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            selected === activity.id ? `bg-${activity.color}-500 text-white` : "bg-muted text-muted-foreground"
          )}>
            {activity.icon}
          </div>
          <span className={cn(
            "text-sm font-medium",
            selected === activity.id ? "" : "text-muted-foreground"
          )}>
            {activity.name}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Live Metrics Display
// ═══════════════════════════════════════════════════════════════

function LiveMetricsStrip({
  metrics,
  activityType,
  isPaused,
}: {
  metrics: MetricsSnapshot | null;
  activityType: string;
  isPaused: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  if (!metrics) return null;

  const primaryMetrics = [
    { label: "Distance", value: formatDistance(metrics.distance), unit: "km", icon: <Ruler className="w-4 h-4" /> },
    { label: "Duration", value: formatDuration(metrics.duration), unit: "", icon: <Clock className="w-4 h-4" /> },
    { label: "Pace", value: formatPace(metrics.avgPace), unit: "/km", icon: <Gauge className="w-4 h-4" /> },
    { label: "Calories", value: Math.round(metrics.calories).toString(), unit: "kcal", icon: <Flame className="w-4 h-4" /> },
  ];

  const secondaryMetrics = [
    { label: "Moving Time", value: formatDuration(metrics.movingTime), icon: <Timer className="w-4 h-4" /> },
    { label: "Elevation Gain", value: `${Math.round(metrics.elevationGain)}m`, icon: <Mountain className="w-4 h-4" /> },
    { label: "Current Pace", value: formatPace(metrics.currentPace), icon: <Activity className="w-4 h-4" /> },
    { label: "Last km", value: formatPace(metrics.lastKmPace), icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-3xl shadow-lg border border-border overflow-hidden"
    >
      {/* Primary Metrics Strip */}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-2">
          {primaryMetrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="text-center"
            >
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                {metric.icon}
                <span className="text-[10px] uppercase tracking-wider">{metric.label}</span>
              </div>
              <div className="text-xl font-bold">
                {metric.value}
                {metric.unit && <span className="text-xs text-muted-foreground ml-0.5">{metric.unit}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Expandable Secondary Metrics */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border bg-muted/30"
          >
            <div className="p-4 grid grid-cols-2 gap-3">
              {secondaryMetrics.map((metric) => (
                <div key={metric.label} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {metric.icon}
                    <span className="text-xs">{metric.label}</span>
                  </div>
                  <span className="text-sm font-medium">{metric.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full py-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Show less
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            More metrics
          </>
        )}
      </button>

      {/* Paused Overlay */}
      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={prefersReducedMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          >
            <Badge variant="secondary" className="text-sm py-1 px-3">
              <Pause className="w-4 h-4 mr-2" />
              Paused
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Control Buttons
// ═══════════════════════════════════════════════════════════════

function ControlButtons({
  isTracking,
  isPaused,
  onStart,
  onPause,
  onResume,
  onStop,
  onLap,
  disabled,
}: {
  isTracking: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onLap: () => void;
  disabled?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (!isTracking) {
    return (
      <motion.button
        whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
        onClick={onStart}
        disabled={disabled}
        className={cn(
          "w-full h-16 rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500",
          "text-white font-semibold text-lg",
          "flex items-center justify-center gap-2",
          "shadow-lg shadow-emerald-500/30",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Play className="w-6 h-6" />
        Start Workout
      </motion.button>
    );
  }

  return (
    <div className="flex gap-3">
      {/* Lap Button */}
      <motion.button
        whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
        onClick={onLap}
        disabled={isPaused}
        className={cn(
          "w-16 h-16 rounded-2xl bg-muted border border-border",
          "flex items-center justify-center",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Flag className="w-6 h-6 text-muted-foreground" />
      </motion.button>

      {/* Main Control Button */}
      <motion.button
        whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
        onClick={isPaused ? onResume : onPause}
        className={cn(
          "flex-1 h-16 rounded-2xl font-semibold text-lg",
          "flex items-center justify-center gap-2",
          isPaused
            ? "bg-linear-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
            : "bg-amber-500 text-white shadow-lg shadow-amber-500/30"
        )}
      >
        {isPaused ? (
          <>
            <Play className="w-6 h-6" />
            Resume
          </>
        ) : (
          <>
            <Pause className="w-6 h-6" />
            Pause
          </>
        )}
      </motion.button>

      {/* Stop Button */}
      <motion.button
        whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
        onClick={onStop}
        className={cn(
          "w-16 h-16 rounded-2xl bg-red-500",
          "flex items-center justify-center",
          "shadow-lg shadow-red-500/30"
        )}
      >
        <Square className="w-6 h-6 text-white" />
      </motion.button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Post-Workout Summary Modal - With Trajectory Background
// ═══════════════════════════════════════════════════════════════

function PostWorkoutSummary({
  session,
  metrics,
  onSave,
  onDiscard,
  onShare,
}: {
  session: TrackingSession | null;
  metrics: MetricsSnapshot | null;
  onSave: (notes?: string, rating?: number) => void;
  onDiscard: () => void;
  onShare: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  
  // Theme detection for gymbro/gymgirl styling
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'gymbro' | 'gymgirl'>('light');
  
  useEffect(() => {
    const updateTheme = () => {
      if (typeof window === 'undefined') return;
      const html = document.documentElement;
      if (html.classList.contains('gymbro')) setAppTheme('gymbro');
      else if (html.classList.contains('gymgirl')) setAppTheme('gymgirl');
      else if (html.classList.contains('dark')) setAppTheme('dark');
      else setAppTheme('light');
    };
    updateTheme();
    
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  
  // Theme-aware colors
  const isGymbro = appTheme === 'gymbro';
  const isGymgirl = appTheme === 'gymgirl';
  const primaryColor = isGymbro ? '#EF4444' : isGymgirl ? '#FF6B9D' : '#10B981';
  const accentColor = isGymbro ? '#DC2626' : isGymgirl ? '#FF8FAB' : '#14B8A6';

  // Convert session points to route points for the map
  const routePoints = useMemo(() => {
    if (!session?.points?.length) return [];
    return session.points.map(p => ({
      lat: p.lat,
      lon: p.lon,
      elevation: p.altitude,
      timestamp: p.timestamp,
      speed: p.speed ?? undefined,
      heading: p.heading ?? undefined,
    }));
  }, [session]);

  if (!session || !metrics) return null;

  const activity = ACTIVITY_TYPES.find(a => a.id === session.activityType);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(notes, rating || undefined);
    setIsSaving(false);
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[200] bg-background"
    >
      {/* Trajectory Background Map - Show if we have at least 1 point */}
      {routePoints.length >= 1 && (
        <div className="absolute inset-0 z-0 opacity-70 pointer-events-none">
          <LiveTrackingMap
            route={{ points: routePoints }}
            height="100%"
            showControls={false}
            showFollowingControls={false}
            isTracking={false}
          />
        </div>
      )}
      
      {/* Gradient Overlay for readability - lighter */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-background/60 via-background/70 to-background/95" />

      <div className="relative z-10 h-full overflow-y-auto pb-56">
        {/* Header */}
        <div className="p-6 text-center">
          <motion.div
            initial={prefersReducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="w-20 h-20 mx-auto rounded-full flex items-center justify-center shadow-lg mb-4"
            style={{ 
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
              boxShadow: `0 10px 40px ${primaryColor}40`
            }}
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold">Workout Complete!</h1>
          <p className="text-muted-foreground mt-1">
            {activity?.name || "Activity"} • {formatDistance(metrics.distance)}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="px-4 grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Distance</p>
              <p className="text-2xl font-bold">{formatDistance(metrics.distance)} km</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Duration</p>
              <p className="text-2xl font-bold">{formatDuration(metrics.duration)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Avg Pace</p>
              <p className="text-2xl font-bold">{formatPace(metrics.avgPace)}</p>
              <p className="text-xs text-muted-foreground">/km</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Calories</p>
              <p className="text-2xl font-bold">{Math.round(metrics.calories)}</p>
              <p className="text-xs text-muted-foreground">kcal</p>
            </CardContent>
          </Card>
        </div>

        {/* Route Preview Card - Shows trajectory if available */}
        {routePoints.length >= 1 && (
          <div className="px-4 mt-4">
            <Card className="overflow-hidden">
              <div className="h-56 relative">
                <LiveTrackingMap
                  route={{ points: routePoints }}
                  height={224}
                  showControls={false}
                  showFollowingControls={false}
                  isTracking={false}
                />
              </div>
              <CardContent className="pt-3 pb-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your Route</span>
                  <span className="font-medium">{routePoints.length} point{routePoints.length !== 1 ? 's' : ''}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Additional Stats */}
        <div className="px-4 mt-4">
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Moving time</span>
                <span className="font-medium">{formatDuration(metrics.movingTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Elevation gain</span>
                <span className="font-medium">{Math.round(metrics.elevationGain)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg speed</span>
                <span className="font-medium">{formatSpeed(metrics.avgSpeed)}</span>
              </div>
              {session.laps.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Laps</span>
                  <span className="font-medium">{session.laps.length}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rating */}
        <div className="px-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">How did it feel?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRating(r)}
                    className={cn(
                      "flex-1 h-12 rounded-xl border-2 transition-all",
                      rating === r
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <span className={cn(
                      "text-xl",
                      rating === r ? "" : "text-muted-foreground"
                    )}>
                      {r === 1 ? "😫" : r === 2 ? "😔" : r === 3 ? "😐" : r === 4 ? "😊" : "🤩"}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        <div className="px-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How was your workout? Any observations?"
                className="w-full h-24 p-3 rounded-xl bg-muted resize-none border-none outline-none"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Actions - positioned at bottom with safe area padding */}
      <div 
        className="fixed bottom-0 left-0 right-0 px-4 pt-5 pb-6 z-[201]"
        style={{ 
          backgroundColor: 'var(--background)',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px) + 0.5rem)',
        }}
      >
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onDiscard}
            className="flex-1 h-14 text-base border-2"
            style={{ borderColor: isGymbro ? '#EF4444' : isGymgirl ? '#FF6B9D' : undefined, color: isGymbro ? '#EF4444' : isGymgirl ? '#FF6B9D' : undefined }}
            disabled={isSaving}
          >
            <X className="w-5 h-5 mr-2" />
            Discard
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 h-14 text-base text-white"
            style={{ backgroundColor: primaryColor }}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Save Workout
              </>
            )}
          </Button>
        </div>
        <Button
          variant="ghost"
          onClick={onShare}
          className="w-full mt-3 h-12"
          disabled={isSaving}
        >
          <Share2 className="w-5 h-5 mr-2" />
          Share
        </Button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Workout History Item
// ═══════════════════════════════════════════════════════════════

function WorkoutHistoryItem({
  workout,
  onTap,
}: {
  workout: Workout;
  onTap: () => void;
}) {
  const activity = ACTIVITY_TYPES.find(a => a.id === workout.activityType);
  const prefersReducedMotion = useReducedMotion();

  // Safely format date - handle invalid/missing dates
  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Date unknown';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get display name for activity type
  const getActivityDisplayName = (activityType: string | undefined): string => {
    if (!activityType) return 'Workout';
    const activityNames: Record<string, string> = {
      'run': 'Run', 'running': 'Run',
      'cycle': 'Ride', 'cycling': 'Ride', 'bike': 'Ride', 'biking': 'Ride',
      'walk': 'Walk', 'walking': 'Walk',
      'hike': 'Hike', 'hiking': 'Hike',
      'swim': 'Swim', 'swimming': 'Swim',
      'other': 'Workout', 'workout': 'Workout',
      'strength': 'Strength', 'cardio': 'Cardio',
    };
    return activityNames[activityType.toLowerCase()] || activityType;
  };

  return (
    <motion.button
      whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
      onClick={onTap}
      className="w-full p-4 rounded-2xl bg-card border border-border hover:border-muted-foreground/30 transition-all text-left"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            activity?.id === 'run' ? 'bg-emerald-500/10 text-emerald-500' :
            activity?.id === 'cycle' ? 'bg-blue-500/10 text-blue-500' :
            'bg-gray-500/10 text-gray-500'
          )}
        >
          {activity?.icon || <Activity className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">
              {workout.name || activity?.name || getActivityDisplayName(workout.activityType)}
            </p>
            {workout.isPR && (
              <Badge className="bg-amber-500/10 text-amber-600 text-[10px]">
                <Award className="w-3 h-3 mr-1" />
                PR
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(workout.startedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium">
            {workout.distanceMeters ? formatDistance(workout.distanceMeters) : "--"} km
          </p>
          <p className="text-sm text-muted-foreground">
            {workout.durationMinutes ? formatDuration(workout.durationMinutes * 60) : "--:--"}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Workout Page Component
// ═══════════════════════════════════════════════════════════════

export function WorkoutTrackingPage() {
  // Global context
  const { workouts, workoutsLoading, refetchWorkouts, latestWeight } = useApp();
  const { isSyncing } = useWorkoutSync();

  // Estimated max heart rate (Tanaka formula: 208 - 0.7 × age).
  // Uses age 30 as default when birthDate is unavailable from profile.
  const estimatedMaxHR = useMemo(() => {
    const defaultAge = 30;
    return Math.round(208 - 0.7 * defaultAge);
  }, []);

  // GPS tracking hook
  const {
    session,
    metrics,
    isTracking,
    isPaused,
    isOffline,
    gpsError,
    permissionStatus,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
    addLap,
    fusedState,
    fusionEngineRef,
  } = useGPSTracking(
    latestWeight?.value || 70,
    estimatedMaxHR
  );

  // UI state
  const [selectedActivity, setSelectedActivity] = useState("run");
  const [showSummary, setShowSummary] = useState(false);
  const [completedSession, setCompletedSession] = useState<TrackingSession | null>(null);
  const [completedMetrics, setCompletedMetrics] = useState<MetricsSnapshot | null>(null);
  const [showGPXImport, setShowGPXImport] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Handlers
  const handleStartWorkout = useCallback(async () => {
    try {
      await startTracking(selectedActivity);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Failed to start tracking:", error);
      }
    }
  }, [selectedActivity, startTracking]);

  const handleStopWorkout = useCallback(async () => {
    const finalSession = await stopTracking();
    if (finalSession) {
      setCompletedSession(finalSession);
      setCompletedMetrics(metrics);
      setShowSummary(true);
    }
  }, [stopTracking, metrics]);

  const handleSaveWorkout = useCallback(async (notes?: string, rating?: number) => {
    if (!completedSession || !completedMetrics) return;

    try {
      const response = await apiFetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: completedSession.activityType,
          durationMinutes: Math.round(completedSession.totalDuration / 60),
          distanceMeters: Math.round(completedSession.totalDistance),
          caloriesBurned: Math.round(completedSession.calories),
          routeData: JSON.stringify(completedSession.points),
          elevationGain: completedSession.elevationGain,
          avgPace: completedSession.avgPace,
          avgSpeed: completedSession.avgSpeed,
          avgHeartRate: completedSession.avgHeartRate,
          trainingLoad: Math.round(completedSession.totalDuration / 60 * 0.75),
          notes,
          rating,
          splits: JSON.stringify(completedSession.laps),
        }),
      });

      if (response.ok) {
        refetchWorkouts();
        setShowSummary(false);
        setCompletedSession(null);
        setCompletedMetrics(null);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Failed to save workout:", error);
      }
    }
  }, [completedSession, completedMetrics, refetchWorkouts]);

  const handleDiscardWorkout = useCallback(() => {
    setShowSummary(false);
    setCompletedSession(null);
    setCompletedMetrics(null);
  }, []);

  // Calculate map route from session points
  const routePoints = useMemo(() => {
    if (!session?.points?.length) return [];
    return session.points.map(p => ({ 
      lat: p.lat, 
      lon: p.lon,
      elevation: p.altitude,
      timestamp: p.timestamp,
      speed: p.speed ?? undefined,
      heading: p.heading ?? undefined,
      accuracy: p.accuracy ?? undefined,
    }));
  }, [session]);
  
  // Get current position (prefer fusion state, fallback to raw GPS)
  const currentPosition = useMemo(() => {
    // Use fusion state if available (60fps interpolated)
    if (fusedState && isTracking) {
      return {
        lat: fusedState.lat,
        lon: fusedState.lon,
        elevation: fusedState.altitude,
        timestamp: fusedState.timestamp,
        speed: fusedState.speed,
        heading: fusedState.heading,
        accuracy: fusedState.accuracy,
        // Fusion confidence indicator
        confidence: fusedState.confidence,
      };
    }
    
    // Fallback to last raw GPS point
    if (session?.points?.length) {
      const lastPoint = session.points[session.points.length - 1];
      return {
        lat: lastPoint.lat,
        lon: lastPoint.lon,
        elevation: lastPoint.altitude,
        timestamp: lastPoint.timestamp,
        speed: lastPoint.speed ?? undefined,
        heading: lastPoint.heading ?? undefined,
        accuracy: lastPoint.accuracy ?? undefined,
        confidence: 0.5, // Medium confidence for raw GPS
      };
    }
    
    return null;
  }, [fusedState, session, isTracking]);

  // Render loading state
  if (workoutsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Status Bar - Only show when NOT tracking */}
      {!isTracking && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            {isOffline ? (
              <Badge variant="secondary" className="gap-1">
                <WifiOff className="w-3 h-3" />
                Offline
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-600">
                <Wifi className="w-3 h-3" />
                Online
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {gpsError && (
              <Badge variant="destructive" className="gap-1">
                <MapPin className="w-3 h-3" />
                GPS Error
              </Badge>
            )}
            {isSyncing && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Syncing
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      {!isTracking ? (
        <>
          {/* Activity Selection */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold mb-4">Choose Activity</h2>
              <ActivitySelector
                selected={selectedActivity}
                onSelect={setSelectedActivity}
              />
            </CardContent>
          </Card>

          {/* Start Button */}
          <ControlButtons
            isTracking={false}
            isPaused={false}
            onStart={handleStartWorkout}
            onPause={() => {}}
            onResume={() => {}}
            onStop={() => {}}
            onLap={() => {}}
          />

          {/* GPS Permission Warning */}
          {permissionStatus === "denied" && (
            <Card className="border-destructive">
              <CardContent className="pt-4 pb-3">
                <p className="text-sm text-destructive">
                  Location permission denied. Please enable location access in your browser settings to track workouts.
                </p>
              </CardContent>
            </Card>
          )}

          {/* GPX Import */}
          <Card>
            <CardContent className="pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowGPXImport(true)}
              >
                <Download className="w-4 h-4 mr-2" />
                Import GPX Route
              </Button>
            </CardContent>
          </Card>

          {/* Workout History */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Recent Workouts</h3>
            {workouts && workouts.length > 0 ? (
              <div className="space-y-2">
                {workouts.slice(0, 5).map((workout) => (
                  <WorkoutHistoryItem
                    key={workout.id}
                    workout={workout as Workout}
                    onTap={() => {
                      console.log('[WorkoutDetail] Tapped workout:', workout.id);
                    }}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <Activity className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    No workouts yet. Start your first workout above!
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Live Tracking Map */}
          <motion.div
            animate={{ height: mapExpanded ? "50vh" : "35vh" }}
            className="relative rounded-3xl overflow-hidden"
          >
            <LiveTrackingMap
              route={{ points: routePoints }}
              currentPosition={currentPosition}
              fusionEngineRef={fusionEngineRef}
              isTracking={isTracking}
              height={mapExpanded ? "50vh" : "35vh"}
              showControls={true}
              showFollowingControls={true}
              defaultZoom={16}
              totalDistance={session?.totalDistance || metrics?.distance || 0}
              totalDuration={session?.totalDuration || metrics?.duration || 0}
              elevationGain={session?.elevationGain || metrics?.elevationGain || 0}
              onFullscreenChange={setMapFullscreen}
              isPaused={isPaused}
              onPause={pauseTracking}
              onResume={resumeTracking}
              onStop={handleStopWorkout}
            />
            {/* Expand button - hidden when fullscreen */}
            {!mapFullscreen && (
              <button
                onClick={() => setMapExpanded(!mapExpanded)}
                className="absolute bottom-3 right-3 p-2 rounded-xl bg-background/80 backdrop-blur-sm shadow-lg z-10"
              >
                {mapExpanded ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronUp className="w-5 h-5" />
                )}
              </button>
            )}
          </motion.div>

          {/* Live Metrics - hidden when map is fullscreen */}
          {!mapFullscreen && (
            <LiveMetricsStrip
              metrics={metrics}
              activityType={session?.activityType || "run"}
              isPaused={isPaused}
            />
          )}

          {/* Control Buttons - hidden when map is fullscreen */}
          {!mapFullscreen && (
            <ControlButtons
              isTracking={isTracking}
              isPaused={isPaused}
              onStart={() => {}}
              onPause={pauseTracking}
              onResume={resumeTracking}
              onStop={handleStopWorkout}
              onLap={addLap}
            />
          )}

          {/* Laps */}
          {session?.laps && session.laps.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Laps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {session.laps.map((lap, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{lap.lapNumber}</Badge>
                      <span className="text-sm">{formatDuration(lap.duration)}</span>
                    </div>
                    <div className="text-sm font-medium">
                      {lap.distance > 0 && `${(lap.distance / 1000).toFixed(2)}km`}
                      {lap.avgPace && ` • ${formatPace(lap.avgPace)}/km`}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Post-Workout Summary */}
      <AnimatePresence>
        {showSummary && (
          <PostWorkoutSummary
            session={completedSession}
            metrics={completedMetrics}
            onSave={handleSaveWorkout}
            onDiscard={handleDiscardWorkout}
            onShare={() => {
              if (!completedSession || !completedMetrics) return;
              const activityLabel = completedSession.activityType.charAt(0).toUpperCase() + completedSession.activityType.slice(1);
              const shareText = [
                `🏋️ ${activityLabel} Workout`,
                completedSession.totalDistance > 0 ? `📏 ${formatDistance(completedSession.totalDistance)}` : null,
                `⏱️ ${formatDuration(completedSession.totalDuration)}`,
                completedMetrics.avgPace ? `⚡ Pace: ${formatPace(completedMetrics.avgPace)}` : null,
                `🔥 ~${Math.round(completedSession.calories)} cal`,
              ].filter(Boolean).join('\n');

              if (typeof navigator !== 'undefined' && navigator.share) {
                navigator.share({ title: `${activityLabel} Workout`, text: shareText }).catch(() => {});
              } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(shareText).catch(() => {});
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* GPX Import Modal */}
      <GPXImport
        open={showGPXImport}
        onClose={() => setShowGPXImport(false)}
        onImport={async (data: WorkoutImportData) => {
          try {
            const response = await apiFetch("/api/workouts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                activityType: data.activityType,
                durationMinutes: data.durationMinutes || 0,
                distanceMeters: data.distanceMeters || 0,
                routeData: data.routeData ? JSON.stringify(data.routeData) : undefined,
                elevationGain: data.elevationGain,
                avgPace: data.avgPace,
                avgSpeed: data.avgSpeed,
                avgHeartRate: data.avgHeartRate,
                caloriesBurned: data.caloriesBurned,
                name: data.name,
                source: data.source,
              }),
            });
            if (response.ok) {
              refetchWorkouts();
              setShowGPXImport(false);
            } else {
              console.error('[GPX Import] Save failed:', response.status);
            }
          } catch (err) {
            console.error('[GPX Import] Error saving imported workout:', err);
          }
          setShowGPXImport(false);
        }}
      />
    </div>
  );
}

export default WorkoutTrackingPage;
