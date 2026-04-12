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

import { buildHybridCoachSystemPrompt } from '@/lib/iron-coach/hybrid/prompt-template';

// ─── Configuration ─────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Model names
const MODEL_NAME = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
// Fallback text models — tried in order if primary is rate-limited/overloaded.
// Each model has a SEPARATE rate limit pool on Groq, so if one is at daily limit,
// the others likely still have quota.
const FALLBACK_TEXT_MODELS = [
  'llama-3.1-8b-instant',    // Llama 3.1 8B — fastest
  'llama-3.3-70b-versatile',  // Llama 3.3 70B — smart, separate rate pool
];
// EMBEDDING_MODEL removed — Groq does not offer embeddings

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
  waitMs = Math.min(waitMs * Math.pow(1.2, consecutiveRateLimits - 1), 15000);
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
           error.message.includes('rate limit') ||
           error.message.includes('high demand');
  }
  return false;
}

async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'AI request'
): Promise<T> {
  // Don't pre-check isRateLimited() — let the actual API call attempt first.
  // The retry loop handles rate-limit errors with backoff.

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
  temperature: number = 0.2,
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

// ─── Iron Coach System Prompt (single source of truth) ──────────
// Imported from prompt-template to avoid duplication drift
// Note: import is hoisted by TS/JS module system regardless of position

function getIronCoachSystemPrompt(locale: string = 'en'): string {
  return buildHybridCoachSystemPrompt(locale, 'aggressive');
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
 * Generate a chat completion using Groq with model fallback chain.
 * Tries primary model first, then falls through to fallback models
 * on 429/rate-limit/overload errors.
 */
export async function generateChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const { messages, temperature = 0.2, maxTokens = 200, locale = 'en', systemPrompt } = options;
  const systemContent = systemPrompt || getIronCoachSystemPrompt(locale);

  const groqMessages: GroqMessage[] = [
    { role: 'system', content: systemContent },
    ...messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content } as GroqMessage)),
  ];

  // Try primary model, then fallbacks
  const modelsToTry = [MODEL_NAME, ...FALLBACK_TEXT_MODELS];

  for (const model of modelsToTry) {
    try {
      const response = await withTimeout(
        callGroqAPI(groqMessages, model, temperature, maxTokens),
        AI_TIMEOUT_MS,
        'AI request timed out. Please try again.'
      );

      const result: GroqResponse = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from AI');
      }

      resetRateLimitState();
      if (model !== MODEL_NAME) {
        console.log(`[Groq] Primary model busy/rate-limited, used fallback: ${model}`);
      }
      return content;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isRetryable = errMsg.includes('429') || errMsg.includes('rate limit') ||
                           errMsg.includes('high demand') || errMsg.includes('503') ||
                           errMsg.includes('overloaded') || errMsg.includes('Too Many') ||
                           errMsg.includes('400') || errMsg.includes('decommissioned') ||
                           errMsg.includes('no longer supported');

      if (isRetryable && model !== modelsToTry[modelsToTry.length - 1]) {
        console.log(`[Groq] Model ${model} rate-limited for chat, trying fallback...`);
        continue;
      }

      // Non-rate-limit error or last model failed
      if (isRetryable) {
        handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  throw new Error('All AI models unavailable. Please try again later.');
}

/**
 * Generate a streaming chat completion using Groq with model fallback chain.
 */
export async function* generateStreamingChatCompletion(
  options: ChatCompletionOptions
): AsyncGenerator<string, void, unknown> {
  const { messages, temperature = 0.2, maxTokens = 200, locale = 'en', systemPrompt } = options;
  const systemContent = systemPrompt || getIronCoachSystemPrompt(locale);

  const groqMessages: GroqMessage[] = [
    { role: 'system', content: systemContent },
    ...messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content } as GroqMessage)),
  ];

  // Try primary model, then fallbacks
  const modelsToTry = [MODEL_NAME, ...FALLBACK_TEXT_MODELS];

  for (const model of modelsToTry) {
    try {
      const response = await withTimeout(
        callGroqAPI(groqMessages, model, temperature, maxTokens, true),
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

      if (hasYielded) {
        resetRateLimitState();
        if (model !== MODEL_NAME) {
          console.log(`[Groq] Primary model busy/rate-limited, used fallback: ${model}`);
        }
        return; // Success
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isRetryable = errMsg.includes('429') || errMsg.includes('rate limit') ||
                           errMsg.includes('high demand') || errMsg.includes('503') ||
                           errMsg.includes('overloaded') || errMsg.includes('Too Many') ||
                           errMsg.includes('400') || errMsg.includes('decommissioned') ||
                           errMsg.includes('no longer supported');

      if (isRetryable && model !== modelsToTry[modelsToTry.length - 1]) {
        console.log(`[Groq] Model ${model} rate-limited for stream, trying fallback...`);
        continue;
      }

      if (isRetryable) {
        handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
        throw new Error('AI service is experiencing high demand. Please try again.');
      }
      throw error;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// VLM Functions (Vision-Language for Photo Analysis)
// ═══════════════════════════════════════════════════════════════

export type PhotoAnalysisType = 'body-composition' | 'meal' | 'food-label' | 'progress-photo';

const PHOTO_ANALYSIS_PROMPTS: Record<PhotoAnalysisType, string> = {
  'body-composition': `You are a PRECISE body composition analyst. Estimate body fat % and muscle mass from this photo.

CRITICAL RULES:
- Body fat: average 15-25%, athlete 8-15%, bodybuilder 4-8%. Be CONSERVATIVE — most people overestimate leanness.
- Muscle mass: ~35-50% of lean body mass. If you estimate 80kg at 20% BF, lean mass = 64kg, muscle ≈ 25-32kg. Stay in range.
- Do NOT return impossible combinations (e.g., 5% BF with 15kg muscle on a 80kg person).
- Confidence should reflect uncertainty: poor lighting = lower confidence, heavy clothing = lower confidence.

Return ONLY valid JSON:{"bodyFatEstimate":{"value":0,"confidence":0,"rationale":""},"muscleMassEstimate":{"value":0,"confidence":0,"rationale":""},"weightEstimate":{"value":0,"confidence":0,"rationale":""},"overallConfidence":0,"analysisNotes":"","recommendations":[]}`,

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

      const imageContent: GroqContentPart = { type: 'image_url', image_url: { url: imageUrl } };

      const messages: GroqMessage[] = [
        // System message enforces strict JSON output
        { role: 'system', content: 'You are a precise body composition analyst. Return ONLY valid JSON. No explanations, no disclaimers, no markdown. Muscle mass and body fat MUST be physically consistent: Lean Mass = Weight × (1 - BF%/100), Muscle ≈ 40-50% of lean mass. Never return impossible combinations.' },
        { role: 'user', content: [
          { type: 'text', text: prompt },
          imageContent,
        ] },
      ];

      const response = await withTimeout(
        callGroqAPI(messages, VISION_MODEL, 0.2, 2048),
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

      // Parse JSON response — handle various formats:
      // 1. Clean JSON
      // 2. JSON wrapped in markdown code block
      // 3. JSON with text before/after
      let analysisResult: Record<string, unknown>;
      try {
        // Try direct parse first
        const trimmed = textContent.trim();
        if (trimmed.startsWith('{')) {
          // Find matching closing brace (handle nested objects)
          let depth = 0;
          let endIdx = -1;
          for (let i = 0; i < trimmed.length; i++) {
            if (trimmed[i] === '{') depth++;
            else if (trimmed[i] === '}') depth--;
            if (depth === 0) { endIdx = i; break; }
          }
          if (endIdx > 0) {
            analysisResult = JSON.parse(trimmed.slice(0, endIdx + 1));
          } else {
            analysisResult = JSON.parse(trimmed);
          }
        } else {
          // Try extracting JSON from text (code block or inline)
          const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
          if (codeBlockMatch) {
            analysisResult = JSON.parse(codeBlockMatch[1].trim());
          } else {
            // Fallback: find first { to last matching }
            const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0]);
            } else {
              analysisResult = { rawResponse: textContent };
            }
          }
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
 * Generate text from a simple prompt (with fallback models)
 * @param model - Optional specific model to use (skips primary/fallback chain)
 */
export async function generateText(prompt: string, systemPrompt?: string, maxTokens: number = 384, preferredModel?: string): Promise<string> {
  const messages: GroqMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  // If a specific model is requested, use it directly (no fallback chain)
  const modelsToTry = preferredModel ? [preferredModel] : [MODEL_NAME, ...FALLBACK_TEXT_MODELS];

  for (const model of modelsToTry) {
    try {
      const response = await withTimeout(
        callGroqAPI(messages, model, 0.2, maxTokens),
        AI_TIMEOUT_MS,
        'AI text generation timed out.'
      );

      const result: GroqResponse = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from AI');
      
      resetRateLimitState();
      if (model !== MODEL_NAME) {
        console.log(`[Groq] Primary model busy, used fallback: ${model}`);
      }
      return content;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isEmpty = errMsg === 'Empty response from AI';
      const isRetryable = errMsg.includes('429') || errMsg.includes('high demand') || 
                           errMsg.includes('rate limit') || errMsg.includes('busy') ||
                           errMsg.includes('503');

      if (isRetryable && model !== modelsToTry[modelsToTry.length - 1]) {
        console.log(`[Groq] Model ${model} overloaded for generateText, trying fallback...`);
        continue;
      }

      // Non-retryable error or last model failed
      if (isRetryable) {
        handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  throw new Error('All AI models unavailable');
}

/**
 * Stream text from a simple prompt (with fallback models)
 */
export async function* streamText(prompt: string, systemPrompt?: string, maxTokens: number = 200): AsyncGenerator<string, void, unknown> {
  const messages: GroqMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  // Try primary model first, then fallbacks
  const modelsToTry = [MODEL_NAME, ...FALLBACK_TEXT_MODELS];
  
  for (const model of modelsToTry) {
    try {
      const response = await withTimeout(
        callGroqAPI(messages, model, 0.35, maxTokens, true),
        AI_TIMEOUT_MS,
        'AI stream timed out.'
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
            // Skip
          }
        }
      }

      if (hasYielded) {
        resetRateLimitState();
        if (model !== MODEL_NAME) {
          console.log(`[Groq] Primary model busy, used fallback: ${model}`);
        }
        return; // Success
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isRetryable = errMsg.includes('429') || errMsg.includes('high demand') || 
                           errMsg.includes('rate limit') || errMsg.includes('busy') ||
                           errMsg.includes('503');
      
      if (isRetryable && model !== modelsToTry[modelsToTry.length - 1]) {
        console.log(`[Groq] Model ${model} overloaded, trying fallback...`);
        continue; // Try next fallback model
      }
      
      // Non-rate-limit error or last model failed
      if (isRetryable) {
        handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
        throw new Error(`AI service is experiencing high demand. Please try again.`);
      }
      throw error;
    }
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
export { MODEL_NAME, getIronCoachSystemPrompt };

// Re-export types
export type { Database } from '@/lib/supabase/database.types';
