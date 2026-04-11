/**
 * Comprehensive AI Service - Following Full Specification
 * 
 * Features:
 * - Multi-language support (EN, FR, AR)
 * - Conversation storage (ai_conversations, ai_messages)
 * - Adaptive learning (ai_training_signals)
 * - Recommendations (ai_recommendations)
 * - Plans (ai_plans)
 * - Insights (ai_insights)
 * - Feedback loops
 * 
 * All outputs respect user's language preference from user_settings.language
 * 
 * Uses Groq (llama-3.3-70b-versatile) as the AI provider.
 */

import { 
  generateChatCompletion as zaiGenerateChatCompletion,
  generateStreamingChatCompletion as zaiGenerateStreamingChatCompletion,
  getIronCoachSystemPrompt as getZAIronCoachSystemPrompt,
  type ChatMessage 
} from './gemini-service';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { validateWorkoutData, validateMealData, validateAIResponse } from './validation';

// Type definitions
type SupportedLocale = 'en' | 'fr' | 'ar';
type RecommendationType = 'workout' | 'meal' | 'habit' | 'insight' | 'nudge';
type ConversationRole = 'user' | 'assistant' | 'system';

// ═══════════════════════════════════════════════════════════════
// Multi-Language Support
// ═══════════════════════════════════════════════════════════════

const TRANSLATIONS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    // Iron Coach translations
    coach_greeting: "Listen up! I'm The Iron Coach. No excuses, no shortcuts.",
    workout_generated: "Here's your workout. Don't skip it.",
    meal_suggestion: "Eat this. High protein, no garbage.",
    habit_nudge: "Consistency beats motivation. Do it anyway.",
    feedback_received: "Got it. Let's adjust.",
    
    // Recommendation types
    workout: "Workout",
    meal: "Meal",
    habit: "Habit",
    insight: "Insight",
    nudge: "Reminder",
    
    // UI elements
    calories: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    sets: "Sets",
    reps: "Reps",
    weight: "Weight",
    duration: "Duration",
    intensity: "Intensity",
    
    // Common phrases
    today: "Today",
    this_week: "This Week",
    progress: "Progress",
    streak: "Streak",
    goal: "Goal",
  },
  fr: {
    // Iron Coach translations
    coach_greeting: "Écoute bien ! Je suis The Iron Coach. Pas d'excuses, pas de raccourcis.",
    workout_generated: "Voici ton entraînement. Ne le saute pas.",
    meal_suggestion: "Mange ça. Riche en protéines, pas de la malbouffe.",
    habit_nudge: "La régularité bat la motivation. Fais-le quand même.",
    feedback_received: "Compris. Ajustons.",
    
    // Recommendation types
    workout: "Entraînement",
    meal: "Repas",
    habit: "Habitude",
    insight: "Aperçu",
    nudge: "Rappel",
    
    // UI elements
    calories: "Calories",
    protein: "Protéines",
    carbs: "Glucides",
    fat: "Lipides",
    sets: "Séries",
    reps: "Répétitions",
    weight: "Poids",
    duration: "Durée",
    intensity: "Intensité",
    
    // Common phrases
    today: "Aujourd'hui",
    this_week: "Cette Semaine",
    progress: "Progrès",
    streak: "Série",
    goal: "Objectif",
  },
  ar: {
    // Iron Coach translations
    coach_greeting: "اسمع جيداً! أنا المدرب الحديدي. لا أعذار، لا اختصارات.",
    workout_generated: "هذا تمرينك. لا تتخطاه.",
    meal_suggestion: "كل هذا. بروتين عالي، بدون سفط.",
    habit_nudge: "الاستمرارية تغلب التحفيز. افعلها على أي حال.",
    feedback_received: "فهمت. دعنا نعدل.",
    
    // Recommendation types
    workout: "تمرين",
    meal: "وجبة",
    habit: "عادة",
    insight: "رؤية",
    nudge: "تذكير",
    
    // UI elements
    calories: "سعرات حرارية",
    protein: "بروتين",
    carbs: "كربوهيدرات",
    fat: "دهون",
    sets: "مجموعات",
    reps: "تكرارات",
    weight: "وزن",
    duration: "مدة",
    intensity: "شدة",
    
    // Common phrases
    today: "اليوم",
    this_week: "هذا الأسبوع",
    progress: "تقدم",
    streak: "سلسلة",
    goal: "هدف",
  },
};

/**
 * Get translation for a key in the specified locale
 */
function t(key: string, locale: SupportedLocale = 'en'): string {
  return TRANSLATIONS[locale]?.[key] || TRANSLATIONS['en'][key] || key;
}

/**
 * Build multi-language output object
 */
function buildTranslatedContent(contentEn: string, locale: SupportedLocale): Record<SupportedLocale, string> {
  return {
    en: contentEn,
    fr: contentEn, // In production, would use translation API
    ar: contentEn, // In production, would use translation API
  };
}

// ═══════════════════════════════════════════════════════════════
// System Prompts by Language
// ═══════════════════════════════════════════════════════════════

function getIronCoachSystemPrompt(locale: SupportedLocale = 'en'): string {
  return getZAIronCoachSystemPrompt(locale);
}

// ═══════════════════════════════════════════════════════════════
// Conversation Management
// ═══════════════════════════════════════════════════════════════

export interface ConversationContext {
  userGoal?: string;
  workoutsThisWeek?: number;
  proteinAdherencePct?: number;
  recentInsights?: string[];
  userState?: {
    fatigueScore?: number;
    recoveryScore?: number;
    momentumScore?: number;
  };
}

/**
 * Get or create a conversation
 */
async function getOrCreateConversation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  conversationId?: string,
  locale: SupportedLocale = 'en'
): Promise<string> {
  // If conversationId provided, verify it exists and belongs to user
  if (conversationId) {
    const { data } = await supabase
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();
    
    if (data) return conversationId;
  }
  
  // Create new conversation
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: userId,
      title: 'Iron Coach Chat',
      locale,
      context: {},
    })
    .select('id')
    .single();
  
  if (error || !data) {
    throw new Error('Failed to create conversation');
  }
  
  return data.id;
}

/**
 * Store a message in the conversation
 */
async function storeMessage(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  userId: string,
  role: ConversationRole,
  content: string,
  locale: SupportedLocale = 'en',
  metadata: {
    source?: string;
    confidence?: number;
    routingReason?: string;
    tokens?: number;
  } = {}
): Promise<string> {
  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      locale,
      translations: buildTranslatedContent(content, locale),
      source: metadata.source || 'groq-llm',
      confidence: metadata.confidence || 0.85,
      routing_reason: metadata.routingReason,
      tokens: metadata.tokens,
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Failed to store message:', error);
    throw new Error('Failed to store message');
  }
  
  return data.id;
}

// ═══════════════════════════════════════════════════════════════
// User Context Building
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate protein target based on bodyweight and goal
 */
function calculateProteinTarget(weightKg: number | null | undefined, goal?: string | null): number | null {
  if (!weightKg || weightKg <= 0) return null;
  
  const goalLower = goal?.toLowerCase() || '';
  let multiplier = 1.6;
  
  if (goalLower.includes('fat_loss') || goalLower.includes('fat loss')) {
    multiplier = 2.0;
  } else if (goalLower.includes('muscle') || goalLower.includes('gain')) {
    multiplier = 1.8;
  }
  
  return Math.round(weightKg * multiplier);
}

/**
 * Calculate confidence score based on context quality
 * Higher quality context = higher confidence
 */
function calculateConfidence(context: ConversationContext, responseLength: number): number {
  let confidence = 0.5; // Base confidence
  
  // Boost for having user goal set
  if (context.userGoal && context.userGoal !== 'maintenance') {
    confidence += 0.1;
  }
  
  // Boost for recent activity data
  if (context.workoutsThisWeek && context.workoutsThisWeek > 0) {
    confidence += 0.1;
  }
  
  // Boost for nutrition tracking
  if (context.proteinAdherencePct && context.proteinAdherencePct > 0) {
    confidence += 0.1;
  }
  
  // Boost for user state data
  if (context.userState?.fatigueScore || context.userState?.recoveryScore) {
    confidence += 0.05;
  }
  
  // Small boost for reasonable response length (not too short)
  if (responseLength >= 100) {
    confidence += 0.05;
  }
  
  // Cap at 0.95 (never 100% confident)
  return Math.min(0.95, Math.max(0.5, confidence));
}

async function buildUserContext(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ConversationContext> {
  // Fetch user profile, settings, and recent data
  const [
    profileResult,
    settingsResult,
    goalsResult,
    workoutsResult,
    foodLogsResult,
    userStateResult,
  ] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('workouts').select('id, started_at, calories_burned').eq('user_id', userId).gte('started_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('food_logs').select('protein, calories, logged_at').eq('user_id', userId).gte('logged_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('ai_user_state').select('*').eq('user_id', userId).single(),
  ]);

  const workouts = workoutsResult.data || [];
  const foodLogs = foodLogsResult.data || [];
  
  // Calculate protein target based on user's actual weight
  const profile = profileResult.data as { weight_kg?: number } | null;
  const userWeightKg = profile?.weight_kg || null;
  const calculatedProteinTarget = calculateProteinTarget(userWeightKg, goalsResult.data?.goal_type);
  const proteinTargetWeekly = calculatedProteinTarget ? calculatedProteinTarget * 7 : null;
  
  const proteinConsumed = foodLogs.reduce((sum: number, log: any) => sum + (log.protein || 0), 0);
  
  // Calculate adherence only if we have a target
  const proteinAdherencePct = proteinTargetWeekly 
    ? Math.min(100, Math.round((proteinConsumed / proteinTargetWeekly) * 100))
    : 0;
  
  return {
    userGoal: goalsResult.data?.goal_type || 'maintenance',
    workoutsThisWeek: workouts.length,
    proteinAdherencePct,
    recentInsights: [],
    userState: {
      fatigueScore: userStateResult.data?.fatigue_score || 0,
      recoveryScore: userStateResult.data?.recovery_score || 0,
      momentumScore: userStateResult.data?.momentum_score || 0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Feedback & Training Signals
// ═══════════════════════════════════════════════════════════════

/**
 * Record user feedback
 */
export async function recordFeedback(
  userId: string,
  messageId: string,
  feedbackType: 'positive' | 'negative' | 'neutral',
  rating?: number,
  feedbackText?: string
): Promise<void> {
  const supabase = await createClient();
  
  // Store feedback
  const { data: feedback, error } = await supabase
    .from('ai_feedback')
    .insert({
      user_id: userId,
      message_id: messageId,
      feedback_type: feedbackType,
      rating,
      feedback_text: feedbackText,
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Failed to record feedback:', error);
    return;
  }
  
  // Generate training signal
  const strength = feedbackType === 'positive' ? 1.0 : feedbackType === 'negative' ? -0.5 : 0;
  
  await supabase.from('ai_training_signals').insert({
    user_id: userId,
    signal_type: 'feedback',
    signal_data: {
      feedback_id: feedback.id,
      message_id: messageId,
      feedback_type: feedbackType,
      rating,
    },
    strength,
  });
}

/**
 * Record action outcome (for adaptive learning)
 */
export async function recordActionOutcome(
  userId: string,
  actionId: string,
  outcomeType: string,
  resultData: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();
  
  await supabase.from('ai_action_outcomes').insert({
    user_id: userId,
    action_id: actionId,
    outcome_type: outcomeType,
    result_data: resultData,
  });
  
  // Generate training signal
  await supabase.from('ai_training_signals').insert({
    user_id: userId,
    signal_type: 'action_outcome',
    signal_data: {
      action_id: actionId,
      outcome_type: outcomeType,
    },
    strength: 0.5,
  });
}

// ═══════════════════════════════════════════════════════════════
// Recommendations
// ═══════════════════════════════════════════════════════════════

export interface Recommendation {
  recommendation_type: RecommendationType;
  title: string;
  description: string;
  reasoning?: string;
  confidence: number;
  translations: Record<SupportedLocale, string>;
  related_data: Record<string, unknown>;
}

/**
 * Create a recommendation
 */
async function createRecommendation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  recommendation: Recommendation,
  locale: SupportedLocale = 'en'
): Promise<string> {
  const { data, error } = await supabase
    .from('ai_recommendations')
    .insert({
      user_id: userId,
      recommendation_type: recommendation.recommendation_type,
      title: recommendation.title,
      description: recommendation.description,
      reasoning: recommendation.reasoning,
      confidence: recommendation.confidence,
      translations: recommendation.translations,
      related_data: recommendation.related_data,
      locale,
      source: 'iron_coach',
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Failed to create recommendation:', error);
    throw new Error('Failed to create recommendation');
  }
  
  return data.id;
}

// ═══════════════════════════════════════════════════════════════
// AI Plans
// ═══════════════════════════════════════════════════════════════

export interface AIPlan {
  plan_type: 'workout' | 'nutrition' | 'habit' | 'recovery';
  title: string;
  content: Record<string, unknown>;
  confidence: number;
  rationale?: string;
  translations: Record<SupportedLocale, string>;
}

/**
 * Create an AI plan
 */
async function createPlan(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  plan: AIPlan,
  locale: SupportedLocale = 'en'
): Promise<string> {
  const { data, error } = await supabase
    .from('ai_plans')
    .insert({
      user_id: userId,
      plan_type: plan.plan_type,
      title: plan.title,
      content: plan.content,
      plan_json: plan.content,
      confidence: plan.confidence,
      rationale: plan.rationale,
      translations: plan.translations,
      locale,
      source: 'iron_coach',
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Failed to create plan:', error);
    throw new Error('Failed to create plan');
  }
  
  return data.id;
}

// ═══════════════════════════════════════════════════════════════
// Insights
// ═══════════════════════════════════════════════════════════════

export interface Insight {
  insight_type: 'nutrition' | 'training' | 'recovery' | 'progress' | 'habit';
  title: string;
  content: string;
  confidence: number;
  actionable: boolean;
  actions?: Record<string, unknown>[];
  translations: Record<SupportedLocale, string>;
}

/**
 * Create an insight
 */
async function createInsight(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  insight: Insight,
  locale: SupportedLocale = 'en'
): Promise<string> {
    const { sanitizeAIContent } = await import('@/lib/security-utils');
    const sanitizedTitle = sanitizeAIContent(insight.title);
    const sanitizedContent = sanitizeAIContent(insight.content);
    const sanitizedTranslations = {} as Record<SupportedLocale, string>;
    for (const key in insight.translations) {
      sanitizedTranslations[key as SupportedLocale] = sanitizeAIContent(insight.translations[key as SupportedLocale]);
    }
    const sanitizedActions = Array.isArray(insight.actions)
      ? insight.actions.map(action => {
          const sanitizedAction = { ...action };
          if (sanitizedAction.title) sanitizedAction.title = sanitizeAIContent(sanitizedAction.title);
          if (sanitizedAction.description) sanitizedAction.description = sanitizeAIContent(sanitizedAction.description);
          return sanitizedAction;
        })
      : insight.actions;
    const { data, error } = await supabase
      .from('ai_insights')
      .insert({
        user_id: userId,
        insight_type: insight.insight_type,
        title: sanitizedTitle,
        content: sanitizedContent,
        confidence: insight.confidence,
        actionable: insight.actionable,
        actions: sanitizedActions,
        translations: sanitizedTranslations,
        locale,
      })
      .select('id')
      .single();
  
  if (error) {
    console.error('Failed to create insight:', error);
    throw new Error('Failed to create insight');
  }
  
  return data.id;
}

// ═══════════════════════════════════════════════════════════════
// Main Chat Function
// ═══════════════════════════════════════════════════════════════

export interface ChatResponse {
  messageId: string;
  conversationId: string;
  content: string;
  translations: Record<SupportedLocale, string>;
  confidence: number;
  recommendations?: Recommendation[];
  planId?: string;
  insightId?: string;
}

export async function generateIronCoachResponse(
  userId: string,
  message: string,
  options: {
    conversationId?: string;
    locale?: SupportedLocale;
    streaming?: boolean;
  } = {}
): Promise<ChatResponse> {
  const { conversationId, locale = 'en', streaming = false } = options;
  
  const supabase = await createClient();
  
  // Get user settings for language preference
  const { data: settings } = await supabase
    .from('user_settings')
    .select('language, preferred_language')
    .eq('user_id', userId)
    .single();
  
  const userLocale = (settings?.preferred_language || settings?.language || locale) as SupportedLocale;
  
  // Get or create conversation
  const convId = await getOrCreateConversation(supabase, userId, conversationId, userLocale);
  
  // Build user context
  const context = await buildUserContext(supabase, userId);
  
  // Build context prompt
  const contextPrompt = `
User Context:
- Goal: ${context.userGoal || 'Not set'}
- Workouts this week: ${context.workoutsThisWeek || 0}
- Protein adherence: ${context.proteinAdherencePct || 0}%
- Fatigue score: ${context.userState?.fatigueScore || 0}
- Recovery score: ${context.userState?.recoveryScore || 0}
- Momentum score: ${context.userState?.momentumScore || 0}
`;
  
  // Combine system prompt with context
  const fullSystemPrompt = `${getIronCoachSystemPrompt(userLocale)}\n\n${contextPrompt}`;
  
  // Generate response using Groq
  const content = await zaiGenerateChatCompletion({
    messages: [{ role: 'user', content: message }],
    temperature: 0.35,
    maxTokens: 1024,
    locale: userLocale,
    systemPrompt: fullSystemPrompt,
  });
  
  // Calculate confidence based on context quality
  const confidence = calculateConfidence(context, content.length);
  
  // Store user message
  await storeMessage(supabase, convId, userId, 'user', message, userLocale);
  
  // Store assistant message
  const messageId = await storeMessage(supabase, convId, userId, 'assistant', content, userLocale, {
    source: 'groq-llm',
    confidence,
    routingReason: 'Cloud completion via Groq',
  });
  
  // Update conversation timestamp
  await supabase
    .from('ai_conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', convId);
  
  // Generate training signal for the interaction
  await supabase.from('ai_training_signals').insert({
    user_id: userId,
    signal_type: 'chat_interaction',
    signal_data: {
      conversation_id: convId,
      message_id: messageId,
      message_length: message.length,
      response_length: content.length,
    },
    strength: 0.3,
  });
  
  return {
    messageId,
    conversationId: convId,
    content,
    translations: buildTranslatedContent(content, userLocale),
    confidence,
  };
}

// ═══════════════════════════════════════════════════════════════
// Streaming Chat
// ═══════════════════════════════════════════════════════════════

export async function* generateStreamingIronCoachResponse(
  userId: string,
  message: string,
  options: {
    conversationId?: string;
    locale?: SupportedLocale;
  } = {}
): AsyncGenerator<string, ChatResponse, unknown> {
  const { conversationId, locale = 'en' } = options;
  
  const supabase = await createClient();
  
  // Get user settings
  const { data: settings } = await supabase
    .from('user_settings')
    .select('language, preferred_language')
    .eq('user_id', userId)
    .single();
  
  const userLocale = (settings?.preferred_language || settings?.language || locale) as SupportedLocale;
  
  // Get or create conversation
  const convId = await getOrCreateConversation(supabase, userId, conversationId, userLocale);
  
  // Build user context
  const context = await buildUserContext(supabase, userId);
  
  const contextPrompt = `
User Context:
- Goal: ${context.userGoal || 'Not set'}
- Workouts this week: ${context.workoutsThisWeek || 0}
- Protein adherence: ${context.proteinAdherencePct || 0}%
- Fatigue score: ${context.userState?.fatigueScore || 0}
- Recovery score: ${context.userState?.recoveryScore || 0}
- Momentum score: ${context.userState?.momentumScore || 0}
`;
  
  // Store user message
  await storeMessage(supabase, convId, userId, 'user', message, userLocale);
  
  // Combine system prompt with context
  const fullSystemPrompt = `${getIronCoachSystemPrompt(userLocale)}\n\n${contextPrompt}`;
  
  // Stream response using Groq
  let fullContent = '';
  
  for await (const chunk of zaiGenerateStreamingChatCompletion({
    messages: [{ role: 'user', content: message }],
    temperature: 0.35,
    maxTokens: 1024,
    locale: userLocale,
    systemPrompt: fullSystemPrompt,
  })) {
    fullContent += chunk;
    yield chunk;
  }
  
  // Store complete assistant message
  const confidence = calculateConfidence(context, fullContent.length);
  const messageId = await storeMessage(supabase, convId, userId, 'assistant', fullContent, userLocale, {
    source: 'groq-llm',
    confidence,
    routingReason: 'Cloud streaming via Groq',
  });
  
  // Update conversation
  await supabase
    .from('ai_conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', convId);
  
  // Generate training signal
  await supabase.from('ai_training_signals').insert({
    user_id: userId,
    signal_type: 'chat_interaction',
    signal_data: {
      conversation_id: convId,
      message_id: messageId,
      streaming: true,
    },
    strength: 0.3,
  });
  
  return {
    messageId,
    conversationId: convId,
    content: fullContent,
    translations: buildTranslatedContent(fullContent, userLocale),
    confidence,
  };
}

// ═══════════════════════════════════════════════════════════════
// Adaptive Recommendations
// ═══════════════════════════════════════════════════════════════

/**
 * Generate adaptive workout recommendation
 */
export async function generateWorkoutRecommendation(
  userId: string,
  locale: SupportedLocale = 'en'
): Promise<Recommendation> {
  const supabase = await createClient();
  
  const context = await buildUserContext(supabase, userId);
  
  const prompt = `Generate a personalized workout for this user. Respond with JSON only.

User Context:
- Goal: ${context.userGoal}
- Workouts this week: ${context.workoutsThisWeek}
- Recovery score: ${context.userState?.recoveryScore}/100
- Fatigue score: ${context.userState?.fatigueScore}/100

Respond with JSON:
{
  "title": "Workout name",
  "description": "Brief description",
  "exercises": [{"name": "", "sets": 0, "reps": 0, "rest_seconds": 0}],
  "duration_minutes": 0,
  "intensity": "low|moderate|high"
}`;

  const content = await zaiGenerateChatCompletion({
    messages: [{ role: 'user', content: `You are a fitness expert. Respond with valid JSON only. Language: ${locale}\n\n${prompt}` }],
    temperature: 0.4,
    maxTokens: 800,
    locale,
  });
  
  let workoutData: Record<string, unknown> = {};
  
  try {
    // Parse and validate workout data with numeric bounds checking
    const parsed = JSON.parse(content);
    workoutData = validateWorkoutData(parsed);
  } catch {
    workoutData = { raw: content };
  }
  
  const recommendation: Recommendation = {
    recommendation_type: 'workout',
    title: (workoutData.title as string) || 'Personalized Workout',
    description: (workoutData.description as string) || 'Custom workout based on your goals',
    confidence: 0.85,
    translations: buildTranslatedContent((workoutData.description as string) || 'Custom workout', locale),
    related_data: workoutData,
  };
  
  await createRecommendation(supabase, userId, recommendation, locale);
  
  return recommendation;
}

/**
 * Generate adaptive meal recommendation
 */
export async function generateMealRecommendation(
  userId: string,
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  locale: SupportedLocale = 'en'
): Promise<Recommendation> {
  const supabase = await createClient();
  
  const context = await buildUserContext(supabase, userId);
  
  const prompt = `Generate a ${mealType} meal suggestion for this user. Include Tunisian cuisine options. Respond with JSON only.

User Context:
- Goal: ${context.userGoal}
- Protein adherence this week: ${context.proteinAdherencePct}%

Respond with JSON:
{
  "title": "Meal name",
  "description": "Brief description",
  "foods": [{"name": "", "portion": "", "calories": 0, "protein": 0}],
  "total_calories": 0,
  "total_protein": 0,
  "health_score": 0-100
}`;

  const content = await zaiGenerateChatCompletion({
    messages: [{ role: 'user', content: `You are a nutrition expert specializing in Tunisian cuisine. Respond with valid JSON only. Language: ${locale}\n\n${prompt}` }],
    temperature: 0.4,
    maxTokens: 800,
    locale,
  });
  
  let mealData: Record<string, unknown> = {};
  
  try {
    // Parse and validate meal data with numeric bounds checking
    const parsed = JSON.parse(content);
    mealData = validateMealData(parsed);
  } catch {
    mealData = { raw: content };
  }
  
  const recommendation: Recommendation = {
    recommendation_type: 'meal',
    title: (mealData.title as string) || `${mealType} Suggestion`,
    description: (mealData.description as string) || 'Nutritious meal option',
    confidence: 0.85,
    translations: buildTranslatedContent((mealData.description as string) || 'Nutritious meal', locale),
    related_data: mealData,
  };
  
  await createRecommendation(supabase, userId, recommendation, locale);
  
  return recommendation;
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export {
  t,
  getIronCoachSystemPrompt,
  buildTranslatedContent,
  getOrCreateConversation,
  storeMessage,
  createRecommendation,
  createPlan,
  createInsight,
  buildUserContext,
};

export type { SupportedLocale, RecommendationType, ConversationRole };
