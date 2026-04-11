"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/mobile-api";

export type XPAction =
  | "workout"
  | "workout_long"
  | "workout_intense"
  | "food_log"
  | "food_log_complete_meal"
  | "progress_photo"
  | "daily_complete"
  | "streak_bonus_7"
  | "streak_bonus_30"
  | "first_workout"
  | "first_photo";

interface XPResult {
  success: boolean;
  xp: number;
  level: number;
  leveledUp: boolean;
  awarded: number;
  action: XPAction;
  error?: string;
}

interface XPStats {
  xp: number;
  level: number;
  xpProgress: number;
  xpNeeded: number;
  xpToNextLevel: number;
  progressPercent: number;
  transactions: Array<{
    id: string;
    amount: number;
    action_type: string;
    description: string;
    created_at: string;
  }>;
}

export function useXP() {
  const [isAwarding, setIsAwarding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<XPStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const awardXP = useCallback(async (
    action: XPAction,
    options?: {
      referenceId?: string;
      description?: string;
      showToast?: boolean;
    }
  ): Promise<XPResult | null> => {
    setIsAwarding(true);
    setError(null);
    
    try {
      const response = await apiFetch("/api/xp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          referenceId: options?.referenceId,
          description: options?.description,
        }),
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60';
        setError(`Rate limited. Try again in ${retryAfter}s`);
        if (options?.showToast !== false) {
          toast({
            title: "Slow down!",
            description: `Too many XP requests. Try again in ${retryAfter} seconds.`,
            variant: "destructive",
          });
        }
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || "Failed to award XP");
        console.error("[useXP] Failed to award XP:", errorData);
        return null;
      }

      const result: XPResult = await response.json();

      // Show level up toast
      if (result.leveledUp && options?.showToast !== false) {
        toast({
          title: `🎉 Level Up!`,
          description: `Congratulations! You reached Level ${result.level}!`,
          variant: "default",
        });
      } else if (options?.showToast && result.awarded > 0) {
        toast({
          title: `+${result.awarded} XP`,
          description: `Total: ${result.xp} XP`,
          variant: "default",
        });
      }

      // Update local stats
      setStats(prev => prev ? {
        ...prev,
        xp: result.xp,
        level: result.level,
        xpProgress: result.xp - ((result.level - 1) * 100),
        progressPercent: Math.min(100, ((result.xp - ((result.level - 1) * 100)) / 100) * 100),
      } : null);

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setError(msg);
      console.error("[useXP] Error awarding XP:", error);
      return null;
    } finally {
      setIsAwarding(false);
    }
  }, []);

  const fetchStats = useCallback(async (): Promise<XPStats | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiFetch("/api/xp");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || "Failed to fetch stats");
        console.error("[useXP] Failed to fetch stats");
        return null;
      }
      const data: XPStats = await response.json();
      setStats(data);
      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setError(msg);
      console.error("[useXP] Error fetching stats:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh stats periodically (every 5 minutes) when mounted
  useEffect(() => {
    // Initial fetch
    fetchStats();
    
    // Set up interval for background refresh — only fetch when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchStats();
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    awardXP,
    fetchStats,
    stats,
    isAwarding,
    isLoading,
    error,
  };
}
