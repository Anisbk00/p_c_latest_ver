import { getSupabase, type TypedSupabase } from '@/lib/supabase/supabase-data';
import { subDays, format } from 'date-fns';
import type { Database } from '@/lib/supabase/database.types';

type FoodLog = Database['public']['Tables']['food_logs']['Row'];
type Workout = Database['public']['Tables']['workouts']['Row'];
type BodyMetric = Database['public']['Tables']['body_metrics']['Row'];
type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type UserSettings = Database['public']['Tables']['user_settings']['Row'];
type Goal = Database['public']['Tables']['goals']['Row'];

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface RetrievedDocument {
  id: string;
  type: 'food_log' | 'workout' | 'measurement' | 'profile' | 'goal' | 'help';
  content: string;
  metadata: Record<string, unknown>;
  relevanceScore: number;
  timestamp?: Date;
}

export interface RetrievalOptions {
  usePersonalData?: boolean;
  daysWindow?: number;
  maxDocuments?: number;
  queryType?: 'nutrition' | 'workout' | 'progress' | 'general';
}

// ═══════════════════════════════════════════════════════════════
// Retrieval Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Main retrieval function - fetches relevant context for Iron Coach
 */
export async function retrieveContext(
  userId: string, 
  query: string, 
  options: RetrievalOptions = {}
): Promise<RetrievedDocument[]> {
  const {
    usePersonalData = true,
    daysWindow = 30,
    maxDocuments = 8,
    queryType = detectQueryType(query)
  } = options;

  if (!usePersonalData) {
    return getGenericHelpContent(query, queryType);
  }

  const cutoffDate = subDays(new Date(), daysWindow);
  const documents: RetrievedDocument[] = [];

  // Retrieve based on query type
  const retrievalPromises = [
    retrieveFoodLogs(userId, cutoffDate, queryType),
    retrieveWorkouts(userId, cutoffDate, queryType),
    retrieveMeasurements(userId, cutoffDate, queryType),
    retrieveProfile(userId),
    retrieveGoals(userId),
  ];

  const results = await Promise.allSettled(retrievalPromises);
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      documents.push(...result.value);
    }
  });

  // Sort by relevance and recency, then return top K
  return documents
    .sort((a, b) => {
      // First by relevance score
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
      // Then by recency if scores are similar
      if (a.timestamp && b.timestamp) {
        return b.timestamp.getTime() - a.timestamp.getTime();
      }
      return 0;
    })
    .slice(0, maxDocuments);
}

/**
 * Detect the type of query for targeted retrieval
 */
function detectQueryType(query: string): RetrievalOptions['queryType'] {
  const lowerQuery = query.toLowerCase();
  
  if (/calorie|protein|carb|fat|food|eat|meal|nutrition|breakfast|lunch|dinner|snack/.test(lowerQuery)) {
    return 'nutrition';
  }
  if (/workout|run|cycle|swim|exercise|train|lift|cardio|strength|distance|pace/.test(lowerQuery)) {
    return 'workout';
  }
  if (/weight|progress|body|fat|muscle|measurement|goal|target/.test(lowerQuery)) {
    return 'progress';
  }
  return 'general';
}

/**
 * Retrieve recent food logs
 */
async function retrieveFoodLogs(
  userId: string, 
  cutoffDate: Date,
  queryType: RetrievalOptions['queryType']
): Promise<RetrievedDocument[]> {
  const documents: RetrievedDocument[] = [];
  
  // Only fetch if nutrition-related query or general
  if (queryType !== 'nutrition' && queryType !== 'general') {
    return documents;
  }

  const supabase: TypedSupabase = await getSupabase();
  const { data: foodLogs, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', cutoffDate.toISOString())
    .order('logged_at', { ascending: false })
    .limit(15);

  if (error || !foodLogs) {
    console.error('[Retriever] Error fetching food logs:', error);
    return documents;
  }

  // Aggregate today's totals
  const today = format(new Date(), 'yyyy-MM-dd');
  const todaysLogs = (foodLogs as FoodLog[]).filter(log => 
    format(new Date(log.logged_at), 'yyyy-MM-dd') === today
  );

  if (todaysLogs.length > 0) {
    const totals = todaysLogs.reduce((acc, log) => ({
      calories: acc.calories + (log.calories || 0),
      protein: acc.protein + (log.protein || 0),
      carbs: acc.carbs + (log.carbs || 0),
      fat: acc.fat + (log.fat || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    documents.push({
      id: 'food_log:today_summary',
      type: 'food_log',
      content: `Today's intake: ${Math.round(totals.calories)} calories, ${Math.round(totals.protein)}g protein, ${Math.round(totals.carbs)}g carbs, ${Math.round(totals.fat)}g fat. ${todaysLogs.length} entries logged.`,
      metadata: { 
        date: today, 
        entryCount: todaysLogs.length,
        totals
      },
      relevanceScore: 0.95,
      timestamp: new Date()
    });
  }

  // Add individual recent entries
  (foodLogs as FoodLog[]).slice(0, 5).forEach(log => {
    const loggedAt = new Date(log.logged_at);
    documents.push({
      id: `food_log:${log.id}`,
      type: 'food_log',
      content: `${log.food_name || 'Unknown food'}: ${log.calories} cal, ${log.protein}g protein, ${log.meal_type} (${format(loggedAt, 'MMM d')})`,
      metadata: { 
        loggedAt: log.logged_at, 
        mealType: log.meal_type,
        calories: log.calories,
        protein: log.protein
      },
      relevanceScore: 0.8,
      timestamp: loggedAt
    });
  });

  return documents;
}

/**
 * Retrieve recent workouts
 */
async function retrieveWorkouts(
  userId: string, 
  cutoffDate: Date,
  queryType: RetrievalOptions['queryType']
): Promise<RetrievedDocument[]> {
  const documents: RetrievedDocument[] = [];

  // Only fetch if workout-related query or general
  if (queryType !== 'workout' && queryType !== 'general') {
    return documents;
  }

  const supabase: TypedSupabase = await getSupabase();
  const { data: workouts, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', cutoffDate.toISOString())
    .order('started_at', { ascending: false })
    .limit(10);

  if (error || !workouts) {
    console.error('[Retriever] Error fetching workouts:', error);
    return documents;
  }

  // Weekly summary
  const weekStart = subDays(new Date(), 7);
  const weeklyWorkouts = (workouts as Workout[]).filter(w => new Date(w.started_at) >= weekStart);
  
  if (weeklyWorkouts.length > 0) {
    const totalDuration = weeklyWorkouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0);
    const totalCalories = weeklyWorkouts.reduce((sum, w) => sum + (w.calories_burned || 0), 0);
    const totalDistance = weeklyWorkouts.reduce((sum, w) => sum + (w.distance_meters || 0), 0);

    documents.push({
      id: 'workout:weekly_summary',
      type: 'workout',
      content: `This week: ${weeklyWorkouts.length} workouts, ${Math.round(totalDuration)}min total, ${Math.round(totalCalories)} cal burned, ${(totalDistance / 1000).toFixed(1)}km distance`,
      metadata: { 
        workoutCount: weeklyWorkouts.length,
        totalDuration,
        totalCalories,
        totalDistance
      },
      relevanceScore: 0.9,
      timestamp: new Date()
    });
  }

  // Individual workouts
  (workouts as Workout[]).slice(0, 3).forEach(workout => {
    const distanceSize = workout.distance_meters ? `${(workout.distance_meters / 1000).toFixed(1)}km` : '';
    const durationText = workout.duration_minutes ? `${Math.round(workout.duration_minutes)}min` : '';
    const caloriesText = workout.calories_burned ? `${Math.round(workout.calories_burned)} cal` : '';
    const startedAt = new Date(workout.started_at);
    
    documents.push({
      id: `workout:${workout.id}`,
      type: 'workout',
      content: `${workout.activity_type}: ${[durationText, distanceSize, caloriesText].filter(Boolean).join(', ')} (${format(startedAt, 'MMM d')})`,
      metadata: { 
        startedAt: workout.started_at,
        activityType: workout.activity_type,
        duration: workout.duration_minutes,
        distance: workout.distance_meters,
        calories: workout.calories_burned
      },
      relevanceScore: 0.85,
      timestamp: startedAt
    });
  });

  return documents;
}

/**
 * Retrieve recent measurements
 */
async function retrieveMeasurements(
  userId: string, 
  cutoffDate: Date,
  queryType: RetrievalOptions['queryType']
): Promise<RetrievedDocument[]> {
  const documents: RetrievedDocument[] = [];

  // Only fetch if progress-related query or general
  if (queryType !== 'progress' && queryType !== 'general') {
    return documents;
  }

  const supabase: TypedSupabase = await getSupabase();
  const { data: measurements, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('captured_at', cutoffDate.toISOString())
    .order('captured_at', { ascending: false })
    .limit(15);

  if (error || !measurements) {
    console.error('[Retriever] Error fetching measurements:', error);
    return documents;
  }

  // Latest weight
  const latestWeight = (measurements as BodyMetric[]).find(m => m.metric_type === 'weight');
  if (latestWeight) {
    const capturedAt = new Date(latestWeight.captured_at);
    documents.push({
      id: `measurement:latest_weight`,
      type: 'measurement',
      content: `Latest weight: ${latestWeight.value} ${latestWeight.unit} (${format(capturedAt, 'MMM d')})`,
      metadata: { 
        type: 'weight',
        value: latestWeight.value,
        unit: latestWeight.unit
      },
      relevanceScore: 0.9,
      timestamp: capturedAt
    });
  }

  // Weight trend (compare to previous)
  const weights = (measurements as BodyMetric[]).filter(m => m.metric_type === 'weight');
  if (weights.length >= 2) {
    const change = weights[0].value - weights[weights.length - 1].value;
    const direction = change < 0 ? 'lost' : change > 0 ? 'gained' : 'no change';
    
    documents.push({
      id: 'measurement:weight_trend',
      type: 'measurement',
      content: `Weight trend: ${direction} ${Math.abs(change).toFixed(1)}kg over last ${weights.length} entries`,
      metadata: { change, direction },
      relevanceScore: 0.85,
      timestamp: new Date()
    });
  }

  return documents;
}

/**
 * Retrieve user profile
 */
async function retrieveProfile(userId: string): Promise<RetrievedDocument[]> {
  const documents: RetrievedDocument[] = [];

  const supabase: TypedSupabase = await getSupabase();
  
  const [profileRes, userRes, settingsRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single()
  ]);

  const profile = profileRes.data as UserProfile | null;
  const user = userRes.data as Profile | null;
  const settings = settingsRes.data as UserSettings | null;

  if (profile) {
    documents.push({
      id: 'user:profile',
      type: 'profile',
      content: `Profile: ${profile.height_cm || '?'}cm tall, ${profile.activity_level || 'moderate'} activity, goal: ${profile.primary_goal || 'not set'}, target weight: ${profile.target_weight_kg || '?'}kg`,
      metadata: { 
        heightCm: profile.height_cm,
        activityLevel: profile.activity_level,
        primaryGoal: profile.primary_goal,
        targetWeightKg: profile.target_weight_kg
      },
      relevanceScore: 0.95,
      timestamp: new Date()
    });
  }

  if (user) {
    documents.push({
      id: 'user:settings',
      type: 'profile',
      content: `Coaching tone: ${user.coaching_tone || 'encouraging'}, timezone: ${user.timezone || 'UTC'}`,
      metadata: { 
        coachingTone: user.coaching_tone,
        timezone: user.timezone
      },
      relevanceScore: 0.7,
      timestamp: new Date()
    });
  }

  if (settings) {
    documents.push({
      id: 'user:app_settings',
      type: 'profile',
      content: `App settings: theme ${settings.theme}, units: ${settings.units}, notifications: ${settings.notifications_enabled ? 'on' : 'off'}`,
      metadata: { 
        theme: settings.theme,
        units: settings.units,
        notificationsEnabled: settings.notifications_enabled
      },
      relevanceScore: 0.5,
      timestamp: new Date()
    });
  }

  return documents;
}

/**
 * Retrieve goals
 */
async function retrieveGoals(userId: string): Promise<RetrievedDocument[]> {
  const documents: RetrievedDocument[] = [];

  const supabase: TypedSupabase = await getSupabase();
  const { data: goals, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(5);

  if (error || !goals) {
    console.error('[Retriever] Error fetching goals:', error);
    return documents;
  }

  (goals as Goal[]).forEach(goal => {
    const progress = goal.current_value && goal.target_value
      ? Math.round((goal.current_value / goal.target_value) * 100)
      : 0;

    const createdAt = new Date(goal.created_at);
    documents.push({
      id: `goal:${goal.id}`,
      type: 'goal',
      content: `Goal: ${goal.goal_type} - ${goal.current_value || 0}/${goal.target_value || '?'} ${goal.unit} (${progress}% complete)`,
      metadata: { 
        goalType: goal.goal_type,
        currentValue: goal.current_value,
        targetValue: goal.target_value,
        progress
      },
      relevanceScore: 0.85,
      timestamp: createdAt
    });
  });

  return documents;
}

/**
 * Generic help content when personal data is not available
 */
function getGenericHelpContent(
  query: string, 
  queryType: RetrievalOptions['queryType']
): RetrievedDocument[] {
  const helpTopics: Record<string, string> = {
    nutrition: `I can help you understand nutrition. Track your meals to get personalized calorie and macro insights.`,
    workout: `I can help with workout planning. Log your activities to see performance trends and get tailored advice.`,
    progress: `Track your weight and measurements to see progress over time. I'll provide insights once you have data.`,
    general: `I'm Iron Coach, your fitness companion. Track meals, workouts, and measurements for personalized guidance.`
  };

  return [{
    id: 'help:general',
    type: 'help',
    content: helpTopics[queryType] || helpTopics.general,
    metadata: { category: 'help', queryType },
    relevanceScore: 0.5
  }];
}

/**
 * Build context string for LLM prompt
 */
export function buildContextString(documents: RetrievedDocument[]): string {
  if (documents.length === 0) {
    return 'No personal data available. Provide general fitness guidance.';
  }

  const sections: string[] = ['## User\'s Data Context\n'];
  
  // Group by type
  const grouped = documents.reduce((acc, doc) => {
    const type = doc.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<RetrievedDocument['type'], RetrievedDocument[]>);

  if (grouped.food_log) {
    sections.push('### Recent Nutrition');
    grouped.food_log.forEach(doc => {
      sections.push(`- ${doc.content}`);
    });
  }

  if (grouped.workout) {
    sections.push('\n### Recent Activity');
    grouped.workout.forEach(doc => {
      sections.push(`- ${doc.content}`);
    });
  }

  if (grouped.measurement) {
    sections.push('\n### Body Metrics');
    grouped.measurement.forEach(doc => {
      sections.push(`- ${doc.content}`);
    });
  }

  if (grouped.profile) {
    sections.push('\n### Profile');
    grouped.profile.forEach(doc => {
      sections.push(`- ${doc.content}`);
    });
  }

  if (grouped.goal) {
    sections.push('\n### Active Goals');
    grouped.goal.forEach(doc => {
      sections.push(`- ${doc.content}`);
    });
  }

  return sections.join('\n');
}
