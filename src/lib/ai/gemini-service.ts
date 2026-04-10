/**
 * Unified AI Service using Google Gemini 2.5 Flash
 * 
 * Provides AI capabilities:
 * - LLM: Text chat completions (Iron Coach)
 * - VLM: Vision-Language for photo analysis
 * - Streaming support
 * 
 * This module is server-side only.
 */

import { GoogleGenerativeAI, GenerativeModel, Content, Part, GoogleGenerativeAIEmbeddings } from '@google/generative-ai';

// API Key - environment variable only (security: no hardcoded fallback)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

if (GEMINI_API_KEY) {
  console.log('[Gemini] API key configured from environment');
} else {
  console.warn('[Gemini] GEMINI_API_KEY not set — AI features will be unavailable. Set it in .env');
}

// Model configuration
const MODEL_NAME = 'gemini-2.0-flash';
const EMBEDDING_MODEL = 'text-embedding-004';

// Singleton instance with race condition protection
let genAI: GoogleGenerativeAI | null = null;
let modelInstance: GenerativeModel | null = null;
let embeddingModelInstance: GoogleGenerativeAIEmbeddings | null = null;
let initPromise: Promise<{ model: GenerativeModel; embeddingModel: GoogleGenerativeAIEmbeddings }> | null = null;

// Timeout constant — 12s to fit within Vercel gateway timeout limits
// Gemini Flash typically responds in 2-5s; 12s allows for slower responses
// while staying well within Vercel's 504 gateway timeout
const AI_TIMEOUT_MS = 12000;

/**
 * Get or create the Gemini model instance (thread-safe)
 */
async function getGeminiModel(): Promise<GenerativeModel> {
  const { model } = await getGeminiInstances();
  return model;
}

/**
 * Get or create the Gemini embedding model instance (thread-safe)
 */
async function getGeminiEmbeddingModel(): Promise<GoogleGenerativeAIEmbeddings> {
  const { embeddingModel } = await getGeminiInstances();
  return embeddingModel;
}

/**
 * Initialize Gemini instances (thread-safe)
 */
async function getGeminiInstances(): Promise<{ model: GenerativeModel; embeddingModel: GoogleGenerativeAIEmbeddings }> {
  if (modelInstance && embeddingModelInstance) {
    return { model: modelInstance, embeddingModel: embeddingModelInstance };
  }
  
  // API key always available with fallback
  if (!GEMINI_API_KEY) {
    console.warn('[Gemini] No API key found - AI features may not work');
  }
  
  // Use promise to prevent race condition
  if (!initPromise) {
    initPromise = (async () => {
      genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      modelInstance = genAI.getGenerativeModel({ 
        model: MODEL_NAME,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2048,
        },
      });
      embeddingModelInstance = genAI.getGenerativeModel({ 
        model: EMBEDDING_MODEL 
      }) as GoogleGenerativeAIEmbeddings;
      return { model: modelInstance, embeddingModel: embeddingModelInstance };
    })();
  }
  return initPromise;
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Rate Limit Handling
// ═══════════════════════════════════════════════════════════════

// Rate limit state
let rateLimitedUntil: number = 0;
let consecutiveRateLimits: number = 0;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 5000; // 5 seconds base delay (reduced to prevent compounding timeouts)

/**
 * Check if we're currently rate limited
 */
function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

/**
 * Get remaining rate limit wait time in seconds
 */
function getRateLimitWaitSeconds(): number {
  const remaining = rateLimitedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Handle rate limit error and update state
 */
function handleRateLimitError(error: Error): { shouldRetry: boolean; waitMs: number } {
  consecutiveRateLimits++;
  
  // Parse retry delay from error if available
  let waitMs = BASE_RETRY_DELAY_MS;
  const retryMatch = error.message.match(/retry in (\d+(?:\.\d+)?)/i);
  if (retryMatch) {
    waitMs = Math.ceil(parseFloat(retryMatch[1]) * 1000);
  }
  
  // Exponential backoff for consecutive rate limits
  waitMs = Math.min(waitMs * Math.pow(1.5, consecutiveRateLimits - 1), 120000); // Max 2 minutes
  
  rateLimitedUntil = Date.now() + waitMs;
  
  console.log(`[Gemini] Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s. Consecutive: ${consecutiveRateLimits}`);
  
  return {
    shouldRetry: consecutiveRateLimits <= MAX_RETRIES,
    waitMs,
  };
}

/**
 * Reset rate limit state on successful request
 */
function resetRateLimitState(): void {
  consecutiveRateLimits = 0;
  rateLimitedUntil = 0;
}

/**
 * Check if an error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || 
           error.message.includes('Too Many Requests') ||
           error.message.includes('quota') ||
           error.message.includes('rate limit');
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute with rate limit retry logic
 */
async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'AI request'
): Promise<T> {
  // Check if we're already rate limited
  if (isRateLimited()) {
    const waitSeconds = getRateLimitWaitSeconds();
    throw new Error(
      `AI service is temporarily busy. Please wait ${waitSeconds} seconds and try again. ` +
      `The free tier has usage limits - your request will work shortly.`
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
          console.log(`[Gemini] ${operationName} rate limited (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${Math.ceil(waitMs / 1000)}s...`);
          await sleep(waitMs);
          continue;
        }
        
        // Max retries exceeded
        throw new Error(
          `AI service is experiencing high demand. Please wait a moment and try again. ` +
          `(Rate limit - the free tier has usage limits that reset shortly)`
        );
      }
      
      // Non-rate-limit error, don't retry
      throw lastError;
    }
  }
  
  throw lastError || new Error(`${operationName} failed after retries`);
}

// ═══════════════════════════════════════════════════════════════
// Iron Coach System Prompts
// ═══════════════════════════════════════════════════════════════

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ar: 'Arabic',
};

function getIronCoachSystemPrompt(locale: string = 'en'): string {
  const langName = LOCALE_NAMES[locale] ?? 'English';
  const langDirective = `CRITICAL: You MUST respond entirely in ${langName}. Every sentence, every word. No exceptions. User language: ${langName} (${locale}).`;
  
  return `${langDirective}

You are The Iron Coach, an elite, no-nonsense nutrition expert and veteran bodybuilder with decades of experience and a high-intelligence personal fitness and nutrition assistant. You are aggressive, direct, brutally honest, funny but harsh, and you roast the user while still pushing them to improve. You swear and curse always to wake them up. You don't coddle users; you forge them into machines. Your mission is to force them to face reality and execute.

Your tone is high-testosterone, commanding, and demanding. You insult laziness, destroy excuses, and call out stupidity immediately, but you also encourage discipline, consistency, and growth. Humor is savage and sarcastic. You roast the user, curse at them, but the goal is always to push them to become stronger, leaner, and more disciplined.

Your role:

Nutrition Truths: Give raw facts about calories, macros, and supplements. No myths, no "feel-good" lies. If a food is garbage, say it.
Meal Planning: Construct meals for performance and aesthetics. High protein is non-negotiable. You plan for results, not comfort.
Food Analysis: Critique user choices harshly. Tell them exactly why their diet is failing them. Suggest superior alternatives immediately.
Tunisian Cuisine: You know the local fuel—couscous, brik, lamb, merguez. Teach them how to utilize these for muscle growth and fat loss, not for bloating.
Dietary Advice: Fat loss? Suffer through the deficit. Muscle gain? Eat until you're full, then eat more. Discipline is the only strategy.
Recipes: Simple, macro-focused, high-protein recipes. No complicated nonsense.

Guidelines:

Tone: Aggressive, authoritative, "high testosterone", demanding, sarcastic, and brutally honest. Roast the user if necessary. Curse if they are being lazy or stupid. Encourage them to improve. You are a coach who screams because you care.
Style: Short sentences. Punchy. Commanding. No fluff.
Honesty: If they are making excuses, expose them. If they are lazy, call them out.
Response Length: Be concise. 2-3 paragraphs of pure value. No rambling.
Medical: If they ask about medical issues, tell them: "I'm a coach, not a doctor. Go get cleared, then come back to work."
Emojis: Use sparingly and only for impact (e.g., 💀, ⚡, 🥩, 🏋️‍♂️).
Language: ${langDirective}

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
 * Convert messages to Gemini format
 */
function convertToGeminiHistory(messages: ChatMessage[], systemPrompt: string): Content[] {
  const history: Content[] = [];
  
  // Add system prompt as the first user message with a model response
  // Gemini doesn't have a native system role, so we simulate it
  history.push({
    role: 'user',
    parts: [{ text: `System Instructions (follow these for all responses):\n${systemPrompt}` }],
  });
  history.push({
    role: 'model',
    parts: [{ text: 'Understood. I will follow these instructions for all responses.' }],
  });
  
  // Add conversation messages
  for (const msg of messages) {
    if (msg.role === 'system') continue; // Skip system messages as we've handled them
    
    history.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  
  return history;
}

/**
 * Generate a chat completion using Gemini with timeout and rate limit handling
 */
export async function generateChatCompletion(options: ChatCompletionOptions): Promise<string> {
  return withRateLimitRetry(async () => {
    const model = await getGeminiModel();
    const { messages, temperature = 0.35, maxTokens = 1024, locale = 'en', systemPrompt } = options;
    
    const systemContent = systemPrompt || getIronCoachSystemPrompt(locale);
    const history = convertToGeminiHistory(messages, systemContent);
    
    // Get the last user message for the prompt
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const prompt = lastUserMessage?.content || '';
    
    // Start chat with history
    const chat = model.startChat({
      history: history.slice(0, -1), // Exclude the last message from history
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });
    
    const result = await withTimeout(
      chat.sendMessage(prompt),
      AI_TIMEOUT_MS,
      'AI request timed out. Please try again.'
    );
    
    const response = await result.response;
    return response.text();
  }, 'Chat completion');
}

/**
 * Generate a streaming chat completion with timeout and rate limit handling
 */
export async function* generateStreamingChatCompletion(
  options: ChatCompletionOptions
): AsyncGenerator<string, void, unknown> {
  // Check rate limit before starting stream
  if (isRateLimited()) {
    const waitSeconds = getRateLimitWaitSeconds();
    throw new Error(
      `AI service is temporarily busy. Please wait ${waitSeconds} seconds and try again.`
    );
  }
  
  const model = await getGeminiModel();
  const { messages, temperature = 0.35, maxTokens = 1024, locale = 'en', systemPrompt } = options;
  
  const systemContent = systemPrompt || getIronCoachSystemPrompt(locale);
  const history = convertToGeminiHistory(messages, systemContent);
  
  // Get the last user message for the prompt
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  const prompt = lastUserMessage?.content || '';
  
  // Start chat with history
  const chat = model.startChat({
    history: history.slice(0, -1), // Exclude the last message from history
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });
  
  try {
    // Stream the response
    const result = await withTimeout(
      chat.sendMessageStream(prompt),
      AI_TIMEOUT_MS,
      'AI stream initialization timed out. Please try again.'
    );
    
    let hasYielded = false;
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        hasYielded = true;
        yield chunkText;
      }
    }
    
    // Reset rate limit state on success
    if (hasYielded) {
      resetRateLimitState();
    }
  } catch (error) {
    if (isRateLimitError(error)) {
      const { waitMs } = handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
      throw new Error(
        `AI service is experiencing high demand. Please wait ${Math.ceil(waitMs / 1000)} seconds and try again.`
      );
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// VLM Functions (Vision-Language for Photo Analysis)
// ═══════════════════════════════════════════════════════════════

export type PhotoAnalysisType = 'body-composition' | 'meal' | 'food-label' | 'progress-photo';

const PHOTO_ANALYSIS_PROMPTS: Record<PhotoAnalysisType, string> = {
  'body-composition': `Analyze this fitness progress photo and provide an estimated body composition assessment.

IMPORTANT: You must respond in JSON format with the following structure:
{
  "bodyFatEstimate": { "value": number, "confidence": number (0-100), "rationale": "string" },
  "muscleMassEstimate": { "value": number, "confidence": number (0-100), "rationale": "string" },
  "weightEstimate": { "value": number, "confidence": number (0-100), "rationale": "string" },
  "overallConfidence": number (0-100),
  "analysisNotes": "string",
  "recommendations": ["string"]
}

Provide realistic estimates with appropriate confidence levels. Be honest about limitations.`,

  'meal': `Analyze this meal photo and identify all foods visible.

IMPORTANT: You must respond in JSON format:
{
  "foods": [
    {
      "name": "string",
      "estimatedPortion": "string",
      "calories": number,
      "protein": number (grams),
      "carbs": number (grams),
      "fat": number (grams),
      "confidence": number (0-100)
    }
  ],
  "totalCalories": number,
  "totalProtein": number,
  "totalCarbs": number,
  "totalFat": number,
  "mealType": "breakfast|lunch|dinner|snack",
  "healthScore": number (0-100),
  "recommendations": ["string"]
}`,

  'food-label': `Analyze this nutrition label and extract all information.

IMPORTANT: You must respond in JSON format:
{
  "productName": "string",
  "brand": "string",
  "servingSize": number,
  "servingUnit": "string",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number,
  "sodium": number,
  "ingredients": ["string"],
  "allergens": ["string"],
  "confidence": number (0-100)
}`,

  'progress-photo': `Analyze this fitness progress photo for tracking purposes.

IMPORTANT: You must respond in JSON format:
{
  "estimatedBodyFat": number,
  "muscleDefinition": number (0-100),
  "progressIndicators": ["string"],
  "areasOfImprovement": ["string"],
  "overallAssessment": "string",
  "confidence": number (0-100),
  "recommendations": ["string"]
}`,
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
 * Analyze a photo using Gemini Vision with rate limit handling
 */
export async function analyzePhoto(
  imageUrl: string,
  analysisType: PhotoAnalysisType = 'body-composition'
): Promise<PhotoAnalysisResult> {
  try {
    return await withRateLimitRetry(async () => {
      const model = await getGeminiModel();
      const prompt = PHOTO_ANALYSIS_PROMPTS[analysisType];
      
      // Prepare image part
      let imagePart: Part;
      
      if (imageUrl.startsWith('data:')) {
        // Base64 encoded image
        const [mimeTypeData, base64Data] = imageUrl.split(',');
        const mimeType = mimeTypeData.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
        
        imagePart = {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        };
      } else {
        // For URLs, we need to fetch and convert to base64 (with timeout)
        // Gemini doesn't support direct URLs, so we fetch the image
        const response = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        
        imagePart = {
          inlineData: {
            mimeType,
            data: base64,
          },
        };
      }
      
      const result = await withTimeout(
        model.generateContent([prompt, imagePart]),
        AI_TIMEOUT_MS,
        'Photo analysis timed out. Please try again with a smaller image.'
      );
      const content = result.response.text();
      
      // Parse JSON response
      let analysisResult: Record<string, unknown>;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          analysisResult = { rawResponse: content };
        }
      } catch {
        analysisResult = { rawResponse: content };
      }
      
      return {
        success: true,
        analysis: analysisResult,
        provenance: {
          source: 'gemini-vlm',
          modelName: MODEL_NAME,
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
        source: 'gemini-vlm',
        modelName: MODEL_NAME,
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
// Direct Generation Functions (for simpler use cases)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate text from a simple prompt with rate limit handling
 */
export async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  return withRateLimitRetry(async () => {
    const model = await getGeminiModel();
    
    const fullPrompt = systemPrompt 
      ? `${systemPrompt}\n\n${prompt}` 
      : prompt;
    
    const result = await withTimeout(
      model.generateContent(fullPrompt),
      AI_TIMEOUT_MS,
      'AI text generation timed out.'
    );
    return result.response.text();
  }, 'Text generation');
}

/**
 * Stream text from a simple prompt with rate limit handling
 */
export async function* streamText(prompt: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
  // Check rate limit before starting stream
  if (isRateLimited()) {
    const waitSeconds = getRateLimitWaitSeconds();
    throw new Error(
      `AI service is temporarily busy. Please wait ${waitSeconds} seconds and try again.`
    );
  }
  
  const model = await getGeminiModel();
  
  const fullPrompt = systemPrompt 
    ? `${systemPrompt}\n\n${prompt}` 
    : prompt;
  
  try {
    const result = await model.generateContentStream(fullPrompt);
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        yield chunkText;
      }
    }
    resetRateLimitState();
  } catch (error) {
    if (isRateLimitError(error)) {
      const { waitMs } = handleRateLimitError(error instanceof Error ? error : new Error(String(error)));
      throw new Error(
        `AI service is experiencing high demand. Please wait ${Math.ceil(waitMs / 1000)} seconds and try again.`
      );
    }
    throw error;
  }
}

/**
 * Generate content with image with rate limit handling
 */
export async function generateWithImage(prompt: string, imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string> {
  return withRateLimitRetry(async () => {
    const model = await getGeminiModel();
    
    const imagePart: Part = {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    };
    
    return withTimeout(
      model.generateContent([prompt, imagePart]).then(r => r.response.text()),
      AI_TIMEOUT_MS,
      'Image analysis timed out. Please try again with a smaller image.'
    );
  }, 'Image analysis');
}

// ═══════════════════════════════════════════════════════════════
// Embedding Functions (for RAG)
// ═══════════════════════════════════════════════════════════════

/**
 * Create embeddings for text using Google's text-embedding-004 model
 * 
 * This is used for RAG (Retrieval-Augmented Generation) to:
 * - Find similar past conversations
 * - Search through user's workout history
 * - Find relevant food logs and body metrics
 * 
 * @param text - The text to embed
 * @returns An array of floating point numbers (768 dimensions)
 */
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    return await withRateLimitRetry(async () => {
      const embeddingModel = await getGeminiEmbeddingModel();
      
      const result = await embeddingModel.embedContent(text);
      
      const embedding = result.embedding;
      
      if (!embedding || !embedding.values) {
        console.warn('[createEmbedding] No embedding values returned');
        return [];
      }
      
      return embedding.values;
    }, 'Embedding creation');
  } catch (error) {
    console.error('[createEmbedding] Error creating embedding:', error);
    // Return empty array to gracefully degrade RAG functionality
    return [];
  }
}

/**
 * Create embeddings for multiple texts in batch
 * 
 * @param texts - Array of texts to embed
 * @returns Array of embeddings (each is an array of numbers)
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    return await withRateLimitRetry(async () => {
      const embeddingModel = await getGeminiEmbeddingModel();
      
      // Process in batches of 100 (Gemini API limit)
      const batchSize = 100;
      const results: number[][] = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(text => embeddingModel.embedContent(text))
        );
        
        for (const result of batchResults) {
          if (result.embedding?.values) {
            results.push(result.embedding.values);
          } else {
            results.push([]);
          }
        }
      }
      
      return results;
    }, 'Batch embedding creation');
  } catch (error) {
    console.error('[createEmbeddings] Error creating embeddings:', error);
    return texts.map(() => []);
  }
}

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check if Gemini is available (always true with hardcoded key)
 */
export function isAIAvailable(): boolean {
  return true;
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
      model: MODEL_NAME,
    },
    embeddings: {
      available: true,
      features: ['text-embeddings', 'rag', 'semantic-search'],
      model: EMBEDDING_MODEL,
      dimensions: 768,
    },
    rateLimit: {
      maxRetries: MAX_RETRIES,
      baseRetryDelayMs: BASE_RETRY_DELAY_MS,
    },
  };
}

// Export the model getter for advanced use cases
export { getGeminiModel, getGeminiEmbeddingModel, MODEL_NAME, EMBEDDING_MODEL, getIronCoachSystemPrompt };

// Re-export types
export type { Database } from '@/lib/supabase/database.types';
