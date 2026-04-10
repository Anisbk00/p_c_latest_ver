"use client";

/**
 * Profile Completion Warning Component
 * Displays warnings when user profile data is missing
 * Helps users understand what data is needed for accurate calculations
 * Includes calculation confidence indicator for BMR/TDEE accuracy
 * Updated: 2025-01-20
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  X,
  ChevronRight,
  User,
  Ruler,
  Calendar,
  Heart,
  Activity,
  Target,
  Scale,
  Info,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/app-context";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface ProfileCompletionWarningProps {
  className?: string;
  showOnComplete?: boolean; // Show even if complete (for progress display)
  compact?: boolean; // Compact mode for smaller displays
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function checkIfDismissed(warnings: string[]): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const dismissed = localStorage.getItem("profile-warning-dismissed");
    if (dismissed) {
      const dismissedData = JSON.parse(dismissed);
      // Only dismiss if the same warnings exist
      if (JSON.stringify(dismissedData.warnings) === JSON.stringify(warnings)) {
        return true;
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// PROFILE COMPLETION WARNING COMPONENT
// ═══════════════════════════════════════════════════════════════

export function ProfileCompletionWarning({
  className,
  showOnComplete = false,
  compact = false,
}: ProfileCompletionWarningProps) {
  const { analyticsData, analyticsLoading } = useApp();
  const [forceDismissed, setForceDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Get profile completion data
  const profileCompletion = analyticsData?.profileCompletion;
  const hasWarnings = profileCompletion && !profileCompletion.isComplete;
  const calculationConfidence = profileCompletion?.calculationConfidence ?? 100;

  // Check if dismissed using memo (derived state, not effect)
  const isInitiallyDismissed = useMemo(() => {
    if (!profileCompletion?.warnings) return false;
    return checkIfDismissed(profileCompletion.warnings);
  }, [profileCompletion?.warnings]);

  // Combine initial and force dismissal
  const isDismissed = isInitiallyDismissed || forceDismissed;

  // Check if we should show the warning
  const shouldShow = (hasWarnings || showOnComplete) && !isDismissed && !analyticsLoading;

  // Get confidence level description
  const getConfidenceLevel = (confidence: number): { label: string; color: string; description: string } => {
    if (confidence >= 90) return { 
      label: 'High', 
      color: 'text-emerald-600 dark:text-emerald-400',
      description: 'Calculations are highly accurate' 
    };
    if (confidence >= 70) return { 
      label: 'Good', 
      color: 'text-amber-600 dark:text-amber-400',
      description: 'Some estimation used' 
    };
    if (confidence >= 50) return { 
      label: 'Fair', 
      color: 'text-orange-600 dark:text-orange-400',
      description: 'Several values estimated' 
    };
    return { 
      label: 'Low', 
      color: 'text-red-600 dark:text-red-400',
      description: 'Complete profile for accuracy' 
    };
  };

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setForceDismissed(true);
    if (profileCompletion) {
      localStorage.setItem(
        "profile-warning-dismissed",
        JSON.stringify({
          warnings: profileCompletion.warnings,
          dismissedAt: new Date().toISOString(),
        })
      );
    }
  }, [profileCompletion]);

  // Don't render if not needed
  if (!shouldShow) return null;

  // Get icon for missing field
  const getFieldIcon = (field: string) => {
    switch (field) {
      case "height":
        return <Ruler className="w-3.5 h-3.5" />;
      case "birthDate":
        return <Calendar className="w-3.5 h-3.5" />;
      case "biologicalSex":
        return <Heart className="w-3.5 h-3.5" />;
      case "activityLevel":
        return <Activity className="w-3.5 h-3.5" />;
      case "primaryGoal":
        return <Target className="w-3.5 h-3.5" />;
      case "targetWeight":
        return <Scale className="w-3.5 h-3.5" />;
      case "hasWeightData":
        return <Scale className="w-3.5 h-3.5" />;
      default:
        return <User className="w-3.5 h-3.5" />;
    }
  };

  // Get label for missing field
  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      height: "Height",
      birthDate: "Birth Date",
      biologicalSex: "Biological Sex",
      activityLevel: "Activity Level",
      primaryGoal: "Primary Goal",
      targetWeight: "Target Weight",
      hasWeightData: "Weight Data",
    };
    return labels[field] || field;
  };

  // Get list of missing fields
  const missingFieldsList = profileCompletion?.missingFields
    ? Object.entries(profileCompletion.missingFields)
        .filter(([_, isMissing]) => isMissing)
        .map(([field]) => field)
    : [];

  // Get confidence info
  const confidenceInfo = getConfidenceLevel(calculationConfidence);

  // Compact mode
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20",
          className
        )}
        role="alert"
      >
        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-xs text-amber-600 dark:text-amber-400 flex-1">
          Profile incomplete ({profileCompletion?.score}%)
        </span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-amber-600 dark:text-amber-400 underline"
        >
          Details
        </button>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className={cn("px-5 py-2", className)}
        role="alert"
        aria-live="polite"
      >
        <div className="relative overflow-hidden rounded-2xl">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-500/10" />
          <div className="absolute inset-0 border border-amber-500/20 rounded-2xl" />

          <div className="relative p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Complete Your Profile
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profileCompletion?.score}% complete
                  </p>
                </div>
              </div>

              <button
                onClick={handleDismiss}
                className="w-6 h-6 rounded-full hover:bg-amber-500/10 flex items-center justify-center transition-colors"
                aria-label="Dismiss warning"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${profileCompletion?.score || 0}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                />
              </div>
            </div>

            {/* Calculation Confidence Indicator */}
            <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-background/50">
              <Gauge className={cn("w-4 h-4", confidenceInfo.color)} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Calculation Accuracy</span>
                  <span className={cn("text-xs font-semibold", confidenceInfo.color)}>
                    {calculationConfidence}% ({confidenceInfo.label})
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {confidenceInfo.description}
                </p>
              </div>
              <div className="relative w-8 h-8">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted/20"
                  />
                  <motion.circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={87.96}
                    initial={{ strokeDashoffset: 87.96 }}
                    animate={{ strokeDashoffset: 87.96 - (87.96 * calculationConfidence) / 100 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={cn(
                      calculationConfidence >= 90 ? "text-emerald-500" :
                      calculationConfidence >= 70 ? "text-amber-500" :
                      calculationConfidence >= 50 ? "text-orange-500" : "text-red-500"
                    )}
                  />
                </svg>
              </div>
            </div>

            {/* Warning Summary */}
            <p className="text-xs text-muted-foreground mb-3">
              {profileCompletion?.warnings.length === 1
                ? profileCompletion.warnings[0]
                : `${profileCompletion?.warnings.length} items need attention for accurate calculations`}
            </p>

            {/* Expandable Details */}
            {missingFieldsList.length > 0 && (
              <div>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium"
                >
                  <span>{isExpanded ? "Hide details" : "Show details"}</span>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="w-3 h-3 rotate-90" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        {missingFieldsList.map((field) => (
                          <div
                            key={field}
                            className="flex items-center gap-2 p-2 rounded-lg bg-background/50"
                          >
                            <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                              {getFieldIcon(field)}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {getFieldLabel(field)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Action hint */}
                      <p className="text-xs text-muted-foreground mt-3 text-center">
                        Go to{" "}
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          Profile
                        </span>{" "}
                        to update your information
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPACT PROFILE BADGE (for header/nav)
// ═══════════════════════════════════════════════════════════════

export function ProfileCompletionBadge({
  className,
}: {
  className?: string;
}) {
  const { analyticsData, analyticsLoading } = useApp();

  const profileCompletion = analyticsData?.profileCompletion;
  const isComplete = profileCompletion?.isComplete ?? true;

  if (analyticsLoading || isComplete) return null;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20",
        className
      )}
      role="status"
      aria-label={`Profile ${profileCompletion?.score}% complete`}
    >
      <AlertCircle className="w-3 h-3 text-amber-500" />
      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
        {profileCompletion?.score}%
      </span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROFILE SCORE CIRCULAR (for dashboard)
// ═══════════════════════════════════════════════════════════════

export function ProfileCompletionCircle({
  className,
  size = 60,
}: {
  className?: string;
  size?: number;
}) {
  const { analyticsData } = useApp();
  const score = analyticsData?.profileCompletion?.score ?? 100;
  const isComplete = analyticsData?.profileCompletion?.isComplete ?? true;

  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted/20"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#profileGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="profileGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop
              offset="0%"
              stopColor={isComplete ? "#10b981" : "#f59e0b"}
            />
            <stop
              offset="100%"
              stopColor={isComplete ? "#14b8a6" : "#f97316"}
            />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold">{score}%</span>
      </div>
    </div>
  );
}
