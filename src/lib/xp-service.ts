/**
 * XP Service - Centralized Experience Point Management
 * 
 * Production-ready service for awarding XP, tracking achievements,
 * and managing the leveling system across the entire application.
 * 
 * @module lib/xp-service
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════
// XP REWARDS CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const XP_REWARDS = {
  // Workouts
  workout: 20,
  workout_long: 35,           // 45+ minutes
  workout_intense: 50,        // 60+ min or 500+ calories
  first_workout: 100,         // Achievement: First workout ever
  
  // Nutrition
  food_log: 5,
  food_log_complete_meal: 10, // All macros logged
  
  // Progress Tracking
  progress_photo: 25,
  first_photo: 50,            // Achievement: First progress photo
  
  // Daily Engagement
  daily_complete: 15,         // Logged workout + meals in same day
  streak_bonus_7: 50,         // 7-day streak milestone
  streak_bonus_30: 200,       // 30-day streak milestone
} as const;

export type XPAction = keyof typeof XP_REWARDS;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface AwardXPResult {
  success: boolean;
  xp: number;
  level: number;
  leveledUp: boolean;
  awarded: number;
  action: XPAction;
  error?: string;
}

export interface XPAwardOptions {
  userId: string;
  action: XPAction;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════
// XP SERVICE CLASS
// ═══════════════════════════════════════════════════════════════

export class XPService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Award XP to a user for a specific action
   * 
   * Production-ready with:
   * - Proper error handling and logging
   * - Idempotency via reference_id
   * - Achievement detection
   * - Profile event emission
   */
  async awardXP(options: XPAwardOptions): Promise<AwardXPResult> {
    const { userId, action, referenceId, description, metadata } = options;

    try {
      // Validate action
      if (!(action in XP_REWARDS)) {
        throw new Error(`Invalid XP action: ${action}`);
      }

      const amount = XP_REWARDS[action];

      // Check for duplicate award (idempotency)
      if (referenceId) {
        const { data: existing } = await this.supabase
          .from('xp_transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('reference_id', referenceId)
          .eq('action_type', action)
          .maybeSingle();

        if (existing) {
          console.log(`[XP Service] Duplicate award prevented for ${action} (ref: ${referenceId})`);
          
          // Return current stats without awarding
          const stats = await this.getUserXPStats(userId);
          return {
            success: true,
            xp: stats.xp,
            level: stats.level,
            leveledUp: false,
            awarded: 0,
            action,
          };
        }
      }

      // Award XP via RPC function
      const { data, error } = await this.supabase.rpc('award_xp', {
        p_user_id: userId,
        p_amount: amount,
        p_action_type: action,
        p_reference_id: referenceId || null,
        p_description: description || this.getDefaultDescription(action),
      });

      if (error) {
        throw error;
      }

      const result = data as { xp: number; level: number; leveled_up: boolean };

      // Log successful award
      console.log(`[XP Service] ✓ Awarded ${amount} XP to ${userId} for ${action}`);

      // Emit profile event (for real-time updates)
      await this.emitXPEvent(userId, {
        action,
        amount,
        newXP: result.xp,
        newLevel: result.level,
        leveledUp: result.leveled_up,
      });

      return {
        success: true,
        xp: result.xp,
        level: result.level,
        leveledUp: result.leveled_up,
        awarded: amount,
        action,
      };

    } catch (error) {
      // Comprehensive error logging
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('[XP Service] Failed to award XP', {
        userId,
        action,
        amount: XP_REWARDS[action],
        referenceId,
        error: errorMsg,
      });

      // Still return failure state (don't throw - XP is non-critical)
      return {
        success: false,
        xp: 0,
        level: 1,
        leveledUp: false,
        awarded: 0,
        action,
        error: errorMsg,
      };
    }
  }

  /**
   * Check and award achievement-based XP
   * Detects "first" events and milestones
   */
  async checkAchievements(userId: string): Promise<void> {
    try {
      // Check for first workout
      const { data: firstWorkout } = await this.supabase
        .from('xp_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('action_type', 'first_workout')
        .maybeSingle();

      if (!firstWorkout) {
        // Check if user has completed a workout
        const { data: workouts } = await this.supabase
          .from('workouts')
          .select('id')
          .eq('user_id', userId)
          .not('completed_at', 'is', null)
          .limit(1);

        if (workouts && workouts.length > 0) {
          await this.awardXP({
            userId,
            action: 'first_workout',
            referenceId: workouts[0].id,
            description: '🎉 Completed your first workout!',
          });
        }
      }

      // Check for first progress photo
      const { data: firstPhoto } = await this.supabase
        .from('xp_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('action_type', 'first_photo')
        .maybeSingle();

      if (!firstPhoto) {
        const { data: photos } = await this.supabase
          .from('user_files')
          .select('id')
          .eq('user_id', userId)
          .eq('category', 'progress_photo')
          .limit(1);

        if (photos && photos.length > 0) {
          await this.awardXP({
            userId,
            action: 'first_photo',
            referenceId: photos[0].id,
            description: '📸 Uploaded your first progress photo!',
          });
        }
      }

      // Check for streak bonuses
      await this.checkStreakBonuses(userId);

    } catch (error) {
      logger.error('[XP Service] Achievement check failed', { userId, error: String(error) });
    }
  }

  /**
   * Check and award streak bonuses
   */
  private async checkStreakBonuses(userId: string): Promise<void> {
    try {
      // Get current streak from user_behavior_profile
      const { data: profile } = await this.supabase
        .from('user_behavior_profile')
        .select('current_streak, longest_streak')
        .eq('user_id', userId)
        .maybeSingle();

      if (!profile) return;

      const streak = profile.current_streak || 0;

      // Award 7-day streak bonus
      if (streak === 7) {
        const { data: existing } = await this.supabase
          .from('xp_transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('action_type', 'streak_bonus_7')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (!existing) {
          await this.awardXP({
            userId,
            action: 'streak_bonus_7',
            description: '🔥 7-day streak milestone!',
          });
        }
      }

      // Award 30-day streak bonus
      if (streak === 30) {
        const { data: existing } = await this.supabase
          .from('xp_transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('action_type', 'streak_bonus_30')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (!existing) {
          await this.awardXP({
            userId,
            action: 'streak_bonus_30',
            description: '🏆 30-day streak milestone achieved!',
          });
        }
      }
    } catch (error) {
      logger.error('[XP Service] Streak bonus check failed', { userId, error: String(error) });
    }
  }

  /**
   * Check if daily activities are complete and award bonus
   */
  async checkDailyComplete(userId: string, date?: Date): Promise<void> {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    try {
      // Check if already awarded today
      const { data: existing } = await this.supabase
        .from('xp_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('action_type', 'daily_complete')
        .gte('created_at', `${dateStr}T00:00:00`)
        .lt('created_at', `${dateStr}T23:59:59`)
        .maybeSingle();

      if (existing) return;

      // Check for workout on this day
      const { data: workouts } = await this.supabase
        .from('workouts')
        .select('id')
        .eq('user_id', userId)
        .gte('started_at', `${dateStr}T00:00:00`)
        .lt('started_at', `${dateStr}T23:59:59`)
        .limit(1);

      // Check for food logs on this day
      const { data: foodLogs } = await this.supabase
        .from('food_logs')
        .select('id')
        .eq('user_id', userId)
        .gte('logged_at', `${dateStr}T00:00:00`)
        .lt('logged_at', `${dateStr}T23:59:59`)
        .limit(3); // At least 3 meal logs

      // Award if both completed
      if (workouts && workouts.length > 0 && foodLogs && foodLogs.length >= 3) {
        await this.awardXP({
          userId,
          action: 'daily_complete',
          description: '✅ Completed daily workout and nutrition tracking!',
        });
      }
    } catch (error) {
      logger.error('[XP Service] Daily complete check failed', { userId, error: String(error) });
    }
  }

  /**
   * Get user's current XP statistics
   */
  async getUserXPStats(userId: string) {
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('xp, level')
      .eq('id', userId)
      .single();

    if (!profile) {
      return { xp: 0, level: 1 };
    }

    return {
      xp: profile.xp || 0,
      level: profile.level || 1,
    };
  }

  /**
   * Emit XP event for real-time updates
   */
  private async emitXPEvent(userId: string, data: any): Promise<void> {
    try {
      await this.supabase
        .from('user_events')
        .insert({
          user_id: userId,
          event_type: data.leveledUp ? 'level_up' : 'xp_earned',
          event_data: data,
          source_table: 'xp_transactions',
        });
    } catch (error) {
      // Non-critical - don't fail XP award if event emission fails
      console.warn('[XP Service] Failed to emit event:', error);
    }
  }

  /**
   * Get default description for XP action
   */
  private getDefaultDescription(action: XPAction): string {
    const descriptions: Record<XPAction, string> = {
      workout: 'Completed workout',
      workout_long: 'Completed long workout (45+ min)',
      workout_intense: 'Completed intense workout (60+ min or 500+ cal)',
      first_workout: '🎉 First workout completed!',
      food_log: 'Logged food',
      food_log_complete_meal: 'Logged complete meal with all macros',
      progress_photo: 'Uploaded progress photo',
      first_photo: '📸 First progress photo uploaded!',
      daily_complete: '✅ Completed daily workout and nutrition',
      streak_bonus_7: '🔥 7-day streak milestone!',
      streak_bonus_30: '🏆 30-day streak milestone!',
    };

    return descriptions[action] || `Earned XP for ${action}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate XP tier for workout based on metrics
 */
export function calculateWorkoutXPTier(
  durationMin: number,
  caloriesBurned: number,
  isPR?: boolean,
  avgHeartRate?: number
): XPAction {
  // Bonus for personal record
  if (isPR) {
    return 'workout_intense';
  }

  // Intense workout criteria
  if (durationMin >= 60 || caloriesBurned >= 500 || (avgHeartRate && avgHeartRate >= 150)) {
    return 'workout_intense';
  }

  // Long workout criteria
  if (durationMin >= 45) {
    return 'workout_long';
  }

  // Standard workout
  return 'workout';
}

/**
 * Check if food log has complete nutrition data
 */
export function isCompleteMealLog(protein: number, carbs: number, fat: number): boolean {
  return protein > 0 && carbs > 0 && fat > 0;
}

/**
 * Calculate level from total XP
 */
export function calculateLevel(totalXP: number): number {
  return Math.floor(totalXP / 100) + 1;
}

/**
 * Calculate XP needed for next level
 */
export function xpToNextLevel(currentLevel: number): number {
  return 100; // Linear progression: 100 XP per level
}

/**
 * Calculate XP progress within current level
 */
export function calculateXPProgress(totalXP: number, level: number): {
  current: number;
  needed: number;
  percent: number;
} {
  const current = totalXP - ((level - 1) * 100);
  const needed = 100;
  const percent = Math.min(100, (current / needed) * 100);

  return { current, needed, percent };
}
