"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSupabaseAuth } from "@/lib/supabase/auth-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { useRouter } from "next/navigation";
import {
  User,
  Crown,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Camera,
  CameraOff,
  Star,
  Zap,
  Activity,
  Calendar,
  Utensils,
  Dumbbell,
  Brain,
  Award,
  Lock,
  Check,
  Plus,
  ChevronRight,
  ChevronLeft,
  Scale,
  Edit3,
  Upload,
  Play,
  Beaker,
  Sparkles,
  Gauge,
  X,
  Save,
  Loader2,
  FileText,
  FileJson,
  FileSpreadsheet,
  Settings,
  LogOut,
  Bell,
  RefreshCcw,
  Trash2,
  AlertTriangle,
  Fingerprint,
  Shield,
  ShieldOff,
  ChevronDown,
  ImageOff,
  Grid3x3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceBadge } from "@/components/fitness/confidence-badge";
import { ProvenanceTag } from "@/components/fitness/provenance-tag";
import { SignOutAnimation } from "@/components/auth/sign-out-animation";
import { ProgressPhotoUploadSheet } from "@/components/fitness/progress-photo-upload-sheet";
import { useSetup } from "@/contexts/setup-context";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { useApp } from "@/contexts/app-context";
import { toast } from "sonner";
import { apiFetch } from "@/lib/mobile-api";
// Dropdown imports removed (settings button now navigates directly)
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ============================================
// Types
// ============================================

export interface ProfileData {
  profile?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl?: string;
    level: number;
    xp: number;
    xpToNextLevel: number;
    streak: number;
    consistency: number;
    active: boolean;
    trajectory: "improving" | "stable" | "declining";
    joinedAt: string;
    coachingTone: string;
  };
  // Real UserProfile data from database
  userProfile?: {
    heightCm: number | null;
    biologicalSex: string | null;
    birthDate: Date | null;
    activityLevel: string;
    fitnessLevel: string;
    primaryGoal: string | null;
    targetWeightKg: number | null;
    customCalorieTarget?: number | null;
  };
  stats?: {
    currentWeight: number | null;
    weightUnit: string;
    goalWeight: number | null;
    goalType: string;
    consistency: number;
    streak: number;
    weightTrend: "up" | "down" | "neutral";
    weightChange: number | null;
  };
  goal?: {
    primaryGoal: string;
    activityLevel: string;
    dailyCalorieTarget: number;
    proteinTarget: number;
    workoutDaysPerWeek: number;
    todayCalories: number;
    customCalorieTarget?: number | null;
  };
  settings?: {
    customCalorieTarget?: number | null;
    customProteinTarget?: number | null;
    customCarbsTarget?: number | null;
    customFatTarget?: number | null;
  };
  bodyComposition?: {
    id: string;
    date: string;
    bodyFatMin: number;
    bodyFatMax: number;
    muscleTone: number;
    confidence: number;
    photoCount: number;
    source: "model" | "device" | "manual";
    commentary: string;
  } | null;
  progressPhotos?: Array<{
    id: string;
    date: string;
    imageUrl: string;
    thumbnailUrl?: string | null;
    weight?: number | null;
    notes?: string | null;
    isHighlight?: boolean;
    bodyFat?: {
      min: number;
      max: number;
      confidence: number;
    } | null;
    muscleMass?: number | null;
    changeZones?: Array<{area: string; direction: string; confidence: number}> | null;
  }>;
  experiments?: Array<{
    id: string;
    title: string;
    description: string;
    duration: number;
    adherence: number;
    status: "available" | "active" | "completed";
    startedAt?: string;
    expectedOutcome: string;
    category: "nutrition" | "training" | "habit";
    dailyActions?: string[];
    whyItWorks?: string;
    tipsForSuccess?: string[];
  }>;
  snapshot?: {
    level: number;
    xp: number;
    streak: number;
    nutritionScore: number;
    totalPhotos: number;
    totalMeals: number;
    totalWorkouts: number;
    daysTracked: number;
  };
  milestones?: Array<{
    id: string;
    title: string;
    description: string;
    achievedAt?: string;
    progress?: number;
    totalRequired: number;
  }>;
}

// Default snapshot for new users
const DEFAULT_SNAPSHOT = {
  level: 1,
  xp: 0,
  streak: 0,
  nutritionScore: 0,
  totalPhotos: 0,
  totalMeals: 0,
  totalWorkouts: 0,
  daysTracked: 0,
};

const DEFAULT_PROFILE = {
  id: '',
  name: null,
  email: '',
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  streak: 0,
  consistency: 0,
  active: true,
  trajectory: 'stable' as const,
  joinedAt: new Date().toISOString(),
  coachingTone: 'supportive',
};

const DEFAULT_STATS = {
  currentWeight: null,
  weightUnit: 'kg',
  goalWeight: null,
  goalType: 'maintenance',
  consistency: 0,
  streak: 0,
  weightTrend: 'neutral' as const,
  weightChange: null,
};

const DEFAULT_GOAL = {
  primaryGoal: 'maintenance',
  activityLevel: 'moderate',
  dailyCalorieTarget: 2000,
  proteinTarget: 150,
  workoutDaysPerWeek: 3,
  todayCalories: 0,
};

// ============================================
// Profile Data Hook
// ============================================

let cachedProfileData: ProfileData | null = null;
let isFetching = false; // Prevent concurrent fetches
let fetchSequence = 0; // Monotonically increasing counter to discard stale fetches

function useProfileData() {
  const [data, setData] = useState<ProfileData | null>(cachedProfileData);
  const [isLoading, setIsLoading] = useState(!cachedProfileData);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Prevent concurrent fetches (except force-refresh)
    if (isFetching && !forceRefresh) return;
    
    // Capture sequence at fetch start — only update state if this is still the latest
    const mySequence = ++fetchSequence;
    
    try {
      isFetching = true;
      if (forceRefresh) {
        cachedProfileData = null;
      }
      if (!cachedProfileData) setIsLoading(true);
      
      // Fetch profile data from API
      const response = await apiFetch('/api/profile');
      if (!response.ok) throw new Error('Failed to fetch profile');
      const result = await response.json();
      
      // Get latest weight for stats
      const latestWeight = result.latestWeight;
      const activeGoal = Array.isArray(result.goals) && result.goals.length > 0 ? result.goals[0] : null;
      const goalCalories = Number(activeGoal?.caloriesTarget ?? NaN);
      const goalProtein = Number(activeGoal?.proteinTargetG ?? NaN);
      
      // Transform API response to ProfileData format
      const profileData: ProfileData = {
        profile: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          avatarUrl: result.user.avatarUrl,
          level: result.user?.level || result.stats?.level || 1,
          xp: result.user?.xpProgress ?? (result.user?.xp || 0),
          xpToNextLevel: result.user?.xpToNextLevel || 100,
          streak: result.stats?.currentStreak || 0,
          consistency: result.stats?.consistencyScore || 0,
          active: true,
          trajectory: 'stable',
          joinedAt: result.user.createdAt,
          coachingTone: result.user.coachingTone || 'supportive',
        },
        userProfile: result.profile ? {
          heightCm: result.profile.heightCm,
          biologicalSex: result.profile.biologicalSex,
          birthDate: result.profile.birthDate,
          // Reverse map activityLevel: 'athlete' -> 'very_active' for UI compatibility
          activityLevel: result.profile.activityLevel === 'athlete' 
            ? 'very_active' 
            : (result.profile.activityLevel || 'moderate'),
          fitnessLevel: result.profile.fitnessLevel || 'beginner',
          // Reverse map primaryGoal: 'weight_loss' -> 'fat_loss' for UI compatibility
          primaryGoal: result.profile.primaryGoal === 'weight_loss' 
            ? 'fat_loss' 
            : (result.profile.primaryGoal || 'maintenance'),
          targetWeightKg: result.profile.targetWeightKg,
          customCalorieTarget: Number(result.settings?.customCalorieTarget ?? NaN) > 0
            ? Math.round(Number(result.settings?.customCalorieTarget))
            : null,
        } : undefined,
        stats: {
          currentWeight: latestWeight?.value || null,
          weightUnit: latestWeight?.unit || 'kg',
          goalWeight: result.profile?.targetWeightKg || null,
          // Reverse map goalType for display
          goalType: result.profile?.primaryGoal === 'weight_loss' 
            ? 'fat_loss' 
            : (result.profile?.primaryGoal || 'maintenance'),
          consistency: result.stats?.consistencyScore || 0,
          streak: result.stats?.currentStreak || 0,
          weightTrend: 'neutral' as const,
          weightChange: null,
        },
        goal: {
          // Reverse map primaryGoal: 'weight_loss' -> 'fat_loss' for UI
          primaryGoal: result.profile?.primaryGoal === 'weight_loss' 
            ? 'fat_loss' 
            : (result.profile?.primaryGoal || 'maintenance'),
          // Reverse map activityLevel: 'athlete' -> 'very_active' for UI
          activityLevel: result.profile?.activityLevel === 'athlete' 
            ? 'very_active' 
            : (result.profile?.activityLevel || 'moderate'),
          dailyCalorieTarget: Number.isFinite(goalCalories) && goalCalories > 0 ? Math.round(goalCalories) : 2000,
          proteinTarget: Number.isFinite(goalProtein) && goalProtein > 0 ? Math.round(goalProtein) : 150,
          workoutDaysPerWeek: 3,
          todayCalories: 0,
          customCalorieTarget: Number(result.settings?.customCalorieTarget ?? NaN) > 0
            ? Math.round(Number(result.settings?.customCalorieTarget))
            : null,
        },
        settings: {
          customCalorieTarget: Number(result.settings?.customCalorieTarget ?? NaN) > 0
            ? Math.round(Number(result.settings?.customCalorieTarget))
            : null,
          customProteinTarget: Number(result.settings?.customProteinTarget ?? NaN) > 0
            ? Math.round(Number(result.settings?.customProteinTarget))
            : null,
          customCarbsTarget: Number(result.settings?.customCarbsTarget ?? NaN) > 0
            ? Math.round(Number(result.settings?.customCarbsTarget))
            : null,
          customFatTarget: Number(result.settings?.customFatTarget ?? NaN) > 0
            ? Math.round(Number(result.settings?.customFatTarget))
            : null,
        },
        bodyComposition: null,
        progressPhotos: result.progressPhotos?.map((p: {
          id: string;
          capturedAt: Date | string;
          imageUrl: string;
          thumbnailUrl?: string;
          weight?: number | null;
          notes?: string;
          bodyFat?: { min: number; max: number; confidence: number } | null;
          muscleMass?: number | null;
          analysisSource?: string | null;
          analysisConfidence?: number | null;
          changeZones?: Array<{ area: string; direction: string; confidence: number }> | null;
        }) => ({
          id: p.id,
          date: typeof p.capturedAt === 'string' ? p.capturedAt : p.capturedAt.toISOString(),
          imageUrl: p.imageUrl,
          thumbnailUrl: p.thumbnailUrl,
          weight: p.weight,
          notes: p.notes,
          bodyFat: p.bodyFat,
          muscleMass: p.muscleMass,
          changeZones: p.changeZones,
          isHighlight: false,
        })) || [],
        experiments: result.experiments?.map((e: { 
          id: string; 
          title: string; 
          description?: string | null; 
          duration?: number;
          durationWeeks?: number; 
          adherence?: number;
          adherenceScore?: number | null; 
          status: string; 
          startedAt?: Date | string; 
          expectedOutcome?: string | null; 
          experimentType?: string;
          category?: string;
          dailyActions?: string[];
          whyItWorks?: string;
          tipsForSuccess?: string[];
        }) => ({
          id: e.id,
          title: e.title,
          description: e.description || '',
          duration: e.duration || (e.durationWeeks ? e.durationWeeks * 7 : 14),
          adherence: e.adherence || e.adherenceScore || 0,
          status: e.status as 'available' | 'active' | 'completed',
          startedAt: e.startedAt ? (typeof e.startedAt === 'string' ? e.startedAt : e.startedAt.toISOString()) : undefined,
          expectedOutcome: e.expectedOutcome || '',
          category: (e.category || e.experimentType === 'nutrition' ? 'nutrition' : e.experimentType === 'training' ? 'training' : 'habit') as 'nutrition' | 'training' | 'habit',
          dailyActions: e.dailyActions || [],
          whyItWorks: e.whyItWorks || '',
          tipsForSuccess: e.tipsForSuccess || [],
        })) || [],
        snapshot: {
          level: result.stats?.level || result.user?.level || 1,
          xp: result.stats?.xp || result.user?.xp || 0,
          streak: result.stats?.currentStreak || 0,
          nutritionScore: result.stats?.nutritionScore || 0,
          totalPhotos: result.stats?.totalProgressPhotos || 0,
          totalMeals: result.stats?.totalMeals || result.stats?.totalFoodLogEntries || 0,
          totalWorkouts: result.stats?.totalWorkouts || 0,
          daysTracked: result.stats?.totalMeasurements || 0,
        },
        milestones: result.goals?.map((g: { id: string; goalType: string; targetValue: number; currentValue?: number | null; status: string }) => ({
          id: g.id,
          title: g.goalType.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: `Target: ${g.targetValue}`,
          achievedAt: g.status === 'completed' ? new Date().toISOString() : undefined,
          progress: g.currentValue || 0,
          totalRequired: g.targetValue,
        })) || [],
      };
      
      // Discard stale fetch results — a newer fetch has since started
      if (mySequence !== fetchSequence) return;
      
      cachedProfileData = profileData;
      if (isMounted.current) {
        setData(profileData);
        setError(null);
      }
    } catch (err) {
      // Discard stale errors too
      if (mySequence !== fetchSequence) return;
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      // Only reset isFetching if this is still the latest fetch
      if (mySequence === fetchSequence) {
        isFetching = false;
      }
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    // Always fetch to verify cache freshness (prevents stale data across user sessions).
    // If cachedProfileData exists it is used for instant render via useState initializer,
    // but we always do a background fetch to ensure correctness.
    fetchData(true);
    return () => {
      isMounted.current = false;
    };
  }, [fetchData]);

  // Debounced refetch to prevent rapid calls
  const refetchDebounced = useCallback(() => {
    // Don't show loading on refetch - use stale data while refreshing
    fetchData(true);
  }, [fetchData]);

  return { data, isLoading, error, refetch: refetchDebounced };
}

// ============================================
// Utility Functions
// ============================================

function getTrajectoryGradient(trajectory: ProfileData["profile"]["trajectory"]): string {
  switch (trajectory) {
    case "improving": return "from-orange-500/20 via-amber-500/10 to-transparent";
    case "stable": return "from-slate-500/20 via-gray-500/10 to-transparent";
    case "declining": return "from-blue-500/20 via-sky-500/10 to-transparent";
  }
}

function getTrajectoryColor(trajectory: ProfileData["profile"]["trajectory"]): string {
  switch (trajectory) {
    case "improving": return "text-orange-500";
    case "stable": return "text-slate-500";
    case "declining": return "text-blue-500";
  }
}

function getGoalLabel(goal: string, t: (key: string) => string): string {
  switch (goal) {
    case "fat_loss": return t('profile.goal.fat_loss');
    case "muscle_gain": return t('profile.goal.muscle_gain');
    case "recomposition": return t('profile.goal.recomposition');
    case "maintenance": return t('profile.goal.maintenance');
    default: return goal;
  }
}

function getActivityLabel(level: string, t: (key: string) => string): string {
  switch (level) {
    case "sedentary": return t('profile.activity.sedentary');
    case "light": return t('profile.activity.light');
    case "moderate": return t('profile.activity.moderate');
    case "active": return t('profile.activity.active');
    case "very_active": return t('profile.activity.very_active');
    default: return level;
  }
}

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t('home.greeting.morning');
  if (hour < 18) return t('home.greeting.afternoon');
  return t('home.greeting.evening');
}

// ============================================
// Components
// ============================================

// Profile Header
function ProfileHeader({
  profile,
  stats,
  onEditProfile,
  onOpenSettings,
  t,
}: {
  profile: ProfileData["profile"];
  stats: ProfileData["stats"];
  onEditProfile: () => void;
  onOpenSettings?: () => void;
  t: (key: string) => string;
}) {
  const { signOut } = useSupabaseAuth();
  const router = useRouter();
  const { needsSetup, openSetupModal } = useSetup();
  const xpProgress = (profile.xp / profile.xpToNextLevel) * 100;
  
  const handleGoToSettings = () => {
    onOpenSettings?.();
  };
  const trajectoryIcon = profile.trajectory === "improving" 
    ? <TrendingUp className="w-3 h-3" />
    : profile.trajectory === "declining"
    ? <TrendingDown className="w-3 h-3" />
    : <Minus className="w-3 h-3" />;
  
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSignOutAnimation, setShowSignOutAnimation] = useState(false);
  const [signOutStage, setSignOutStage] = useState<'processing' | 'success' | 'complete'>('processing');
  
  const handleSignOut = async () => {
    setIsSigningOut(true);
    setShowSignOutAnimation(true);
    setSignOutStage('processing');
    
    try {
      await signOut();
      
      // Show success stage
      setSignOutStage('success');
      
      // Wait for animation, then complete
      setTimeout(() => {
        setSignOutStage('complete');
        // Navigation is handled by signOut
      }, 1200);
      
    } catch (error) {
      // Lock errors are handled internally, but just in case
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.toLowerCase().includes('lock') && 
          !errorMsg.toLowerCase().includes('abort') &&
          !errorMsg.toLowerCase().includes('steal')) {
        console.error('Sign out error:', error);
      }
      // Still redirect on error after brief delay
      setShowSignOutAnimation(false);
      window.location.href = '/';
    }
  };
  
  const handleResetApp = async () => {
    setIsResetting(true);
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
      });
      
      if (response.ok) {
        toast.success('App reset successfully!', {
          description: 'All your data has been cleared.',
        });
        // Refresh the page to show fresh state
        window.location.reload();
      } else {
        toast.error('Failed to reset app');
      }
    } catch (error) {
      console.error('Reset error:', error);
      toast.error('Failed to reset app. Please try again.');
    } finally {
      setIsResetting(false);
      setShowResetDialog(false);
    }
  };
  
  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/auth/delete', {
        method: 'DELETE',
      });
      
      if (response.ok) {
        toast.success('Account deleted successfully', {
          description: 'Your account and all data have been permanently removed.',
        });
        // Clear all local caches to prevent stale data on next sign-in
        try { localStorage.removeItem('progress-companion-settings-cache'); } catch {}
        try { localStorage.removeItem('progress-companion-profile-cache'); } catch {}
        // Clear local state and redirect to home
        window.location.href = '/';
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      toast.error('Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <motion.div
      data-testid="profile-header"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-3xl p-4 sm:p-6",
        "bg-linear-to-br",
        getTrajectoryGradient(profile.trajectory),
        "border border-border"
      )}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-emerald-500/20 to-teal-500/20 rounded-full blur-3xl" />
      
      {/* Mobile: 3-col row (photo | xp+level | edit), Desktop: horizontal */}
      <div className="relative flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        {/* Mobile: Photo | XP Bar + Level | Edit/Settings */}
        <div className="flex items-center gap-3 sm:justify-start sm:gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className={cn(
              "w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xl sm:text-2xl font-bold",
              profile.active && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background"
            )}>
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name ?? 'User'} className="w-full h-full rounded-full object-cover" />
              ) : (
                (profile.name ?? 'U').charAt(0).toUpperCase()
              )}
            </div>

            {profile.active && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-emerald-500"
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}

            <div className="absolute -bottom-1 -right-1 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Crown className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
            </div>
          </div>

          {/* XP Bar + Level — mobile only, hidden on desktop (shown in Info section) */}
          <div className="flex-1 min-w-0 sm:hidden">
            <div className="h-2.5 bg-muted/80 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full"
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {t('profile.level')} {profile.level}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {profile.xp}/{profile.xpToNextLevel} XP
              </span>
            </div>
          </div>

          {/* Edit buttons - visible on mobile, hidden on desktop */}
          <div className="flex items-center gap-1 sm:hidden shrink-0">
            <button
              onClick={onEditProfile}
              className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              aria-label="Edit Profile"
            >
              <Edit3 className="w-4 h-4 text-muted-foreground" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  aria-label="More Options"
                >
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('nav.settings')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleGoToSettings}>
                  <Settings className="w-4 h-4 mr-2" />
                  {t('nav.settings')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('nav.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Info — desktop shows XP bar here, mobile hides it */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold truncate">{profile.name ?? 'User'}</h1>
            <Badge className="bg-linear-to-r from-emerald-500 to-teal-600 text-white text-xs shrink-0 sm:inline-flex hidden">
              {t('profile.level')} {profile.level}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('profile.buildingHabits')}
          </p>
          
          {/* XP Bar — desktop only */}
          <div className="mt-3 hidden sm:block">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{t('profile.xpProgress')}</span>
              <span className="font-medium">{profile.xp} / {profile.xpToNextLevel}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full"
              />
            </div>
          </div>

          {/* Badges row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <Flame className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500" />
              <span className="text-xs sm:text-sm font-medium text-orange-600">{profile.streak} {t('home.streak.days')} {t('home.streak.label')}</span>
            </div>

            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg",
              profile.trajectory === "improving" && "bg-orange-500/10 border border-orange-500/20",
              profile.trajectory === "stable" && "bg-slate-500/10 border border-slate-500/20",
              profile.trajectory === "declining" && "bg-blue-500/10 border border-blue-500/20"
            )}>
              <span className={getTrajectoryColor(profile.trajectory)}>
                {trajectoryIcon}
              </span>
              <span className={cn("text-xs sm:text-sm font-medium", getTrajectoryColor(profile.trajectory))}>
                {profile.trajectory === "improving" ? t('profile.improving') : 
                 profile.trajectory === "stable" ? t('profile.stable') : 
                 t('profile.declining')}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop edit buttons - hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <button
            onClick={onEditProfile}
            className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            aria-label="Edit Profile"
          >
            <Edit3 className="w-4 h-4 text-muted-foreground" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors outline-none"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('profile.myAccount')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                onOpenSettings?.();
              }}>
                <Settings className="mr-2 h-4 w-4" />
                <span>{t('settings.title')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-red-600 focus:text-red-600"
                onClick={async () => {
                  await signOut();
                  router.push('/');
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t('settings.account.signOut')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        {getGreeting(t)}, {profile.name ?? 'User'}. Here's your journey today.
      </p>
      
      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset App?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your fitness data including meals, workouts, progress photos, measurements, and goals. Your account will remain, but all data will be cleared. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetApp}
              disabled={isResetting}
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Everything'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">{t('dialog.deleteAccount.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently delete your account</strong> and ALL associated data including:
              <br /><br />
              • Your profile and settings<br />
              • All meals and nutrition logs<br />
              • All workouts and exercise data<br />
              • Progress photos and measurements<br />
              • Goals and achievements
              <br /><br />
              <strong>This action cannot be undone.</strong> You will need to create a new account to use the app again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('dialog.deleteAccount.deleting')}
                </>
              ) : (
                t('dialog.deleteAccount.confirm')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Sign Out Animation */}
      <SignOutAnimation
        isVisible={showSignOutAnimation}
        stage={signOutStage}
        userName={profile.name ?? undefined}
      />
    </motion.div>
  );
}

// Evolution Metrics Strip - APPROVED BY USER
function EvolutionMetricsStrip({
  stats,
  bodyComposition,
  snapshot,
  onMetricTap,
  t,
}: {
  stats: ProfileData["stats"];
  bodyComposition: ProfileData["bodyComposition"];
  snapshot: ProfileData["snapshot"];
  onMetricTap: (id: string) => void;
  t: (key: string) => string;
}) {
  // Calculate weight progress
  const weightProgress = stats.goalWeight && stats.currentWeight
    ? stats.goalType === 'fat_loss'
      ? Math.min(100, ((stats.goalWeight - stats.currentWeight + 10) / 20) * 100)
      : Math.min(100, ((stats.currentWeight - stats.goalWeight + 10) / 20) * 100)
    : 0;

  const metrics = [
    { 
      id: "weight", 
      label: stats.goalWeight ? `${stats.currentWeight?.toFixed(1) || "--"} → ${stats.goalWeight.toFixed(1)}` : t('profile.currentWeight'), 
      value: stats.currentWeight?.toFixed(1) || "--", 
      unit: stats.weightUnit, 
      icon: Scale,
      subtext: stats.goalWeight ? `Target: ${stats.goalWeight.toFixed(1)} ${stats.weightUnit}` : undefined
    },
    { id: "bodyFat", label: t('analytics.bodyFat'), value: bodyComposition ? ((bodyComposition.bodyFatMin + bodyComposition.bodyFatMax) / 2).toFixed(0) : "--", unit: "%", icon: Activity },
    { id: "streak", label: t('home.streak.label'), value: `${stats.streak}`, unit: t('home.streak.days'), icon: Flame },
    { 
      id: "consistency", 
      label: t('profile.consistency'), 
      value: `${stats.consistency}`, 
      unit: "%", 
      icon: Gauge,
      subtext: stats.consistency >= 80 ? t('profile.excellent') : stats.consistency >= 50 ? t('profile.goodProgress') : t('profile.keepTracking')
    },
  ];

  return (
    <div className="flex gap-3">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <motion.button
            key={metric.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onMetricTap(metric.id)}
            className="flex-1 p-3 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50 hover:border-emerald-500/30 transition-all active:scale-95 shadow-sm"
          >
            <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1.5" />
            <div className="text-center">
              <span className="text-lg font-bold block leading-tight">{metric.value}</span>
              <span className="text-[10px] text-muted-foreground">{metric.unit}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-center truncate">{metric.label}</p>
            {metric.subtext && (
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-0.5 text-center truncate">{metric.subtext}</p>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// AI Evolution Summary - APPROVED BY USER (Enhanced visibility)
function AIEvolutionSummary({ stats, bodyComposition }: { stats: ProfileData["stats"]; bodyComposition: ProfileData["bodyComposition"] }) {
  const generateSummary = () => {
    const parts: string[] = [];
    
    if (stats.weightTrend === "down") {
      parts.push("Weight trending downward");
    } else if (stats.weightTrend === "up") {
      parts.push("Weight trending upward");
    }
    
    if (bodyComposition) {
      parts.push(`body fat estimated at ${bodyComposition.bodyFatMin}-${bodyComposition.bodyFatMax}%`);
    }
    
    if (stats.consistency >= 80) {
      parts.push("excellent consistency");
    } else if (stats.consistency >= 50) {
      parts.push("steady progress");
    }
    
    if (parts.length === 0) {
      return "Keep logging your meals and workouts to see your evolution insights.";
    }
    
    return parts.join(". ") + ". Stay consistent with your tracking.";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden p-4 rounded-2xl bg-linear-to-br from-violet-500/20 via-purple-500/15 to-fuchsia-500/10 border-2 border-purple-500/30 shadow-lg shadow-purple-500/5"
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-linear-to-r from-purple-500/5 via-violet-500/10 to-purple-500/5 animate-pulse" />
      
      <div className="relative flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 shadow-md">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-purple-700 dark:text-purple-300">AI Evolution Summary</p>
            <Badge className="bg-purple-500/20 text-purple-600 text-[10px] px-1.5 py-0.5">AI</Badge>
          </div>
          <p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">
            {generateSummary()}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// Milestones Section - APPROVED BY USER
function MilestonesSection({
  milestones,
  onMilestoneTap,
}: {
  milestones: ProfileData["milestones"];
  onMilestoneTap: (milestone: ProfileData["milestones"][0]) => void;
}) {
  const milestonesList = milestones ?? [];
  
  return (
    <Card className="white-card athena-card-marble athena-accent-inlay">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-500" />
            Milestones
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {milestonesList.filter(m => m.achievedAt).length} achieved
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {milestonesList.map((milestone, index) => {
          const isAchieved = !!milestone.achievedAt;
          const progress = milestone.progress ? (milestone.progress / milestone.totalRequired) * 100 : 0;
          
          return (
            <motion.button
              key={milestone.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onMilestoneTap(milestone)}
              className={cn(
                "w-full p-3 rounded-xl border text-left transition-all active:scale-[0.98]",
                isAchieved
                  ? "bg-linear-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20"
                  : "bg-card/60 border-border/50 hover:border-emerald-500/30"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center",
                  isAchieved ? "bg-emerald-500/20" : "bg-muted/50"
                )}>
                  {isAchieved ? (
                    <Award className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Target className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{milestone.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{milestone.description}</p>
                  {!isAchieved && milestone.progress !== undefined && (
                    <div className="mt-1.5 h-1 bg-muted/50 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      />
                    </div>
                  )}
                </div>
                {isAchieved && milestone.achievedAt && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(milestone.achievedAt), "MMM d")}
                  </span>
                )}
                {!isAchieved && milestone.progress !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {milestone.progress}/{milestone.totalRequired}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </CardContent>
    </Card>
  );
}

// Goal Architecture Card
function GoalArchitectureCard({
  goal,
  onAdjust,
  t,
}: {
  goal: ProfileData["goal"];
  onAdjust: () => void;
  t: (key: string) => string;
}) {
  const calorieProgress = goal.dailyCalorieTarget > 0 
    ? Math.min(100, (goal.todayCalories / goal.dailyCalorieTarget) * 100)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-500" />
            Goal Architecture
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onAdjust} className="h-7 text-xs">
            {t('common.edit')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Primary Goal</p>
            <Badge className={cn(
              "mt-1",
              goal.primaryGoal === "fat_loss" && "bg-rose-500/20 text-rose-600",
              goal.primaryGoal === "muscle_gain" && "bg-blue-500/20 text-blue-600",
              goal.primaryGoal === "recomposition" && "bg-purple-500/20 text-purple-600",
              goal.primaryGoal === "maintenance" && "bg-slate-500/20 text-slate-600"
            )}>
              {getGoalLabel(goal.primaryGoal, t)}
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t('profile.activityLevel')}</p>
            <p className="text-sm font-medium mt-1">{getActivityLabel(goal.activityLevel, t)}</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Daily Calorie Target</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-emerald-500">{goal.dailyCalorieTarget} kcal</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
                  goal.customCalorieTarget
                    ? "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                )}
              >
                {goal.customCalorieTarget ? 'Custom' : 'Auto'}
              </span>
            </div>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${calorieProgress}%` }}
              transition={{ duration: 0.5 }}
              className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Protein target: {goal.proteinTarget}g • {goal.workoutDaysPerWeek} workout days/week
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// AI Body Composition
function AIBodyComposition({
  result,
  onUploadPhoto,
}: {
  result: ProfileData["bodyComposition"];
  onUploadPhoto: () => void;
}) {
  if (!result) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              AI Body Composition
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadPhoto}
              className="h-7 text-xs"
            >
              <Upload className="w-3 h-3 mr-1" />
              Setup
            </Button>
          </div>
          <CardDescription>
            Upload progress photos to enable body composition analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="text-center py-6">
            <Camera className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Upload progress photos to get AI-powered body composition estimates
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const bodyFatAvg = (result.bodyFatMin + result.bodyFatMax) / 2;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" />
            AI Body Composition
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onUploadPhoto}
            className="h-7 text-xs"
          >
            <Upload className="w-3 h-3 mr-1" />
            Update
          </Button>
        </div>
        <CardDescription>
          Photo-powered estimation with confidence
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex gap-4">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-muted opacity-20"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="#a855f7"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${bodyFatAvg * 2.51} 251`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold">{bodyFatAvg}%</span>
              <span className="text-[10px] text-muted-foreground">Body Fat</span>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <p className="text-xs text-muted-foreground">Estimated Range</p>
              <p className="text-sm font-bold text-purple-600">
                {result.bodyFatMin}–{result.bodyFatMax}%
              </p>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Muscle Tone</span>
              <span className="font-medium">{result.muscleTone}/100</span>
            </div>

            <div className="flex items-center gap-2">
              <ConfidenceBadge confidence={result.confidence} size="xs" />
              <span className="text-xs text-muted-foreground">
                {result.photoCount} photos
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 rounded-xl bg-muted/50">
          <p className="text-xs text-muted-foreground">{result.commentary}</p>
        </div>

        <div className="mt-2">
          <ProvenanceTag
            source={result.source}
            timestamp={new Date(result.date)}
            rationale="AI estimation from uploaded photos"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Transformation Archive
function TransformationArchive({
  photos,
  onPhotoTap,
  onUploadPhoto,
}: {
  photos: ProfileData["progressPhotos"];
  onPhotoTap: (photo: ProfileData["progressPhotos"][0]) => void;
  onUploadPhoto: () => void;
}) {
  // Track image load state to prevent black/invisible thumbnails
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const MAX_VISIBLE = 6;
  const visiblePhotos = photos.slice(0, MAX_VISIBLE);
  const hasMore = photos.length > MAX_VISIBLE;
  const hasRealImage = (photo: ProfileData["progressPhotos"][0]) =>
    !!photo.imageUrl && !photo.imageUrl.startsWith('test://');

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-500" />
            Transformation Archive
            {photos.length > 0 && (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                {photos.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={onUploadPhoto}
            className="h-7 text-xs bg-emerald-500 hover:bg-emerald-600"
          >
            <Plus className="w-3 h-3 mr-1" />
            Upload
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {photos.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-muted/80 flex items-center justify-center mx-auto mb-3">
              <CameraOff className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              Your journey starts with a single snapshot.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadPhoto}
              className="mt-3"
            >
              Upload your first photo
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {visiblePhotos.map((photo, index) => {
                const isLoaded = loadedImages.has(photo.id);
                const isFailed = failedImages.has(photo.id);
                const showRealImage = hasRealImage(photo);

                return (
                  <motion.button
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.04, duration: 0.25 }}
                    onClick={() => onPhotoTap(photo)}
                    className={cn(
                      "aspect-square rounded-xl overflow-hidden relative touch-manipulation bg-muted/50",
                      photo.isHighlight && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background"
                    )}
                  >
                    {/* Loading skeleton while image loads */}
                    {showRealImage && !isLoaded && !isFailed && (
                      <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-muted-foreground/30 animate-spin" />
                      </div>
                    )}

                    {/* Actual image */}
                    {showRealImage && !isFailed && (
                      <img
                        src={photo.imageUrl}
                        alt="Progress photo"
                        loading="lazy"
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
                          isLoaded ? "opacity-100" : "opacity-0"
                        )}
                        onLoad={() =>
                          setLoadedImages((prev) => new Set(prev).add(photo.id))
                        }
                        onError={() => {
                          setLoadedImages((prev) => {
                            const next = new Set(prev);
                            next.delete(photo.id);
                            return next;
                          });
                          setFailedImages((prev) => new Set(prev).add(photo.id));
                        }}
                      />
                    )}

                    {/* Placeholder: no image or broken image */}
                    {(!showRealImage || isFailed) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-linear-to-br from-muted to-muted/50">
                        {isFailed ? (
                          <ImageOff className="w-6 h-6 text-muted-foreground/40" />
                        ) : (
                          <User className="w-7 h-7 text-emerald-500/30" />
                        )}
                      </div>
                    )}

                    {/* Highlight glow */}
                    {photo.isHighlight && (
                      <div className="absolute inset-0 bg-linear-to-t from-emerald-500/20 to-transparent pointer-events-none" />
                    )}

                    {/* Body fat overlay */}
                    {photo.bodyFat && isLoaded && (
                      <div className="absolute top-1.5 left-1.5 right-1.5">
                        <div className="bg-black/50 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1">
                          <Activity className="w-2.5 h-2.5 text-emerald-400" />
                          <span className="text-[8px] text-white font-medium leading-none">
                            {photo.bodyFat.min.toFixed(0)}-{photo.bodyFat.max.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Date label */}
                    {isLoaded && (
                      <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-linear-to-t from-black/60 to-transparent pointer-events-none">
                        <p className="text-[9px] text-white font-medium leading-none">
                          {format(new Date(photo.date), "MMM d")}
                        </p>
                      </div>
                    )}

                    {/* Highlight star */}
                    {photo.isHighlight && isLoaded && (
                      <div className="absolute top-1.5 right-1.5 pointer-events-none">
                        <Star className="w-3 h-3 text-yellow-400" />
                      </div>
                    )}
                  </motion.button>
                );
              })}

              {/* View All cell when more than 6 photos */}
              {hasMore && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: visiblePhotos.length * 0.04, duration: 0.25 }}
                  onClick={() => onPhotoTap(photos[MAX_VISIBLE])}
                  className="aspect-square rounded-xl overflow-hidden relative touch-manipulation bg-muted/30 border border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-1"
                >
                  <Grid3x3 className="w-5 h-5 text-muted-foreground/40" />
                  <span className="text-[10px] text-muted-foreground font-medium">+{photos.length - MAX_VISIBLE}</span>
                </motion.button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground/60 mt-2.5 text-center">
              Tap a photo to view details
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Micro-Experiments Carousel
function MicroExperimentsCarousel({
  experiments,
  onStartExperiment,
  onCompleteExperiment,
  startingExperimentId,
  completingExperimentId,
  onGenerateExperiments,
  isGenerating,
}: {
  experiments: ProfileData["experiments"];
  onStartExperiment: (experiment: ProfileData["experiments"][0]) => void;
  onCompleteExperiment: (experiment: ProfileData["experiments"][0]) => void;
  startingExperimentId: string | null;
  completingExperimentId: string | null;
  onGenerateExperiments: () => void;
  isGenerating: boolean;
}) {
  const [selectedExperiment, setSelectedExperiment] = useState<ProfileData["experiments"][0] | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const getCategoryIcon = (category: ProfileData["experiments"][0]["category"]) => {
    switch (category) {
      case "nutrition": return <Utensils className="w-4 h-4" />;
      case "training": return <Dumbbell className="w-4 h-4" />;
      case "habit": return <Zap className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: ProfileData["experiments"][0]["category"]) => {
    switch (category) {
      case "nutrition": return "text-emerald-500 bg-emerald-500/10";
      case "training": return "text-blue-500 bg-blue-500/10";
      case "habit": return "text-purple-500 bg-purple-500/10";
    }
  };

  const getCategoryLabel = (category: ProfileData["experiments"][0]["category"]) => {
    switch (category) {
      case "nutrition": return "Nutrition";
      case "training": return "Training";
      case "habit": return "Habit";
    }
  };

  // Check if there's an active experiment
  const activeExperiment = experiments.find(exp => exp.status === 'active');
  const availableExperiments = experiments.filter(exp => exp.status !== 'active');

  const handleExperimentClick = (exp: ProfileData["experiments"][0]) => {
    setSelectedExperiment(exp);
    setShowDetail(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Beaker className="w-4 h-4 text-emerald-500" />
                Micro-Experiments
              </CardTitle>
              <CardDescription className="mt-1">
                {activeExperiment 
                  ? `Active: ${activeExperiment.title}` 
                  : availableExperiments.length > 0
                    ? `${availableExperiments.length} personalized experiments ready`
                    : "AI-powered experiments tailored to your goals"}
              </CardDescription>
            </div>
            {!activeExperiment && availableExperiments.length === 0 && (
              <Button
                size="sm"
                onClick={onGenerateExperiments}
                disabled={isGenerating}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1" />
                    Generate
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* Show active experiment status if exists */}
          {activeExperiment && (
            <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium text-emerald-600">Active Experiment</span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {activeExperiment.duration} days
                </Badge>
              </div>
              <p className="text-sm font-semibold">{activeExperiment.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{activeExperiment.description}</p>
              
              {/* Daily Actions */}
              {activeExperiment.dailyActions && activeExperiment.dailyActions.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Daily Actions:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {activeExperiment.dailyActions.map((action, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {activeExperiment.adherence > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{activeExperiment.adherence}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                      style={{ width: `${activeExperiment.adherence}%` }}
                    />
                  </div>
                </div>
              )}
              
              {/* Complete Button */}
              <Button
                className="w-full mt-3 bg-emerald-500 hover:bg-emerald-600"
                onClick={() => onCompleteExperiment(activeExperiment)}
                disabled={completingExperimentId === activeExperiment.id}
              >
                {completingExperimentId === activeExperiment.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Completing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Mark as Completed
                  </>
                )}
              </Button>
            </div>
          )}
          
          {/* Available experiments */}
          {availableExperiments.length > 0 ? (
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {availableExperiments.map((exp) => {
                  const isStarting = startingExperimentId === exp.id;
                  const isDisabled = !!activeExperiment || isStarting;
                  
                  return (
                    <motion.div
                      key={exp.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "shrink-0 w-64 p-4 rounded-2xl border cursor-pointer transition-all",
                        exp.status === 'completed' 
                          ? "bg-muted/30 border-border/50 opacity-60"
                          : "bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20 hover:border-emerald-500/40",
                        !isDisabled && "hover:shadow-md"
                      )}
                      onClick={() => handleExperimentClick(exp)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          getCategoryColor(exp.category)
                        )}>
                          {getCategoryIcon(exp.category)}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {exp.duration} days
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {getCategoryLabel(exp.category)}
                        </Badge>
                      </div>

                      <h4 className="text-sm font-semibold">{exp.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{exp.description}</p>

                      {/* Daily actions preview */}
                      {exp.dailyActions && exp.dailyActions.length > 0 && (
                        <div className="mt-2 p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">What you'll do:</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1">
                            • {exp.dailyActions[0]}
                          </p>
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-[10px] text-emerald-600 font-medium mb-2">
                          🎯 {exp.expectedOutcome}
                        </p>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartExperiment(exp);
                          }}
                          disabled={isDisabled}
                          className={cn(
                            "w-full h-8 text-xs",
                            exp.status === 'completed' 
                              ? "bg-muted text-muted-foreground"
                              : "bg-emerald-500 hover:bg-emerald-600"
                          )}
                        >
                          {isStarting ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Starting...
                            </>
                          ) : exp.status === 'completed' ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Completed
                            </>
                          ) : activeExperiment ? (
                            <>
                              <Lock className="w-3 h-3 mr-1" />
                              One at a time
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 mr-1" />
                              Start Experiment
                            </>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : !activeExperiment && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                <Beaker className="w-8 h-8 text-emerald-500/50" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">No experiments yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Generate personalized experiments based on your goals and habits
              </p>
              <Button
                onClick={onGenerateExperiments}
                disabled={isGenerating}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate My Experiments
                  </>
                )}
              </Button>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            Tap an experiment to see full details • Only one active experiment at a time
          </p>
        </CardContent>
      </Card>

      {/* Experiment Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedExperiment && (
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  getCategoryColor(selectedExperiment.category)
                )}>
                  {getCategoryIcon(selectedExperiment.category)}
                </div>
              )}
              {selectedExperiment?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedExperiment?.duration} day experiment • {selectedExperiment && getCategoryLabel(selectedExperiment.category)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedExperiment && (
            <div className="space-y-4">
              <div>
                <p className="text-sm">{selectedExperiment.description}</p>
              </div>

              {/* Expected Outcome */}
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-xs font-medium text-emerald-600 mb-1">Expected Outcome</p>
                <p className="text-sm">{selectedExperiment.expectedOutcome}</p>
              </div>

              {/* Daily Actions */}
              {selectedExperiment.dailyActions && selectedExperiment.dailyActions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Daily Actions</p>
                  <ul className="space-y-2">
                    {selectedExperiment.dailyActions.map((action, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-medium text-emerald-600">{idx + 1}</span>
                        </div>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Why It Works */}
              {selectedExperiment.whyItWorks && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Why It Works</p>
                  <p className="text-xs text-muted-foreground">{selectedExperiment.whyItWorks}</p>
                </div>
              )}

              {/* Tips */}
              {selectedExperiment.tipsForSuccess && selectedExperiment.tipsForSuccess.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Tips for Success</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {selectedExperiment.tipsForSuccess.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-emerald-500">💡</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Button */}
              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                onClick={() => {
                  onStartExperiment(selectedExperiment);
                  setShowDetail(false);
                }}
                disabled={!!activeExperiment || startingExperimentId === selectedExperiment.id}
              >
                {startingExperimentId === selectedExperiment.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : activeExperiment ? (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Complete current experiment first
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start This Experiment
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Identity Snapshot
function IdentitySnapshot({
  snapshot,
  onExport,
  t,
}: {
  snapshot: ProfileData["snapshot"];
  onExport: () => void;
  t: (key: string) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-500" />
            {t('profile.identitySnapshot')}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="h-7 text-xs"
          >
            {t('profile.export')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-linear-to-br from-yellow-500/10 to-amber-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-yellow-500" />
              <span className="text-xs text-muted-foreground">{t('profile.level')}</span>
            </div>
            <p className="text-2xl font-bold">{snapshot.level}</p>
          </div>

          <div className="p-3 rounded-xl bg-linear-to-br from-purple-500/10 to-violet-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">{t('profile.totalXP')}</span>
            </div>
            <p className="text-2xl font-bold">{snapshot.xp.toLocaleString()}</p>
          </div>

          <div className="p-3 rounded-xl bg-linear-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">{t('home.streak.label')}</span>
            </div>
            <p className="text-2xl font-bold">{snapshot.streak} {t('home.streak.days')}</p>
          </div>

          <div className="p-3 rounded-xl bg-linear-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">{t('profile.nutritionScore')}</span>
            </div>
            <p className="text-2xl font-bold">{snapshot.nutritionScore}%</p>
          </div>
        </div>

        <div className="mt-3 p-3 rounded-xl bg-muted/50">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-lg font-bold">{snapshot.totalPhotos}</p>
              <p className="text-[10px] text-muted-foreground">{t('profile.photos')}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{snapshot.totalMeals}</p>
              <p className="text-[10px] text-muted-foreground">{t('profile.meals')}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{snapshot.totalWorkouts}</p>
              <p className="text-[10px] text-muted-foreground">{t('profile.workouts')}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{snapshot.daysTracked}</p>
              <p className="text-[10px] text-muted-foreground">{t('profile.days')}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Photo Detail Sheet - Shows AI insights when clicking a progress photo
function PhotoDetailSheet({
  open,
  onClose,
  photo,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  photo: ProfileData["progressPhotos"][0] | null;
  onDelete?: (photoId: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!photo) return null;

  const avgBodyFat = photo.bodyFat ? ((photo.bodyFat.min + photo.bodyFat.max) / 2).toFixed(1) : null;

  const handleDelete = async () => {
    if (!onDelete || !photo) return;
    setIsDeleting(true);
    try {
      await onDelete(photo.id);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-3xl px-0 max-h-[90vh] overflow-y-auto">
        <div className="h-1 w-12 bg-muted rounded-full mx-auto mt-2 mb-4" />
        <SheetHeader className="px-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-500" />
            Progress Photo
          </SheetTitle>
          <SheetDescription>
            {format(new Date(photo.date), "MMMM d, yyyy 'at' h:mm a")}
          </SheetDescription>
        </SheetHeader>
        
        <div className="px-6 space-y-4">
          {/* Photo Preview */}
          <div className="aspect-3/4 max-h-[40vh] rounded-2xl overflow-hidden bg-linear-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center relative mx-auto w-full shadow-lg ring-1 ring-black/5">
            {photo.imageUrl && !photo.imageUrl.startsWith('test://') ? (
              <img src={photo.imageUrl} alt="Progress photo" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center">
                <User className="w-16 h-16 text-emerald-500/40" />
                <p className="text-xs text-muted-foreground mt-2">Photo stored securely</p>
              </div>
            )}
            {/* Body fat overlay for test URLs */}
            {photo.bodyFat && photo.imageUrl?.startsWith('test://') && (
              <div className="absolute top-4 left-4 right-4">
                <div className="bg-black/50 backdrop-blur-sm rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-white font-medium">
                      BF: {photo.bodyFat.min.toFixed(0)}-{photo.bodyFat.max.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Date & Weight Section */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Date</span>
              </div>
              <p className="font-semibold">{format(new Date(photo.date), "MMM d, yyyy")}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Body Weight</span>
              </div>
              <p className="font-semibold">{photo.weight ? `${photo.weight} kg` : "-- kg"}</p>
            </div>
          </div>

          {/* AI Body Composition Insights */}
          {photo.bodyFat && (
            <div className="p-4 rounded-xl bg-linear-to-br from-violet-500/10 to-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-5 h-5 text-purple-500" />
                <p className="font-semibold text-purple-700">AI Body Composition</p>
                <Badge className="bg-purple-500/20 text-purple-600 text-[10px]">AI Analysis</Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Body Fat Range</p>
                  <p className="text-lg font-bold text-purple-600">
                    {photo.bodyFat.min}–{photo.bodyFat.max}%
                  </p>
                  <ConfidenceBadge confidence={photo.bodyFat.confidence} size="xs" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Estimated Avg</p>
                  <p className="text-lg font-bold">{avgBodyFat}%</p>
                </div>
              </div>

              {/* Body Fat Visual */}
              <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-linear-to-r from-purple-500 to-violet-500 rounded-full"
                  style={{ width: `${Math.min(100, (avgBodyFat ? parseFloat(avgBodyFat) : 0) * 2)}%` }}
                />
              </div>
            </div>
          )}

          {/* Muscle Mass */}
          {photo.muscleMass && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Dumbbell className="w-5 h-5 text-emerald-500" />
                <p className="font-semibold text-emerald-700">Estimated Lean Mass</p>
              </div>
              <p className="text-2xl font-bold">{photo.muscleMass.toFixed(1)} kg</p>
              <p className="text-xs text-muted-foreground mt-1">Based on body weight minus estimated body fat</p>
            </div>
          )}

          {/* Change Zones - Where AI detected changes */}
          {photo.changeZones && photo.changeZones.length > 0 && (
            <div className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Detected Changes</p>
              </div>
              <div className="space-y-2">
                {photo.changeZones.map((zone, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-background">
                    <span className="text-sm capitalize">{zone.area.replace("_", " ")}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-medium",
                        zone.direction === "improved" && "text-emerald-500",
                        zone.direction === "regressed" && "text-rose-500",
                        zone.direction === "stable" && "text-muted-foreground"
                      )}>
                        {zone.direction}
                      </span>
                      <ConfidenceBadge confidence={zone.confidence} size="xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {photo.notes && (
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{photo.notes}</p>
            </div>
          )}

          {/* Provenance */}
          <div className="p-3 rounded-lg bg-muted/30">
            <ProvenanceTag
              source="model"
              timestamp={photo.date}
              modelName="Vision-Language Model"
              rationale="Body composition estimated from photo analysis"
            />
          </div>

          {/* Disclaimer */}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700/80">
                AI estimates are approximations. For accurate measurements, consult a healthcare professional or use DEXA scans.
              </p>
            </div>
          </div>

          {photo.isHighlight && (
            <div className="flex items-center justify-center gap-2 text-yellow-600">
              <Star className="w-4 h-4 fill-yellow-400" />
              <span className="text-sm font-medium">Highlighted Photo</span>
            </div>
          )}

          {/* Delete Photo Button */}
          {onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Photo
                </>
              )}
            </Button>
          )}
        </div>
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </SheetContent>
    </Sheet>
  );
}

// Extended profile data for editing (includes UserProfile fields)
interface EditableProfileData {
  // User fields
  name: string | null;
  email: string;
  // UserProfile fields
  heightCm: number | null;
  biologicalSex: string | null;
  birthDate: Date | null;
  activityLevel: string;
  fitnessLevel: string;
  primaryGoal: string | null;
  targetWeightKg: number | null;
  // Current weight (stored as measurement)
  currentWeight: number | null;
  weightUnit: string;
  customCalorieTarget: number | null;
  customProteinTarget: number | null;
  customCarbsTarget: number | null;
  customFatTarget: number | null;
}

// Edit Profile Form
function EditProfileForm({
  profile,
  userProfile,
  stats,
  settings,
  onSave,
  onCancel,
  onAvatarChange,
}: {
  profile: ProfileData["profile"];
  userProfile?: EditableProfileData;
  stats?: ProfileData["stats"];
  settings?: ProfileData["settings"];
  onSave: (updates: EditableProfileData) => Promise<void>;
  onCancel: () => void;
  onAvatarChange?: () => void;
}) {
  const [name, setName] = useState(profile.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl ?? null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [currentWeight, setCurrentWeight] = useState(stats?.currentWeight?.toString() ?? '');
  const [weightUnit, setWeightUnit] = useState(stats?.weightUnit ?? 'kg');
  const [heightCm, setHeightCm] = useState(userProfile?.heightCm?.toString() ?? '');
  const [biologicalSex, setBiologicalSex] = useState(userProfile?.biologicalSex ?? '');
  const [birthDate, setBirthDate] = useState(
    userProfile?.birthDate ? format(new Date(userProfile.birthDate), 'yyyy-MM-dd') : ''
  );
  const [activityLevel, setActivityLevel] = useState(userProfile?.activityLevel ?? 'moderate');
  const [primaryGoal, setPrimaryGoal] = useState(userProfile?.primaryGoal ?? 'maintenance');
  const [targetWeightKg, setTargetWeightKg] = useState(userProfile?.targetWeightKg?.toString() ?? '');
  const [customCalorieTarget, setCustomCalorieTarget] = useState(
    userProfile?.customCalorieTarget ? String(userProfile.customCalorieTarget) : ''
  );
  const [customProteinTarget, setCustomProteinTarget] = useState(
    settings?.customProteinTarget ? String(settings.customProteinTarget) : ''
  );
  const [customCarbsTarget, setCustomCarbsTarget] = useState(
    settings?.customCarbsTarget ? String(settings.customCarbsTarget) : ''
  );
  const [customFatTarget, setCustomFatTarget] = useState(
    settings?.customFatTarget ? String(settings.customFatTarget) : ''
  );
  const [macrosExpanded, setMacrosExpanded] = useState(
    !!(settings?.customProteinTarget || settings?.customCarbsTarget || settings?.customFatTarget)
  );
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentWeightNumber = currentWeight ? Number(currentWeight) : NaN;
  const isCurrentWeightInvalid = !Number.isFinite(currentWeightNumber) || currentWeightNumber <= 0;

  const goalTargetValidation = useMemo(() => {
    const current = currentWeight ? parseFloat(currentWeight) : null;
    const target = targetWeightKg ? parseFloat(targetWeightKg) : null;

    if (!current || !target || !Number.isFinite(current) || !Number.isFinite(target)) {
      return { invalid: false, message: null as string | null };
    }

    if (target < 30 || target > 300) {
      return {
        invalid: true,
        message: 'Target weight should stay between 30kg and 300kg for safe planning.',
      };
    }

    if (primaryGoal === 'fat_loss' && target >= current) {
      return {
        invalid: true,
        message: `For Fat Loss, target should be below your current weight (${current.toFixed(1)}kg). Consider Muscle Gain or Maintenance for this target.`,
      };
    }

    if (primaryGoal === 'muscle_gain' && target <= current) {
      return {
        invalid: true,
        message: `For Muscle Gain, target should be above your current weight (${current.toFixed(1)}kg). Consider Fat Loss or Maintenance for this target.`,
      };
    }

    if (primaryGoal === 'maintenance' && Math.abs(target - current) > 2) {
      return {
        invalid: true,
        message: 'Maintenance works best with target weight close to current (±2kg). Use Fat Loss or Muscle Gain for bigger changes.',
      };
    }

    if (primaryGoal === 'recomposition' && Math.abs(target - current) > 5) {
      return {
        invalid: true,
        message: 'Recomposition works best within ±5kg from current weight. Use Fat Loss/Muscle Gain for larger changes.',
      };
    }

    return { invalid: false, message: null as string | null };
  }, [currentWeight, targetWeightKg, primaryGoal]);

  // Handle avatar file selection
  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setAvatarPreview(base64);

      // Upload to server
      setIsUploadingAvatar(true);
      try {
        const response = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });

        if (response.ok) {
          const result = await response.json();
          setAvatarUrl(result.user.avatarUrl);
          toast.success('Avatar updated!');
          // Notify parent to refresh user data in AppContext
          onAvatarChange?.();
        } else {
          let errorMessage = 'Failed to upload avatar';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            // Check if text response exists
            const textError = await response.text().catch(() => '');
            if (textError) errorMessage = textError;
          }
          toast.error(errorMessage);
          setAvatarPreview(avatarUrl); // Revert to previous
        }
      } catch (error) {
        console.error('Avatar upload error:', error);
        toast.error('Failed to upload avatar');
        setAvatarPreview(avatarUrl); // Revert to previous
      } finally {
        setIsUploadingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (isCurrentWeightInvalid) {
      toast.error('Current weight is required', {
        description: 'Please enter your current weight to calculate accurate calorie targets.',
      });
      return;
    }

    if (goalTargetValidation.invalid) {
      toast.error('Goal and target weight mismatch', {
        description: goalTargetValidation.message || 'Please adjust goal or target weight.',
      });
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name,
        email: profile.email,
        heightCm: heightCm ? parseFloat(heightCm) : null,
        biologicalSex: biologicalSex || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        activityLevel,
        fitnessLevel: userProfile?.fitnessLevel ?? 'beginner',
        primaryGoal,
        targetWeightKg: targetWeightKg ? parseFloat(targetWeightKg) : null,
        currentWeight: currentWeightNumber,
        weightUnit,
        customCalorieTarget: customCalorieTarget ? parseFloat(customCalorieTarget) : null,
        customProteinTarget: customProteinTarget ? parseFloat(customProteinTarget) : null,
        customCarbsTarget: customCarbsTarget ? parseFloat(customCarbsTarget) : null,
        customFatTarget: customFatTarget ? parseFloat(customFatTarget) : null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="px-6 space-y-4 pb-6">
      {/* Avatar */}
      <div className="flex justify-center">
        <div className="relative">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarSelect}
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            aria-label="Upload avatar"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            className="relative group"
            aria-label="Change avatar"
          >
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt={name || 'User'}
                className="w-24 h-24 rounded-full object-cover ring-2 ring-emerald-500 ring-offset-2 ring-offset-background"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-3xl font-bold ring-2 ring-emerald-500 ring-offset-2 ring-offset-background">
                {name.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            {/* Upload overlay */}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {isUploadingAvatar ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </div>
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2">Tap to change photo</p>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Display Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="h-12"
        />
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          value={profile.email}
          disabled
          className="h-12 bg-muted"
        />
        <p className="text-xs text-muted-foreground">Email cannot be changed</p>
      </div>

      {/* Current Weight */}
      <div className="space-y-2">
        <Label htmlFor="currentWeight">Current Weight *</Label>
        <div className="flex gap-2">
          <Input
            id="currentWeight"
            type="number"
            step="0.1"
            min="1"
            value={currentWeight}
            onChange={(e) => setCurrentWeight(e.target.value)}
            placeholder="e.g., 70"
            required
            className={cn("h-12 flex-1", isCurrentWeightInvalid && "border-red-500")}
          />
          <Select value={weightUnit} onValueChange={setWeightUnit}>
            <SelectTrigger className="h-12 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kg">kg</SelectItem>
              <SelectItem value="lbs">lbs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isCurrentWeightInvalid && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Current weight is required.
          </p>
        )}
      </div>

      {/* Height */}
      <div className="space-y-2">
        <Label htmlFor="height">Height (cm)</Label>
        <Input
          id="height"
          type="number"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          placeholder="e.g., 175"
          className="h-12"
        />
      </div>

      {/* Biological Sex */}
      <div className="space-y-2">
        <Label htmlFor="biologicalSex">Biological Sex</Label>
        <Select value={biologicalSex} onValueChange={setBiologicalSex}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Birth Date */}
      <div className="space-y-2">
        <Label htmlFor="birthDate">Birth Date</Label>
        <Input
          id="birthDate"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="h-12"
        />
      </div>

      {/* Activity Level */}
      <div className="space-y-2">
        <Label htmlFor="activityLevel">Activity Level</Label>
        <Select value={activityLevel} onValueChange={setActivityLevel}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sedentary">Sedentary (little or no exercise)</SelectItem>
            <SelectItem value="light">Light (1-3 days/week)</SelectItem>
            <SelectItem value="moderate">Moderate (3-5 days/week)</SelectItem>
            <SelectItem value="active">Active (6-7 days/week)</SelectItem>
            <SelectItem value="very_active">Very Active (intense daily)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Primary Goal */}
      <div className="space-y-2">
        <Label htmlFor="primaryGoal">Primary Goal</Label>
        <Select value={primaryGoal} onValueChange={setPrimaryGoal}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fat_loss">Fat Loss</SelectItem>
            <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
            <SelectItem value="recomposition">Body Recomposition</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Target Weight */}
      <div className="space-y-2">
        <Label htmlFor="targetWeight">Target Weight (kg)</Label>
        <Input
          id="targetWeight"
          type="number"
          step="0.1"
          value={targetWeightKg}
          onChange={(e) => setTargetWeightKg(e.target.value)}
          placeholder="e.g., 70"
          className={cn("h-12", goalTargetValidation.invalid && "border-red-500")}
        />
        {goalTargetValidation.message && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {goalTargetValidation.message}
          </p>
        )}
      </div>

      {/* ═══ CUSTOM CALORIES & MACROS ═══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="customCalories" className="text-sm font-semibold">
            Daily Calories
          </Label>
          <Badge variant="outline" className="text-[10px] font-normal px-2 py-0">
            {customCalorieTarget ? 'Custom' : 'Auto-calc'}
          </Badge>
        </div>
        <Input
          id="customCalories"
          type="number"
          value={customCalorieTarget}
          onChange={(e) => setCustomCalorieTarget(e.target.value)}
          placeholder="Leave empty for smart auto-calculation"
          className="h-12"
        />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Leave empty for AI-calculated calories based on your profile, activity & goal.
        </p>
      </div>

      {/* ═══ MACRO TARGETS — Expandable Premium Section ═══ */}
      <div className="rounded-2xl border border-border/60 bg-muted/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setMacrosExpanded(!macrosExpanded)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <span className="text-sm font-semibold">Custom Macro Targets</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Override auto-calculated protein, carbs & fat
              </p>
            </div>
          </div>
          <motion.div
            animate={{ rotate: macrosExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </button>

        <AnimatePresence>
          {macrosExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                <Separator />
                
                {/* Info banner */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Leave any field empty for doctor-level auto-calculation based on your body metrics, activity level & goal. Our algorithm uses the Mifflin-St Jeor equation with goal-specific macronutrient partitioning.
                  </p>
                </div>

                {/* Protein */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="customProtein" className="text-xs font-medium flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                      Protein (g)
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {primaryGoal === 'fat_loss' ? 'High protein preserves muscle' : 
                       primaryGoal === 'muscle_gain' ? 'Critical for muscle synthesis' :
                       primaryGoal === 'recomposition' ? 'High for simultaneous goals' :
                       'Supports lean body mass'}
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="customProtein"
                      type="number"
                      value={customProteinTarget}
                      onChange={(e) => setCustomProteinTarget(e.target.value)}
                      placeholder="Auto-calc (e.g. 150g)"
                      className="h-11 pr-16 text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">g/day</span>
                  </div>
                </div>

                {/* Carbs */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="customCarbs" className="text-xs font-medium flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      Carbs (g)
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {primaryGoal === 'fat_loss' ? 'Lower carbs accelerate fat loss' :
                       primaryGoal === 'muscle_gain' ? 'Fuels intense training sessions' :
                       'Primary energy source'}
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="customCarbs"
                      type="number"
                      value={customCarbsTarget}
                      onChange={(e) => setCustomCarbsTarget(e.target.value)}
                      placeholder="Auto-calc (e.g. 250g)"
                      className="h-11 pr-16 text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">g/day</span>
                  </div>
                </div>

                {/* Fat */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="customFat" className="text-xs font-medium flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      Fat (g)
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {primaryGoal === 'fat_loss' ? 'Essential for hormone health' :
                       primaryGoal === 'muscle_gain' ? 'Supports testosterone & recovery' :
                       'Essential fatty acids & vitamins'}
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="customFat"
                      type="number"
                      value={customFatTarget}
                      onChange={(e) => setCustomFatTarget(e.target.value)}
                      placeholder="Auto-calc (e.g. 65g)"
                      className="h-11 pr-16 text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">g/day</span>
                  </div>
                </div>

                {/* Macro ratio preview when calories set */}
                {(customCalorieTarget || customProteinTarget || customCarbsTarget || customFatTarget) && (
                  <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Estimated Macro Split</p>
                    <div className="flex gap-1.5 h-2 rounded-full overflow-hidden">
                      {(() => {
                        const cals = Number(customCalorieTarget) || 2000;
                        const p = Number(customProteinTarget) || 150;
                        const c = Number(customCarbsTarget) || 250;
                        const f = Number(customFatTarget) || 65;
                        const pCal = p * 4;
                        const cCal = c * 4;
                        const fCal = f * 9;
                        const total = pCal + cCal + fCal || 1;
                        return (
                          <>
                            <div className="bg-rose-500 rounded-l-full" style={{ width: `${(pCal/total)*100}%` }} />
                            <div className="bg-blue-500" style={{ width: `${(cCal/total)*100}%` }} />
                            <div className="bg-amber-500 rounded-r-full" style={{ width: `${(fCal/total)*100}%` }} />
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-rose-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> P
                      </span>
                      <span className="text-blue-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> C
                      </span>
                      <span className="text-amber-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> F
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1 h-12"
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600"
          disabled={isSaving || !name.trim() || isCurrentWeightInvalid || goalTargetValidation.invalid}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Main Profile Page Component
// ============================================

// Training Stats Section
function TrainingStatsSection({
  snapshot,
  consistency,
  t,
}: {
  snapshot: ProfileData["snapshot"];
  consistency: number;
  t: (key: string) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-emerald-500" />
            {t('profile.trainingStats')}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-linear-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <Dumbbell className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{snapshot.totalWorkouts}</p>
            <p className="text-[10px] text-muted-foreground">{t('profile.workouts')}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-linear-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
            <Activity className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{snapshot.daysTracked}</p>
            <p className="text-[10px] text-muted-foreground">{t('profile.daysTracked')}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-linear-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <Flame className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{snapshot.streak}</p>
            <p className="text-[10px] text-muted-foreground">{t('home.streak.days')} {t('home.streak.label')}</p>
          </div>
        </div>
        
        <div className="mt-3 p-3 rounded-xl bg-muted/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('profile.consistencyScore')}</span>
            <span className="font-medium">{consistency}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${consistency}%` }}
              transition={{ duration: 0.5 }}
              className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            {consistency >= 80 ? t('profile.consistencyExcellent') : 
             consistency >= 60 ? t('profile.consistencyGood') :
             consistency >= 40 ? t('profile.consistencyBuilding') :
             t('profile.consistencyStart')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfilePage({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { signOut } = useSupabaseAuth();
  const { t } = useLocale();
  const { data, isLoading, error, refetch } = useProfileData();
  
  // Get AppContext for cross-component data sync
  // refreshAll is CRITICAL - it refreshes ALL data across ALL pages
  const { 
    refreshAll,
    refetchAnalytics, 
    refetchUser, 
    refetchMeasurements, 
    refetchTargets,
    refetchNutrition,
    refetchHydration,
    refetchWorkouts,
  } = useApp();
  
  // Sheet/Modal states
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);

  // Selected items
  const [selectedPhoto, setSelectedPhoto] = useState<ProfileData["progressPhotos"][0] | null>(null);

  // Handlers - must be defined before early returns
  const handlePhotoTap = useCallback((photo: ProfileData["progressPhotos"][0]) => {
    setSelectedPhoto(photo);
    setPhotoSheetOpen(true);
  }, []);

  const handleUploadPhoto = useCallback(() => {
    setUploadSheetOpen(true);
  }, []);

  const handleUploadComplete = useCallback(() => {
    // Refresh to show new photo
    refetch();
  }, [refetch]);

  const handleDeletePhoto = useCallback(async (photoId: string) => {
    try {
      const response = await apiFetch(`/api/progress-photos?id=${photoId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        toast.success('Photo deleted');
        refetch();
      } else {
        throw new Error('Failed to delete photo');
      }
    } catch (error) {
      console.error('Photo delete error:', error);
      toast.error('Delete failed', {
        description: 'Could not delete photo. Please try again.',
      });
    }
  }, [refetch]);

  const handleMetricTap = useCallback((metricId: string) => {
    console.log("Metric tapped:", metricId);
  }, []);

  const handleMilestoneTap = useCallback((milestone: ProfileData["milestones"][0]) => {
    console.log("Milestone tapped:", milestone.title);
  }, []);

  // Track experiment being started
  const [startingExperimentId, setStartingExperimentId] = useState<string | null>(null);
  const [completingExperimentId, setCompletingExperimentId] = useState<string | null>(null);
  const [savingGoal, setSavingGoal] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingExperiments, setIsGeneratingExperiments] = useState(false);
  const [hasAutoGenerated, setHasAutoGenerated] = useState(false);

  // Auto-generate experiments on first load if none exist
  useEffect(() => {
    if (!isLoading && data && !hasAutoGenerated) {
      const hasExperiments = data.experiments && data.experiments.length > 0;
      
      // Only generate if no experiments at all
      if (!hasExperiments && !isGeneratingExperiments) {
        setHasAutoGenerated(true);
        // Auto-generate 4 experiments silently (don't refetch immediately)
        handleGenerateExperiments(true, true);
      }
    }
  }, [isLoading, data, hasAutoGenerated, isGeneratingExperiments]);

  // Generate AI-powered experiments
  const handleGenerateExperiments = useCallback(async (silent = false, skipRefetch = false) => {
    setIsGeneratingExperiments(true);
    try {
      const response = await fetch('/api/experiments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 4 }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate experiments');
      }

      if (result.experiments && result.experiments.length > 0) {
        if (!silent) {
          toast.success(`${result.experiments.length} experiments generated!`, {
            description: 'Based on your goals and habits.',
          });
        }
        // Only refetch if not on initial load
        if (!skipRefetch) {
          refetch();
        }
      } else if (!silent) {
        toast.info('No new experiments', {
          description: 'You may already have similar experiments. Try completing one first!',
        });
      }
    } catch (error) {
      console.error('Error generating experiments:', error);
      if (!silent) {
        toast.error('Failed to generate experiments', {
          description: 'Please try again.',
        });
      }
    } finally {
      setIsGeneratingExperiments(false);
    }
  }, [refetch]);

  // Complete an experiment and generate new ones
  const handleCompleteExperiment = useCallback(async (experiment: ProfileData["experiments"][0]) => {
    // Prevent double-clicks
    if (completingExperimentId) return;
    
    setCompletingExperimentId(experiment.id);
    
    try {
      const response = await fetch('/api/experiments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experimentId: experiment.id,
          status: 'completed',
          completedAt: new Date().toISOString(),
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        toast.error(result.error || 'Failed to complete experiment');
        return;
      }
      
      toast.success('Experiment completed! 🎉', {
        description: 'Great job! Generating new personalized experiments...',
      });
      
      // Refetch profile to update experiment list
      refetch();
      
      // Generate new experiments after completing one
      setTimeout(() => {
        handleGenerateExperiments(true);
      }, 500);
    } catch (error) {
      console.error('Error completing experiment:', error);
      toast.error('Failed to complete experiment. Please try again.');
    } finally {
      setCompletingExperimentId(null);
    }
  }, [completingExperimentId, refetch, handleGenerateExperiments]);

  const handleStartExperiment = useCallback(async (experiment: ProfileData["experiments"][0]) => {
    // Prevent double-clicks
    if (startingExperimentId) return;
    
    setStartingExperimentId(experiment.id);
    
    try {
      // Use PATCH to update the existing experiment to active status
      const response = await fetch('/api/experiments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experimentId: experiment.id,
          status: 'active',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + (experiment.duration || 14) * 86400000).toISOString(),
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        if (result.existingExperiment) {
          toast.error('Active experiment exists', {
            description: `You already have "${result.existingExperiment.title}" in progress.`,
          });
        } else {
          toast.error(result.error || 'Failed to start experiment');
        }
        return;
      }
      
      toast.success('Experiment started!', {
        description: `You have ${experiment.duration || 14} days to complete "${experiment.title}". Good luck!`,
      });
      
      // Refetch profile to update experiment list
      refetch();
    } catch (error) {
      console.error('Error starting experiment:', error);
      toast.error('Failed to start experiment. Please try again.');
    } finally {
      setStartingExperimentId(null);
    }
  }, [startingExperimentId, refetch]);

  // Handle goal change
  const handleGoalChange = useCallback(async (goalType: string) => {
    setSavingGoal(goalType);
    
    try {
      // Map primaryGoal: 'fat_loss' -> 'weight_loss' for API compatibility
      // Schema accepts: ['maintenance', 'weight_loss', 'muscle_gain', 'recomposition']
      let mappedGoal = goalType;
      if (goalType === 'fat_loss') {
        mappedGoal = 'weight_loss';
      }
      
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: mappedGoal,
        }),
      });
      
      if (response.ok) {
        toast.success('Goal updated!', {
          description: `Your primary goal is now ${getGoalLabel(goalType, t)}.`,
        });
        
        // CRITICAL: Call refreshAll() to update ALL data across ALL pages
        // Goal affects: targets, nutrition, hydration, Body Intelligence score
        await refreshAll();
        await refetch();
        
        // Broadcast goal change to other tabs for cross-tab sync
        if (typeof window !== 'undefined') {
          const channel = new BroadcastChannel('progress-companion-sync');
          channel.postMessage({ 
            type: 'GOAL_CHANGED', 
            payload: { goalType } 
          });
          channel.close();
        }
        
        setGoalSheetOpen(false);
      } else {
        let errorMessage = 'Failed to update goal';
        try {
          const errorData = await response.json();
          errorMessage = errorData?.details || errorData?.error || errorMessage;
        } catch {
          // keep fallback message
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Error updating goal:', error);
      toast.error('Failed to update goal. Please try again.');
    } finally {
      setSavingGoal(null);
    }
  }, [refetch, refreshAll]);

  // Handle profile save
  const handleSaveProfile = useCallback(async (updates: EditableProfileData) => {
    try {
      // Convert birthDate from Date object to YYYY-MM-DD string format for API validation
      // The schema expects: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      let birthDateStr: string | undefined = undefined;
      if (updates.birthDate instanceof Date) {
        birthDateStr = format(updates.birthDate, 'yyyy-MM-dd');
      } else if (typeof updates.birthDate === 'string') {
        birthDateStr = updates.birthDate;
      }
      
      // Map activityLevel: 'very_active' -> 'athlete' for API compatibility
      // Schema accepts: ['sedentary', 'light', 'moderate', 'active', 'athlete']
      let mappedActivityLevel = updates.activityLevel;
      if (updates.activityLevel === 'very_active') {
        mappedActivityLevel = 'athlete';
      }
      
      // Map primaryGoal: 'fat_loss' -> 'weight_loss' for API compatibility
      // Schema accepts: ['maintenance', 'weight_loss', 'muscle_gain', 'recomposition']
      let mappedPrimaryGoal = updates.primaryGoal;
      if (updates.primaryGoal === 'fat_loss') {
        mappedPrimaryGoal = 'weight_loss';
      }
      
      // Update both User and UserProfile tables
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // User fields
          name: updates.name,
          // UserProfile fields
          heightCm: updates.heightCm,
          biologicalSex: updates.biologicalSex,
          birthDate: birthDateStr,
          activityLevel: mappedActivityLevel,
          fitnessLevel: updates.fitnessLevel,
          primaryGoal: mappedPrimaryGoal,
          targetWeightKg: updates.targetWeightKg,
          customCalorieTarget: updates.customCalorieTarget,
          customProteinTarget: updates.customProteinTarget,
          customCarbsTarget: updates.customCarbsTarget,
          customFatTarget: updates.customFatTarget,
          currentWeight: updates.currentWeight,
          weightUnit: updates.weightUnit,
        }),
      });
      
      if (response.ok) {
        toast.success('Profile updated!', {
          description: 'Your profile has been saved successfully.',
        });
        
        // CRITICAL: Call refreshAll() to update ALL data across ALL pages
        // This ensures height, weight, goal, birthDate, activityLevel propagate to:
        // - Home (Body Intelligence, targets, nutrition)
        // - Foods (macro targets)
        // - Analytics (profile completion, calculations)
        // - Workouts (calorie calculations)
        await refreshAll();
        
        // Also refetch profile-specific data
        await refetch();
        
        setEditProfileOpen(false);
      } else {
        const errorData = await response.json();
        toast.error('Failed to update profile', {
          description: errorData.error || 'Please try again.',
        });
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Failed to update profile. Please try again.');
    }
  }, [refetch, refreshAll]);

  // Handle PDF export
  const handleExportPDF = useCallback(async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    try {
      const response = await fetch('/api/profile/export-pdf');
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      // Get the PDF blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coach-snapshot-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('PDF exported successfully!');
      setExportSheetOpen(false);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  // Handle JSON export
  const handleExportJSON = useCallback(async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    try {
      const response = await fetch('/api/profile');
      
      if (!response.ok) {
        throw new Error('Failed to fetch profile data');
      }
      
      const profileData = await response.json();
      
      // Add export metadata
      const exportData = {
        exportedAt: new Date().toISOString(),
        exportVersion: '1.0',
        data: profileData,
      };
      
      // Create JSON blob
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `progress-companion-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('JSON exported successfully!');
      setExportSheetOpen(false);
    } catch (error) {
      console.error('Failed to export JSON:', error);
      toast.error('Failed to export JSON. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  // Handle CSV export
  const handleExportCSV = useCallback(async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    try {
      const response = await fetch('/api/profile');
      
      if (!response.ok) {
        throw new Error('Failed to fetch profile data');
      }
      
      const profileData = await response.json();
      
      // Flatten data for CSV
      const csvRows: string[] = [];
      
      // Header
      csvRows.push('Category,Field,Value,Unit,Date');
      
      // User info
      csvRows.push(`User,Name,${profileData.user?.name || 'N/A'},,`);
      csvRows.push(`User,Email,${profileData.user?.email || 'N/A'},,`);
      csvRows.push(`User,Member Since,${profileData.user?.createdAt ? new Date(profileData.user.createdAt).toLocaleDateString() : 'N/A'},,`);
      
      // Stats
      if (profileData.stats) {
        csvRows.push(`Stats,Total Meals,${profileData.stats.totalMeals || 0},,`);
        csvRows.push(`Stats,Total Workouts,${profileData.stats.totalWorkouts || 0},,`);
        csvRows.push(`Stats,Current Streak,${profileData.stats.currentStreak || 0},days,`);
        csvRows.push(`Stats,Progress Photos,${profileData.stats.totalProgressPhotos || 0},,`);
      }
      
      // Latest weight
      if (profileData.latestWeight) {
        csvRows.push(`Measurement,Weight,${profileData.latestWeight.value},${profileData.latestWeight.unit},${new Date(profileData.latestWeight.capturedAt).toLocaleDateString()}`);
      }
      
      // Profile details
      if (profileData.profile) {
        if (profileData.profile.heightCm) csvRows.push(`Profile,Height,${profileData.profile.heightCm},cm,`);
        if (profileData.profile.activityLevel) csvRows.push(`Profile,Activity Level,${profileData.profile.activityLevel},,`);
        if (profileData.profile.primaryGoal) csvRows.push(`Profile,Primary Goal,${profileData.profile.primaryGoal},,`);
        if (profileData.profile.targetWeightKg) csvRows.push(`Profile,Target Weight,${profileData.profile.targetWeightKg},kg,`);
      }
      
      // Goals
      if (profileData.goals && profileData.goals.length > 0) {
        profileData.goals.forEach((goal: { goalType: string; currentValue: number | null; targetValue: number; unit: string }) => {
          csvRows.push(`Goal,${goal.goalType},${goal.currentValue || 0}/${goal.targetValue},${goal.unit},`);
        });
      }
      
      // Badges
      if (profileData.badges && profileData.badges.length > 0) {
        profileData.badges.forEach((badge: { badgeName: string; earnedAt: string | null }) => {
          csvRows.push(`Badge,${badge.badgeName},${badge.earnedAt ? 'Earned' : 'Locked'},,${badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString() : ''}`);
        });
      }
      
      // Create CSV blob
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `progress-companion-data-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('CSV exported successfully!');
      setExportSheetOpen(false);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      toast.error('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  // Handle loading and error states
  if (isLoading) {
    return (
      <div data-testid="profile-loading" className="space-y-4 pb-24">
        <div className="animate-pulse">
          <div className="h-48 bg-muted rounded-3xl" />
          <div className="h-16 bg-muted rounded-xl mt-4" />
          <div className="h-32 bg-muted rounded-xl mt-4" />
          <div className="h-48 bg-muted rounded-xl mt-4" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="profile-error" className="flex flex-col items-center justify-center py-20 px-4">
        <p className="text-muted-foreground mb-4">Failed to load profile: {error || 'No data'}</p>
        <Button onClick={refetch}>Retry</Button>
      </div>
    );
  }

  return (
    <main id="main-content" role="main" aria-label="Profile main content" className="space-y-4 pb-24 gymbro-page-subtle">
      {/* Profile Header */}
      <ProfileHeader
        profile={data.profile ?? DEFAULT_PROFILE}
        stats={data.stats ?? DEFAULT_STATS}
        onEditProfile={() => setEditProfileOpen(true)}
        onOpenSettings={onOpenSettings}
        t={t}
      />

      {/* Evolution Metrics Strip - APPROVED */}
      <EvolutionMetricsStrip
        stats={data.stats ?? DEFAULT_STATS}
        bodyComposition={data.bodyComposition ?? null}
        snapshot={data.snapshot ?? DEFAULT_SNAPSHOT}
        onMetricTap={handleMetricTap}
        t={t}
      />

      {/* AI Evolution Summary */}
      <AIEvolutionSummary stats={data.stats ?? DEFAULT_STATS} bodyComposition={data.bodyComposition ?? null} />

      {/* Goal Architecture */}
      <GoalArchitectureCard
        goal={data.goal ?? DEFAULT_GOAL}
        onAdjust={() => setGoalSheetOpen(true)}
        t={t}
      />

      {/* Transformation Archive - Photo Gallery */}
      <TransformationArchive
        photos={data.progressPhotos ?? []}
        onPhotoTap={handlePhotoTap}
        onUploadPhoto={handleUploadPhoto}
      />

      {/* AI Body Composition */}
      <AIBodyComposition
        result={data.bodyComposition ?? null}
        onUploadPhoto={handleUploadPhoto}
      />

      {/* Micro-Experiments */}
      <MicroExperimentsCarousel
        experiments={data.experiments ?? []}
        onStartExperiment={handleStartExperiment}
        onCompleteExperiment={handleCompleteExperiment}
        startingExperimentId={startingExperimentId}
        completingExperimentId={completingExperimentId}
        onGenerateExperiments={handleGenerateExperiments}
        isGenerating={isGeneratingExperiments}
      />

      {/* Training Stats */}
      <TrainingStatsSection snapshot={data.snapshot ?? DEFAULT_SNAPSHOT} consistency={data.stats?.consistency ?? 0} t={t} />

      {/* Milestones */}
      <MilestonesSection
        milestones={data.milestones ?? []}
        onMilestoneTap={handleMilestoneTap}
      />

      {/* Identity Snapshot */}
      <IdentitySnapshot
        snapshot={data.snapshot ?? DEFAULT_SNAPSHOT}
        onExport={() => setExportSheetOpen(true)}
        t={t}
      />

      {/* Photo Detail Sheet - AI Insights */}
      <PhotoDetailSheet
        open={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        photo={selectedPhoto}
        onDelete={handleDeletePhoto}
      />

      {/* Progress Photo Upload Sheet */}
      <ProgressPhotoUploadSheet
        open={uploadSheetOpen}
        onClose={() => setUploadSheetOpen(false)}
        onUploadComplete={handleUploadComplete}
        heightCm={data?.userProfile?.heightCm}
      />

      {/* Goal Adjustment Sheet */}
      <Sheet open={goalSheetOpen} onOpenChange={setGoalSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0">
          <div className="h-1 w-12 bg-muted rounded-full mx-auto mt-2 mb-4" />
          <SheetHeader className="px-6 pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-500" />
              Adjust Goal
            </SheetTitle>
            <SheetDescription>
              Update your fitness goals and targets
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 space-y-3">
            {["fat_loss", "muscle_gain", "recomposition", "maintenance"].map((goal) => {
              const isSaving = savingGoal === goal;
              const isCurrentGoal = data?.goal?.primaryGoal === goal;
              
              return (
                <button
                  key={goal}
                  onClick={() => handleGoalChange(goal)}
                  disabled={isSaving || !!savingGoal}
                  className={cn(
                    "w-full p-4 rounded-xl text-left transition-all",
                    isCurrentGoal 
                      ? "bg-emerald-500/10 border-2 border-emerald-500/30" 
                      : "bg-muted/50 hover:bg-muted",
                    isSaving && "opacity-70"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{getGoalLabel(goal, t)}</p>
                      {isCurrentGoal && (
                        <Badge className="bg-emerald-500/20 text-emerald-600 text-[10px]">
                          Current
                        </Badge>
                      )}
                    </div>
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </SheetContent>
      </Sheet>

      {/* Export Sheet */}
      <Sheet open={exportSheetOpen} onOpenChange={setExportSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0">
          <div className="h-1 w-12 bg-muted rounded-full mx-auto mt-2 mb-4" />
          <SheetHeader className="px-6 pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-emerald-500" />
              Export Data
            </SheetTitle>
            <SheetDescription>
              Download all your fitness data with provenance
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 space-y-3">
            <Button 
              className="w-full bg-emerald-500 hover:bg-emerald-600" 
              onClick={handleExportPDF}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Export as PDF (Coach Snapshot)
                </>
              )}
            </Button>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={handleExportJSON}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileJson className="w-4 h-4 mr-2" />
              )}
              Export as JSON
            </Button>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={handleExportCSV}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2" />
              )}
              Export as CSV
            </Button>
          </div>
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </SheetContent>
      </Sheet>

      {/* Edit Profile Sheet */}
      <Sheet open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0 max-h-[90vh] overflow-y-auto">
          <div className="h-1 w-12 bg-muted rounded-full mx-auto mt-2 mb-4" />
          <SheetHeader className="px-6 pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-emerald-500" />
              {t('profile.editProfile')}
            </SheetTitle>
            <SheetDescription>
              Update your profile information
            </SheetDescription>
          </SheetHeader>
          <EditProfileForm 
            profile={data.profile ?? DEFAULT_PROFILE} 
            userProfile={data.userProfile}
            stats={data.stats}
            settings={data.settings}
            onSave={handleSaveProfile}
            onCancel={() => setEditProfileOpen(false)}
            onAvatarChange={() => {
              refetchUser();
              refetch();
            }}
          />
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </SheetContent>
      </Sheet>
    </main>
  );
}
