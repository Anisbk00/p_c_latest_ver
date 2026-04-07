/**
 * Behavioral Notification Engine
 * 
 * An intelligent, predictive notification system that adapts to user behavior.
 * This is not a simple reminder system - it's a behavioral optimization engine.
 * 
 * @module lib/notifications/behavioral-engine
 */

import { createClient } from '@/lib/supabase/server';
import type {
  NotificationType,
  NotificationStatus,
  TimeOfDay,
  Locale,
  UserBehaviorProfile,
  Notification,
  NotificationPreferences,
  NotificationContext,
  GeneratedNotification,
} from './notification-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_DAILY_NOTIFICATIONS = 3;
const MIN_TIME_BETWEEN_MINUTES = 60;
const STREAK_RISK_THRESHOLD_HOURS = 4; // Hours before end of day to trigger streak protection

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * P1 FIX: Get user's current hour in their timezone
 */
function getUserLocalHour(timezone: string = 'UTC'): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    // Fallback to UTC if timezone is invalid
    return new Date().getUTCHours();
  }
}

/**
 * P1 FIX: Determine time of day category using user's timezone
 */
function getTimeOfDay(hour: number, timezone?: string): TimeOfDay {
  // If timezone provided, get the local hour first
  const localHour = timezone ? getUserLocalHour(timezone) : hour;
  
  if (localHour >= 5 && localHour < 12) return 'morning';
  if (localHour >= 12 && localHour < 17) return 'afternoon';
  return 'evening';
}

/**
 * P1 FIX: Check if current time is within user's quiet hours (timezone-aware)
 */
function isInQuietHours(preferences: NotificationPreferences, timezone?: string): boolean {
  let currentTime: string;
  
  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      currentTime = formatter.format(new Date()).replace(/^24:/, '00:');
    } catch {
      currentTime = new Date().toTimeString().slice(0, 5);
    }
  } else {
    currentTime = new Date().toTimeString().slice(0, 5);
  }
  
  const quietStart = preferences.quiet_hours_start;
  const quietEnd = preferences.quiet_hours_end;
  
  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (quietStart > quietEnd) {
    return currentTime >= quietStart || currentTime < quietEnd;
  }
  
  return currentTime >= quietStart && currentTime < quietEnd;
}

/**
 * Calculate prediction score based on context and behavior profile
 */
function calculatePredictionScore(
  context: NotificationContext,
  type: NotificationType
): number {
  let score = 0.5; // Base score

  const profile = context.behaviorProfile;
  if (!profile) return score;

  // Engagement score adjustment (weight: 30%)
  score += (profile.engagement_score / 100) * 0.3;

  // Time-based adjustment (weight: 25%)
  const now = new Date();
  const hour = now.getHours();
  
  // Check if current hour matches user's preferred times
  const workoutHour = profile.preferred_workout_time 
    ? parseInt(profile.preferred_workout_time.split(':')[0]) 
    : null;
  const mealHour = profile.preferred_meal_time 
    ? parseInt(profile.preferred_meal_time.split(':')[0]) 
    : null;

  if (type === 'workout_reminder' && workoutHour !== null) {
    const hourDiff = Math.abs(hour - workoutHour);
    if (hourDiff <= 2) score += 0.2;
  }

  if (type === 'meal_reminder' && mealHour !== null) {
    const hourDiff = Math.abs(hour - mealHour);
    if (hourDiff <= 1) score += 0.2;
  }

  // Streak motivation (weight: 20%)
  if (type === 'streak_protection' && context.streakAtRisk) {
    score += 0.2;
  }

  // Prediction confidence adjustment (weight: 15%)
  score *= (profile.prediction_confidence / 100) * 0.15 + 0.85;

  // Notification open rate adjustment (weight: 10%)
  score *= profile.notification_open_rate * 0.1 + 0.9;

  return Math.min(1, Math.max(0, score));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Templates
// ═══════════════════════════════════════════════════════════════════════════════

const NOTIFICATION_TEMPLATES: Record<NotificationType, Record<TimeOfDay, {
  en: { title: string; body: string };
  fr: { title: string; body: string };
  ar: { title: string; body: string };
}>> = {
  workout_reminder: {
    morning: {
      en: { title: 'Morning Workout', body: "Start your day strong. A quick workout sets the tone." },
      fr: { title: 'Entraînement matinal', body: "Commencez la journée du bon pied. Un entraînement rapide vous motive." },
      ar: { title: 'تمرين صباحي', body: 'ابدأ يومك بقوة. تمرين سريع يحدد المسار.' },
    },
    afternoon: {
      en: { title: 'Afternoon Energy', body: "Still have time for a quick workout. Your goals are waiting." },
      fr: { title: 'Énergie de l\'après-midi', body: "Il reste du temps pour un entraînement rapide. Vos objectifs vous attendent." },
      ar: { title: 'طاقة بعد الظهر', body: 'لا يزال لديك وقت لتمرين سريع. أهدافك في انتظارك.' },
    },
    evening: {
      en: { title: 'Evening Session', body: "End the day with a workout. Your body will thank you." },
      fr: { title: 'Séance du soir', body: "Terminez la journée par un entraînement. Votre corps vous remerciera." },
      ar: { title: 'جلسة مسائية', body: 'أنهِ يومك بتمرين. جسدك سيشكرك.' },
    },
  },
  meal_reminder: {
    morning: {
      en: { title: 'Log Breakfast', body: "Don't forget to log your breakfast. Every meal counts." },
      fr: { title: 'Enregistrer le petit-déjeuner', body: "N'oubliez pas d'enregistrer votre petit-déjeuner. Chaque repas compte." },
      ar: { title: 'سجل الإفطار', body: 'لا تنسَ تسجيل فطورك. كل وجبة مهمة.' },
    },
    afternoon: {
      en: { title: 'Lunch Check', body: "Time to log your lunch. Stay on track with your nutrition." },
      fr: { title: 'Contrôle déjeuner', body: "Il est temps d'enregistrer votre déjeuner. Restez sur la bonne voie." },
      ar: { title: 'مراجعة الغداء', body: 'حان وقت تسجيل غدائك. ابقَ على المسار الصحيح.' },
    },
    evening: {
      en: { title: 'Dinner Time', body: "Log your dinner to complete your nutrition day." },
      fr: { title: 'Heure du dîner', body: "Enregistrez votre dîner pour compléter votre journée nutritionnelle." },
      ar: { title: 'وقت العشاء', body: 'سجل عشاءك لإكمال يومك الغذائي.' },
    },
  },
  streak_protection: {
    morning: {
      en: { title: 'Streak at Risk', body: "Keep your streak alive. One activity today does it." },
      fr: { title: 'Série en danger', body: "Gardez votre série en vie. Une seule activité aujourd'hui suffit." },
      ar: { title: 'السلسلة في خطر', body: 'حافظ على سلسلتك. نشاط واحد اليوم يكفي.' },
    },
    afternoon: {
      en: { title: 'Don\'t Break the Streak', body: "You're one workout away from keeping your streak alive." },
      fr: { title: 'Ne brisez pas la série', body: "Vous êtes à un entraînement de garder votre série en vie." },
      ar: { title: 'لا تكسر السلسلة', body: 'أنت بعيد تمرين واحد عن الحفاظ على سلسلتك.' },
    },
    evening: {
      en: { title: 'Final Hours', body: "Your streak needs you. A quick activity now saves it." },
      fr: { title: 'Dernières heures', body: "Votre série a besoin de vous. Une activité rapide la sauve." },
      ar: { title: 'الساعات الأخيرة', body: 'سلسلتك تحتاجك. نشاط سريع الآن ينقذها.' },
    },
  },
  achievement: {
    morning: {
      en: { title: 'New Achievement', body: "You've hit a new milestone. Check it out!" },
      fr: { title: 'Nouveau succès', body: "Vous avez atteint un nouveau jalon. Allez voir !" },
      ar: { title: 'إنجاز جديد', body: 'لقد وصلت إلى مرحلة جديدة. تحقق من ذلك!' },
    },
    afternoon: {
      en: { title: 'Goal Reached', body: "Congratulations! You've achieved your goal." },
      fr: { title: 'Objectif atteint', body: "Félicitations ! Vous avez atteint votre objectif." },
      ar: { title: 'الهدف محقق', body: 'تهانينا! لقد حققت هدفك.' },
    },
    evening: {
      en: { title: 'Personal Best', body: "New personal record! You're stronger than yesterday." },
      fr: { title: 'Record personnel', body: "Nouveau record personnel ! Vous êtes plus fort qu'hier." },
      ar: { title: 'أفضل رقم شخصي', body: 'رقم قياسي شخصي جديد! أنت أقوى من أمس.' },
    },
  },
  goal_progress: {
    morning: {
      en: { title: 'Today\'s Target', body: "You have {{remaining}} calories to burn today. You've got this." },
      fr: { title: 'Objectif du jour', body: "Il vous reste {{remaining}} calories à brûler aujourd'hui." },
      ar: { title: 'هدف اليوم', body: 'لديك {{remaining}} سعرة لحرقها اليوم. أنت قادر.' },
    },
    afternoon: {
      en: { title: 'Progress Check', body: "You're {{percent}}% to your daily goal. Keep going!" },
      fr: { title: 'Contrôle de progression', body: "Vous êtes à {{percent}}% de votre objectif quotidien. Continuez !" },
      ar: { title: 'مراجعة التقدم', body: 'أنت في {{percent}}% من هدفك اليومي. استمر!' },
    },
    evening: {
      en: { title: 'Almost There', body: "Just a bit more to hit your goal. You can do it!" },
      fr: { title: 'Presque là', body: "Juste un peu plus pour atteindre votre objectif. Vous pouvez le faire !" },
      ar: { title: 'على وشك', body: 'فقط قليلاً أكثر لتحقيق هدفك. أنت تستطيع!' },
    },
  },
  coach_insight: {
    morning: {
      en: { title: 'Iron Coach Says', body: "Your pace improved 6% this week. Let's push slightly further." },
      fr: { title: 'Iron Coach dit', body: "Votre allure s'est améliorée de 6% cette semaine. Poussons un peu plus." },
      ar: { title: 'المدرب الحديدي يقول', body: 'وتيرتك تحسنت بنسبة 6% هذا الأسبوع. لندفع قليلاً أكثر.' },
    },
    afternoon: {
      en: { title: 'Coach Insight', body: "Your consistency is paying off. Stay the course." },
      fr: { title: 'Conseil du coach', body: "Votre constance porte ses fruits. Restez le cours." },
      ar: { title: 'رؤية المدرب', body: 'استمراريتك تعطي ثمارها. استمر على المسار.' },
    },
    evening: {
      en: { title: 'Evening Wisdom', body: "Rest is part of progress. Tomorrow, we go harder." },
      fr: { title: 'Sagesse du soir', body: "Le repos fait partie du progrès. Demain, on y va plus fort." },
      ar: { title: 'حكمة مسائية', body: 'الراحة جزء من التقدم. غداً، سنذهب بقوة أكبر.' },
    },
  },
  habit_reinforcement: {
    morning: {
      en: { title: 'Build the Habit', body: "Yesterday was strong. Repeat it today." },
      fr: { title: 'Créez l\'habitude', body: "Hier était fort. Répétez-le aujourd'hui." },
      ar: { title: 'ابنِ العادة', body: 'أمس كان قوياً. كرره اليوم.' },
    },
    afternoon: {
      en: { title: 'Momentum', body: "5 minutes today keeps the momentum going. Stay consistent." },
      fr: { title: 'Élan', body: "5 minutes aujourd'hui maintiennent l'élan. Restez constant." },
      ar: { title: 'زخم', body: '5 دقائق اليوم تحافظ على الزخم. ابقَ ثابتاً.' },
    },
    evening: {
      en: { title: 'Consistency Wins', body: "Small daily actions lead to big results. Keep showing up." },
      fr: { title: 'La constance gagne', body: "De petites actions quotidiennes mènent à de grands résultats." },
      ar: { title: 'الاستمرار يفوز', body: 'الإجراءات اليومية الصغيرة تؤدي إلى نتائج كبيرة. استمر في الحضور.' },
    },
  },
  daily_summary: {
    morning: {
      en: { title: 'Good Morning', body: "Here's your daily briefing. {{streak}} day streak! Let's make it {{next}}." },
      fr: { title: 'Bonjour', body: "Voici votre briefing quotidien. Série de {{streak}} jours ! Faisons-la passer à {{next}}." },
      ar: { title: 'صباح الخير', body: 'إليك موجزك اليومي. سلسلة {{streak}} يوم! لنجعلها {{next}}.' },
    },
    afternoon: {
      en: { title: 'Mid-Day Summary', body: "You've burned {{burned}} calories. {{remaining}} to go." },
      fr: { title: 'Résumé de mi-journée', body: "Vous avez brûlé {{burned}} calories. {{remaining}} restantes." },
      ar: { title: 'ملخص منتصف اليوم', body: 'لقد حرقت {{burned}} سعرة. بقي {{remaining}}.' },
    },
    evening: {
      en: { title: 'Day Wrap-Up', body: "Great work today. You hit {{percent}}% of your goals." },
      fr: { title: 'Bilan de la journée', body: "Beau travail aujourd'hui. Vous avez atteint {{percent}}% de vos objectifs." },
      ar: { title: 'ملخص اليوم', body: 'عمل رائع اليوم. حققت {{percent}}% من أهدافك.' },
    },
  },
  hydration_reminder: {
    morning: {
      en: { title: 'Hydration Check', body: "Start your day with water. Your body needs it." },
      fr: { title: 'Contrôle hydratation', body: "Commencez votre journée avec de l'eau. Votre corps en a besoin." },
      ar: { title: 'مراجعة الترطيب', body: 'ابدأ يومك بالماء. جسدك يحتاجه.' },
    },
    afternoon: {
      en: { title: 'Drink Water', body: "Stay hydrated. You've had {{glasses}} glasses so far." },
      fr: { title: 'Buvez de l\'eau', body: "Restez hydraté. Vous avez bu {{glasses}} verres jusqu'à présent." },
      ar: { title: 'اشرب ماء', body: 'ابقَ مرطباً. شربت {{glasses}} أكواب حتى الآن.' },
    },
    evening: {
      en: { title: 'Final Glasses', body: "{{remaining}} glasses to hit your hydration goal." },
      fr: { title: 'Derniers verres', body: "{{remaining}} verres pour atteindre votre objectif d'hydratation." },
      ar: { title: 'الأكواب الأخيرة', body: '{{remaining}} أكواب لتحقيق هدف الترطيب.' },
    },
  },
  motivational: {
    morning: {
      en: { title: 'Rise and Grind', body: "Champions are made in the morning. Show up today." },
      fr: { title: 'Lève-toi et bosse', body: "Les champions se font le matin. Présentez-vous aujourd'hui." },
      ar: { title: 'انهض وجاهد', body: 'الأبطال يصنعون في الصباح. احضر اليوم.' },
    },
    afternoon: {
      en: { title: 'No Excuses', body: "You're closer than you think. Keep pushing." },
      fr: { title: 'Pas d\'excuses', body: "Vous êtes plus proche que vous ne le pensez. Continuez à pousser." },
      ar: { title: 'لا أعذار', body: 'أنت أقرب مما تعتقد. استمر في الدفع.' },
    },
    evening: {
      en: { title: 'Iron Mindset', body: "Every rep counts. Every meal matters. No shortcuts." },
      fr: { title: 'Mentalité de fer', body: "Chaque répétition compte. Chaque repas compte. Pas de raccourcis." },
      ar: { title: 'عقلية حديدية', body: 'كل تكرار مهم. كل وجبة مهمة. لا اختصارات.' },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Engine Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BehavioralNotificationEngine
 * 
 * The main engine for intelligent, behavior-aware notifications.
 */
export class BehavioralNotificationEngine {
  /**
   * Determine what notification should be sent now based on user context
   */
  static determineNotification(
    context: NotificationContext,
    preferences: NotificationPreferences
  ): GeneratedNotification | null {
    // Check if notifications are enabled
    if (!preferences.notifications_enabled) {
      return null;
    }

    // Check quiet hours
    if (isInQuietHours(preferences)) {
      return null;
    }

    // Check daily limit
    // This would need to query the database - for now we assume the caller handles this

    // Determine the best notification type based on context
    const notificationType = this.selectNotificationType(context, preferences);
    if (!notificationType) {
      return null;
    }

    // Generate the notification content
    return this.generateNotification(notificationType, context);
  }

  /**
   * Select the most appropriate notification type based on user context
   */
  private static selectNotificationType(
    context: NotificationContext,
    preferences: NotificationPreferences
  ): NotificationType | null {
    const { timeOfDay, streakAtRisk, hasWorkoutToday, recentNotificationTypes } = context;

    // Priority 1: Streak Protection (highest priority)
    if (streakAtRisk && preferences.streak_protection_enabled) {
      if (!recentNotificationTypes.includes('streak_protection')) {
        return 'streak_protection';
      }
    }

    // Priority 2: Workout Reminder (if no workout today and enabled)
    if (!hasWorkoutToday && preferences.workout_reminders_enabled) {
      if (!recentNotificationTypes.includes('workout_reminder')) {
        return 'workout_reminder';
      }
    }

    // Priority 3: Meal Reminder (time-based)
    if (preferences.meal_reminders_enabled) {
      if (!recentNotificationTypes.includes('meal_reminder')) {
        return 'meal_reminder';
      }
    }

    // Priority 4: Hydration Reminder
    if (context.hydrationCurrent < context.hydrationTarget * 0.8 && preferences.hydration_reminders_enabled) {
      if (!recentNotificationTypes.includes('hydration_reminder')) {
        return 'hydration_reminder';
      }
    }

    // Priority 5: Daily Summary (only in evening)
    if (timeOfDay === 'evening' && preferences.daily_summary_enabled) {
      if (!recentNotificationTypes.includes('daily_summary')) {
        return 'daily_summary';
      }
    }

    // Priority 6: Habit Reinforcement
    if (preferences.motivational_enabled) {
      if (!recentNotificationTypes.includes('habit_reinforcement')) {
        return 'habit_reinforcement';
      }
    }

    // Priority 7: Coach Insight (occasional, rare)
    if (preferences.coach_insights_enabled && Math.random() < 0.1) {
      if (!recentNotificationTypes.includes('coach_insight')) {
        return 'coach_insight';
      }
    }

    return null;
  }

  /**
   * Generate notification content with translations
   */
  private static generateNotification(
    type: NotificationType,
    context: NotificationContext
  ): GeneratedNotification {
    const { timeOfDay, locale } = context;
    const template = NOTIFICATION_TEMPLATES[type][timeOfDay];

    // Get content for user's locale (fallback to English)
    const title = template[locale]?.title || template.en.title;
    const body = this.interpolateTemplate(template[locale]?.body || template.en.body, context);

    // Build translations object
    const titleTranslations = {
      en: template.en.title,
      fr: template.fr.title,
      ar: template.ar.title,
    };

    const bodyTranslations = {
      en: this.interpolateTemplate(template.en.body, context),
      fr: this.interpolateTemplate(template.fr.body, context),
      ar: this.interpolateTemplate(template.ar.body, context),
    };

    // Calculate prediction score
    const predictionScore = calculatePredictionScore(context, type);

    // Determine deep link based on type
    const deepLink = this.getDeepLink(type);

    // Generate throttle key to prevent duplicates
    const throttleKey = this.generateThrottleKey(type, context);

    return {
      type,
      title,
      body,
      titleTranslations,
      bodyTranslations,
      deepLink,
      actionData: this.getActionData(type, context),
      throttleKey,
      scheduledFor: new Date(),
      predictionScore,
      generatedByAI: false,
    };
  }

  /**
   * Interpolate template variables
   */
  private static interpolateTemplate(template: string, context: NotificationContext): string {
    const replacements: Record<string, string | number> = {
      streak: context.currentStreak,
      next: context.currentStreak + 1,
      remaining: Math.max(0, context.targetCalories - context.caloriesConsumed),
      burned: context.caloriesBurned,
      percent: Math.round((context.caloriesConsumed / context.targetCalories) * 100),
      glasses: Math.round(context.hydrationCurrent / 250),
    };

    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    return result;
  }

  /**
   * Get deep link for notification type
   */
  private static getDeepLink(type: NotificationType): string {
    const links: Record<NotificationType, string> = {
      workout_reminder: '/workouts',
      meal_reminder: '/foods',
      streak_protection: '/workouts',
      achievement: '/profile',
      goal_progress: '/analytics',
      coach_insight: '/coach',
      habit_reinforcement: '/',
      daily_summary: '/',
      hydration_reminder: '/',
      motivational: '/',
    };
    return links[type];
  }

  /**
   * Generate action data for the notification
   */
  private static getActionData(
    type: NotificationType,
    context: NotificationContext
  ): Record<string, unknown> {
    return {
      type,
      userId: context.userId,
      timestamp: new Date().toISOString(),
      streak: context.currentStreak,
      goal: context.primaryGoal,
    };
  }

  /**
   * Generate a unique throttle key to prevent duplicate notifications
   */
  private static generateThrottleKey(
    type: NotificationType,
    context: NotificationContext
  ): string {
    const date = new Date().toISOString().split('T')[0];
    return `${context.userId}:${type}:${date}`;
  }

  /**
   * Calculate optimal notification times for a user
   */
  static calculateOptimalTimes(profile: UserBehaviorProfile): {
    morning: string;
    afternoon: string;
    evening: string;
  } {
    // Find peak hours from distributions
    const morningHours = [5, 6, 7, 8, 9, 10, 11];
    const afternoonHours = [12, 13, 14, 15, 16];
    const eveningHours = [17, 18, 19, 20, 21, 22];

    const findPeakHour = (hours: number[], distribution: Record<string, number>): number => {
      let maxCount = 0;
      let peakHour = hours[Math.floor(hours.length / 2)]; // Default to middle

      for (const hour of hours) {
        const count = distribution[hour.toString()] || 0;
        if (count > maxCount) {
          maxCount = count;
          peakHour = hour;
        }
      }

      return peakHour;
    };

    // Use workout distribution for workout-related times
    const workoutDist = profile.workout_hour_distribution;
    const appDist = profile.app_open_hour_distribution;

    // Calculate optimal times
    const morningHour = findPeakHour(morningHours, appDist);
    const afternoonHour = findPeakHour(afternoonHours, workoutDist);
    const eveningHour = findPeakHour(eveningHours, workoutDist);

    // Subtract 20 minutes from workout times for reminder
    const formatTime = (hour: number, offsetMinutes: number = 0): string => {
      const totalMinutes = hour * 60 - offsetMinutes;
      const adjustedHour = Math.floor(totalMinutes / 60);
      const adjustedMin = totalMinutes % 60;
      return `${String(adjustedHour).padStart(2, '0')}:${String(adjustedMin).padStart(2, '0')}`;
    };

    return {
      morning: formatTime(morningHour),
      afternoon: formatTime(afternoonHour, 20),
      evening: formatTime(eveningHour, 20),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

export { getTimeOfDay, isInQuietHours, calculatePredictionScore };
