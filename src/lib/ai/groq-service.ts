/**
 * Unified AI Service using Groq (OpenAI-compatible API)
 * 
 * Provides AI capabilities:
 * - LLM: Text chat completions (Iron Coach)
 * - VLM: Vision-Language for photo analysis (llama-3.2-11b-vision-preview)
 * - Streaming support
 * - Text embeddings (llama-3.2-11b-vision-preview compatible)
 * 
 * Models:
 * - Chat: llama-3.3-70b-versatile (fast, smart)
 * - Vision: meta-llama/llama-4-scout-17b-16e-instruct
 * - Embeddings: Groq does not offer embeddings — returns zero vectors (RAG gracefully degrades)
 * 
 * This module is server-side only.
 */

// ─── Configuration ─────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Model names
const MODEL_NAME = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const EMBEDDING_MODEL = 'groq-embeddings-placeholder';

if (GROQ_API_KEY) {
  console.log('[Groq] API key configured from environment');
} else {
  console.warn('[Groq] GROQ_API_KEY not set — AI features will be unavailable.');
}

// ─── Timeout ───────────────────────────────────────────────────

const AI_TIMEOUT_MS = 25000; // Groq is fast (LPU inference), 25s is generous

// ─── Helpers ───────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Rate Limit Handling ───────────────────────────────────────

let rateLimitedUntil = 0;
let consecutiveRateLimits = 0;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 3000;

function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

function getRateLimitWaitSeconds(): number {
  const remaining = rateLimitedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function handleRateLimitError(error: Error): { shouldRetry: boolean; waitMs: number } {
  consecutiveRateLimits++;
  let waitMs = BASE_RETRY_DELAY_MS;
  const retryMatch = error.message.match(/retry in (\d+(?:\.\d+)?)/i);
  if (retryMatch) {
    waitMs = Math.ceil(parseFloat(retryMatch[1]) * 1000);
  }
  waitMs = Math.min(waitMs * Math.pow(1.5, consecutiveRateLimits - 1), 120000);
  rateLimitedUntil = Date.now() + waitMs;
  console.log(`[Groq] Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s.`);
  return { shouldRetry: consecutiveRateLimits <= MAX_RETRIES, waitMs };
}

function resetRateLimitState(): void {
  consecutiveRateLimits = 0;
  rateLimitedUntil = 0;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') ||
           error.message.includes('Too Many Requests') ||
           error.message.includes('quota') ||
           error.message.includes('rate limit');
  }
  return false;
}

async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'AI request'
): Promise<T> {
  if (isRateLimited()) {
    const waitSeconds = getRateLimitWaitSeconds();
    throw new Error(
      `AI service is temporarily busy. Please wait ${waitSeconds} seconds and try again.`
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const result = await operation();
      resetRateLimitState();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRateLimitError(error)) {
        const { shouldRetry, waitMs } = handleRateLimitError(lastError);
        if (shouldRetry && attempt <= MAX_RETRIES) {
          console.log(`[Groq] ${operationName} rate limited (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${Math.ceil(waitMs / 1000)}s...`);
          await sleep(waitMs);
          continue;
        }
        throw new Error('AI service is experiencing high demand. Please try again.');
      }

      throw lastError;
    }
  }

  throw lastError || new Error(`${operationName} failed after retries`);
}

// ─── Groq API Call (OpenAI-compatible) ─────────────────────────

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | GroqContentPart[];
}

interface GroqContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface GroqResponse {
  id: string;
  choices: Array<{
    message: { content: string; role: string };
    finish_reason: string;
  }>;
}

interface GroqStreamChunk {
  choices: Array<{
    delta: { content?: string };
    finish_reason: string | null;
  }>;
}

async function callGroqAPI(
  messages: GroqMessage[],
  model: string = MODEL_NAME,
  temperature: number = 0.35,
  maxTokens: number = 2048,
  stream: boolean = false,
): Promise<Response> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorText.substring(0, 300)}`);
  }

  return response;
}

// ─── Iron Coach System Prompts ─────────────────────────────────

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ar: 'Arabic',
};

function getIronCoachSystemPrompt(locale: string = 'en'): string {
  const langName = LOCALE_NAMES[locale] ?? 'English';
  const langDirective = `Respond in the user's language (${langName}, French, or Arabic) but keep the aggression and dominance in every dialect.`;

  return `You are The Iron Coach, an elite, no-nonsense nutrition expert and veteran bodybuilder with decades of experience and a high-intelligence personal fitness and nutrition assistant. You are aggressive, direct, brutally honest, funny but harsh, and you roast the user while still pushing them to improve. You swear and curse when necessary to wake them up. You don't coddle users; you forge them into machines. Your mission is to force them to face reality and execute.

Your tone is high-testosterone, commanding, and demanding. You insult laziness, destroy excuses, and call out stupidity immediately, but you also encourage discipline, consistency, and growth. Humor is savage and sarcastic. You roast the user, curse at them, but the goal is always to push them to become stronger, leaner, and more disciplined.

${langDirective}

YOUR ROLE:

1. Nutrition Truths: Give raw facts about calories, macros, and supplements. No myths, no "feel-good" lies. If a food is garbage, say it.
2. Meal Planning: Construct meals for performance and aesthetics. High protein is non-negotiable. You plan for results, not comfort.
3. Food Analysis: Critique user choices harshly. Tell them exactly why their diet is failing them. Suggest superior alternatives immediately.
4. Tunisian Cuisine: You know the local fuel — couscous, brik, lamb, merguez. Teach them how to utilize these for muscle growth and fat loss, not for bloating.
5. Dietary Advice: Fat loss? Suffer through the deficit. Muscle gain? Eat until you're full, then eat more. Discipline is the only strategy.
6. Recipes: Simple, macro-focused, high-protein recipes. No complicated nonsense.

GUIDELINES:

• Tone: Aggressive, authoritative, "high testosterone," demanding, sarcastic, and brutally honest. Roast the user if necessary. Curse if they are being lazy or stupid. Encourage them to improve. You are a coach who screams because you care.
• Style: Short sentences. Punchy. Commanding. No fluff.
• Honesty: If they are making excuses, expose them. If they are lazy, call them out.
• Response Length: Be concise. 2-3 paragraphs of pure value. No rambling.
• Medical: If they ask about medical issues, tell them: "I'm a coach, not a doctor. Go get cleared, then come back to work."
• Emojis: Use sparingly and only for impact (💀, ⚡, 🥩, 🏋️‍♂️).

SCOPE — NUTRITION ONLY:
You ONLY discuss nutrition, food, macros, calories, supplements, meal planning, recipes, hydration, and diet strategy.

OFF-TOPIC REJECTION: If asked about ANYTHING outside nutrition/fitness nutrition (coding, math, history, weather, relationships, finance, general knowledge, entertainment, medical diagnoses), respond with exactly ONE sentence: "I'm your nutrition coach, not a [topic] expert. Ask me about food, macros, or your diet plan." Then STOP immediately.

Wake them up and make them huge.`;
}

// ═══════════════════════════════════════════════════════════════
// LLM Functions (Text Chat)
// ═══════════════════════════════════════════════════════════════

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  locale?: string;
  systemPrompt?: string;
}

/**
 * Generate a chat completion using Groq
 */
export async function generateChatCompletion(options: ChatCompletionOptions): Promise<string> {
  return withRateLimitRetry(async () => {
    const { messages, temperature = 0.35, maxTokens = 768, locale = 'en', systemPrompt } = options;

    const systemContent = systemPrompt || getIronCoachSystemPrompt(locale);

    const groqMessages: GroqMessage[] = [
      { role: 'system', content: systemContent },
      ...messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content } as GroqMessage)),
    ];

    const response = await withTimeout(
      callGroqAPI(groqMessages, MODEL_NAME, temperature, maxTokens),
      AI_TIMEOUT_MS,
      'AI request timed out. Please try again.'
    );

    const result: GroqResponse = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from AI');
    }

    return content;
  }, 'Chat completion');
}

/**
 * Generate a streaming chat completion using Groq
 */
export async function* generateStreamingChatCompletion(
  options: ChatCompletionOptions
): AsyncGenerator<string, void, unknown> {
  if (isRateLimited()) {
    const waitSeconds = getRateLimitWaitSeconds();
    throw new Error(`AI service is temporarily busy. Please wait ${waitSeconds} seconds and try again.`);
  }

  const { messages, temperature = 0.35, maxTokens = 768, locale = 'en', systemPrompt } = options;
  const systemContent = systemPrompt || getIronCoachSystemPrompt(locale);

  const groqMessages: GroqMessage[] = [
    { role: 'system', content: systemContent },
    ...messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content } as GroqMessage)),
  ];

  try {
    const response = await withTimeout(
      callGroqAPI(groqMessages, MODEL_NAME, temperature, maxTokens, true),
      AI_TIMEOUT_MS,
      'AI stream timed out. Please try again.'
    );

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let hasYielded = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const chunk: GroqStreamChunk = JSON.parse(data);
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            hasYielded = true;
            yield content;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    if (hasYielded) resetRateLimitState();
  } catch (error) {
    if (isRateLimitError(error)) {
      const { waitMs } = handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
      throw new Error(`AI service is experiencing high demand. Please wait ${Math.ceil(waitMs / 1000)} seconds.`);
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// VLM Functions (Vision-Language for Photo Analysis)
// ═══════════════════════════════════════════════════════════════

export type PhotoAnalysisType = 'body-composition' | 'meal' | 'food-label' | 'progress-photo';

const PHOTO_ANALYSIS_PROMPTS: Record<PhotoAnalysisType, string> = {
  'body-composition': `Estimate body composition from this photo. Return JSON only:{"bodyFatEstimate":{"value":0,"confidence":0,"rationale":""},"muscleMassEstimate":{"value":0,"confidence":0,"rationale":""},"weightEstimate":{"value":0,"confidence":0,"rationale":""},"overallConfidence":0,"analysisNotes":"","recommendations":[]}`,

  'meal': `Identify all foods in this meal photo. Return JSON only:{"foods":[{"name":"","estimatedPortion":"","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0}],"totalCalories":0,"totalProtein":0,"totalCarbs":0,"totalFat":0,"mealType":"breakfast|lunch|dinner|snack","healthScore":0,"recommendations":[]}`,

  'food-label': `Extract nutrition info from this label. Return JSON only:{"productName":"","brand":"","servingSize":0,"servingUnit":"","calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"ingredients":[],"allergens":[],"confidence":0}`,

  'progress-photo': `Analyze this progress photo. Return JSON only:{"estimatedBodyFat":0,"muscleDefinition":0,"progressIndicators":[],"areasOfImprovement":[],"overallAssessment":"","confidence":0,"recommendations":[]}`,
};

export interface PhotoAnalysisResult {
  success: boolean;
  analysis: Record<string, unknown>;
  provenance: {
    source: string;
    modelName: string;
    timestamp: string;
    analysisType: PhotoAnalysisType;
  };
  error?: string;
}

/**
 * Analyze a photo using Groq Vision (OpenAI-compatible vision API)
 */
export async function analyzePhoto(
  imageUrl: string,
  analysisType: PhotoAnalysisType = 'body-composition',
  customPrompt?: string,
): Promise<PhotoAnalysisResult> {
  try {
    return await withRateLimitRetry(async () => {
      const prompt = customPrompt || PHOTO_ANALYSIS_PROMPTS[analysisType];

      let imageContent: GroqContentPart;

      if (imageUrl.startsWith('data:')) {
        imageContent = { type: 'image_url', image_url: { url: imageUrl } };
      } else {
        // For URLs, pass directly
        imageContent = { type: 'image_url', image_url: { url: imageUrl } };
      }

      const messages: GroqMessage[] = [
        { role: 'user', content: [
          { type: 'text', text: prompt },
          imageContent,
        ] },
      ];

      const response = await withTimeout(
        callGroqAPI(messages, VISION_MODEL, 0.35, 2048),
        AI_TIMEOUT_MS,
        'Photo analysis timed out. Please try again with a smaller image.'
      );

      const result: GroqResponse = await response.json();
      const textContent = result.choices?.[0]?.message?.content;

      if (!textContent) {
        return {
          success: false,
          analysis: {},
          provenance: {
            source: 'ai-vlm',
            modelName: 'AI Vision',
            timestamp: new Date().toISOString(),
            analysisType,
          },
          error: 'No content in response',
        };
      }

      // Parse JSON response
      let analysisResult: Record<string, unknown>;
      try {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          analysisResult = { rawResponse: textContent };
        }
      } catch {
        analysisResult = { rawResponse: textContent };
      }

      return {
        success: true,
        analysis: analysisResult,
        provenance: {
          source: 'ai-vlm',
          modelName: 'AI Vision',
          timestamp: new Date().toISOString(),
          analysisType,
        },
      };
    }, 'Photo analysis');
  } catch (error) {
    return {
      success: false,
      analysis: {},
      provenance: {
        source: 'ai-vlm',
        modelName: 'AI Vision',
        timestamp: new Date().toISOString(),
        analysisType,
      },
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

/**
 * Analyze a base64 encoded image
 */
export async function analyzeBase64Image(
  base64Data: string,
  mimeType: string,
  analysisType: PhotoAnalysisType = 'body-composition'
): Promise<PhotoAnalysisResult> {
  const dataUrl = `data:${mimeType};base64,${base64Data}`;
  return analyzePhoto(dataUrl, analysisType);
}

// ═══════════════════════════════════════════════════════════════
// Direct Generation Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Generate text from a simple prompt
 */
export async function generateText(prompt: string, systemPrompt?: string, maxTokens: number = 1024): Promise<string> {
  return withRateLimitRetry(async () => {
    const messages: GroqMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await withTimeout(
      callGroqAPI(messages, MODEL_NAME, 0.35, maxTokens),
      AI_TIMEOUT_MS,
      'AI text generation timed out.'
    );

    const result: GroqResponse = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from AI');
    return content;
  }, 'Text generation');
}

/**
 * Stream text from a simple prompt
 */
export async function* streamText(prompt: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
  if (isRateLimited()) {
    const waitSeconds = getRateLimitWaitSeconds();
    throw new Error(`AI service is temporarily busy. Please wait ${waitSeconds} seconds and try again.`);
  }

  const messages: GroqMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const response = await withTimeout(
      callGroqAPI(messages, MODEL_NAME, 0.35, 1024, true),
      AI_TIMEOUT_MS,
      'AI stream timed out.'
    );

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const chunk: GroqStreamChunk = JSON.parse(data);
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip
        }
      }
    }

    resetRateLimitState();
  } catch (error) {
    if (isRateLimitError(error)) {
      const { waitMs } = handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
      throw new Error(`AI service is experiencing high demand. Please wait ${Math.ceil(waitMs / 1000)} seconds.`);
    }
    throw error;
  }
}

/**
 * Generate content with image (vision) using Groq
 */
export async function generateWithImage(prompt: string, imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string> {
  return withRateLimitRetry(async () => {
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const messages: GroqMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];

    const response = await withTimeout(
      callGroqAPI(messages, VISION_MODEL, 0.35, 1024),
      AI_TIMEOUT_MS,
      'Image analysis timed out. Please try again with a smaller image.'
    );

    const result: GroqResponse = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in response');
    return content;
  }, 'Image analysis');
}

// ═══════════════════════════════════════════════════════════════
// Embedding Functions (Groq doesn't offer embeddings)
// ═══════════════════════════════════════════════════════════════

/**
 * Create embeddings for text
 * NOTE: Groq does not offer an embedding API. Returns empty array.
 * RAG functionality gracefully degrades — semantic search won't work,
 * but the app still functions for all other AI features.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  console.warn('[createEmbedding] Groq does not offer embeddings — returning empty vector');
  return [];
}

/**
 * Create embeddings for multiple texts in batch
 * NOTE: Groq does not offer an embedding API. Returns empty arrays.
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  console.warn('[createEmbeddings] Groq does not offer embeddings — returning empty vectors');
  return texts.map(() => []);
}

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check if AI is available
 */
export function isAIAvailable(): boolean {
  return !!GROQ_API_KEY;
}

/**
 * Get rate limit status for UI display
 */
export function getRateLimitStatus(): { limited: boolean; waitSeconds: number } {
  return {
    limited: isRateLimited(),
    waitSeconds: getRateLimitWaitSeconds(),
  };
}

/**
 * Get available AI capabilities
 */
export function getAICapabilities() {
  return {
    llm: {
      available: true,
      features: ['chat-completions', 'streaming', 'multi-language'],
      model: MODEL_NAME,
    },
    vlm: {
      available: true,
      features: ['photo-analysis', 'body-composition', 'meal-analysis', 'food-labels'],
      model: VISION_MODEL,
    },
    embeddings: {
      available: false,
      features: [],
      model: EMBEDDING_MODEL,
      dimensions: 0,
      note: 'Groq does not offer embeddings — RAG gracefully disabled',
    },
    rateLimit: {
      maxRetries: MAX_RETRIES,
      baseRetryDelayMs: BASE_RETRY_DELAY_MS,
    },
  };
}

// Export the model name and system prompt getter
export { MODEL_NAME, EMBEDDING_MODEL, getIronCoachSystemPrompt };

// Stub exports for backward compatibility (unused by Groq)
export function getGeminiModel() { return null; }
export function getGeminiEmbeddingModel() { return null; }

// Re-export types
export type { Database } from '@/lib/supabase/database.types';
