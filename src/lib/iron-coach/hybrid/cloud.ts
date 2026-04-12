/**
 * Iron Coach Cloud Completion - Using Groq
 * 
 * AI service using Groq (llama-3.3-70b-versatile) for:
 * - Text completions (Iron Coach chat)
 * 
 * This provides AI-powered coaching responses.
 */

import { generateText, streamText } from '@/lib/ai/groq-service';

// Groq model name for cache keys
const MODEL_NAME = 'groq-llama-3.3-70b';
import { getCachedPromptResult, setCachedPromptResult } from './prompt-cache';
import { buildHybridCoachSystemPrompt, type CoachingTone } from './prompt-template';

export interface CloudStreamOptions {
  prompt: string | { system: string; user: string };
  signal?: AbortSignal;
  onToken: (token: string) => void;
  /** The user's actual question */
  userQuestion?: string;
}

/**
 * Extract the user's question from the full prompt
 * The prompt format has the question at the end in quotes
 */
function extractUserQuestion(prompt: string): string {
  // Try to find the question section
  const questionMatch = prompt.match(/USER'S QUESTION.*?\n\n"([^"]+)"/s);
  if (questionMatch) {
    return questionMatch[1];
  }
  
  // Fallback: look for text in quotes at the end
  const quoteMatch = prompt.match(/"([^"]+)"\s*$/);
  if (quoteMatch) {
    return quoteMatch[1];
  }
  
  // Last resort: return the last line
  const lines = prompt.trim().split('\n');
  return lines[lines.length - 1] || '';
}

/**
 * Get the default system prompt for Iron Coach
 * Uses the shared prompt template system with tone support
 */
function getDefaultSystemPrompt(locale = 'en', tone: CoachingTone = 'aggressive'): string {
  return buildHybridCoachSystemPrompt(locale, tone);
}

/**
 * Complete a prompt using Groq with timeout handling
 */
export async function completeCloudPrompt(
  prompt: string, 
  systemPrompt?: string, 
  locale = 'en',
  tone: CoachingTone = 'aggressive'
): Promise<string> {
  // Check cache
  const cached = getCachedPromptResult(MODEL_NAME, prompt, locale);
  if (cached) return cached;

  // Determine full prompt
  const fullPrompt = systemPrompt 
    ? `${systemPrompt}\n\n${prompt}`
    : prompt;

  try {
    const content = await generateText(fullPrompt);
    
    // Cache the result with locale
    setCachedPromptResult(MODEL_NAME, prompt, content, undefined, locale);
    return content;
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      console.warn('[completeCloudPrompt] Request timed out');
      throw new Error('AI request timed out. Please try again.');
    }
    throw error;
  }
}

/**
 * Check if an error is a rate-limit / transient error worth retrying
 */
function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('rate limit') ||
    msg.includes('busy') ||
    msg.includes('quota') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('too many') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('503') ||
    msg.includes('502')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stream a prompt completion using Groq with real token streaming
 * streamText has built-in model fallback (70b → 8b → mixtral)
 */
export async function streamCloudPrompt(options: CloudStreamOptions & { locale?: string; tone?: CoachingTone }): Promise<string> {
  const { prompt, onToken, signal, locale = 'en', userQuestion } = options;
  
  const actualQuestion = userQuestion || (typeof prompt === 'string' ? extractUserQuestion(prompt) : 'fitness question') || 'fitness question';
  console.log('[streamCloudPrompt] Starting for question:', actualQuestion?.slice(0, 100));
  
  if (signal?.aborted) return '';
  
  let effectiveSystemPrompt: string | undefined;
  let effectiveUserPrompt: string;
  let hasRichContext = false;

  if (typeof prompt === 'object' && prompt.system && prompt.user) {
    hasRichContext = true;
    effectiveSystemPrompt = prompt.system;
    effectiveUserPrompt = prompt.user;
  } else {
    const promptStr = typeof prompt === 'string' ? prompt : String(prompt);
    hasRichContext = promptStr.length > Math.max((userQuestion?.length || 50) + 100, 200);
    
    if (hasRichContext) {
      const questionIdx = promptStr.indexOf("=== USER'S QUESTION ===");
      if (questionIdx > 0) {
        effectiveSystemPrompt = promptStr.slice(0, questionIdx).trim();
        effectiveUserPrompt = promptStr.slice(questionIdx).trim();
      } else {
        effectiveUserPrompt = promptStr;
      }
    } else {
      effectiveSystemPrompt = getDefaultSystemPrompt(locale, 'aggressive');
      effectiveUserPrompt = `USER QUESTION: ${actualQuestion}\n\nRespond as Iron Coach. Be aggressive, helpful, and brief. Answer the specific question directly.`;
    }
  }

  // Cache check for simple prompts
  const cached = !hasRichContext ? getCachedPromptResult(MODEL_NAME, typeof prompt === 'string' ? prompt : JSON.stringify(prompt), locale) : null;
  if (cached) {
    for (const ch of cached) onToken(ch);
    return cached;
  }

  // Single attempt — streamText handles model fallback internally
  try {
    let fullText = '';
    const stream = streamText(effectiveUserPrompt, effectiveSystemPrompt, 1024);
    
    for await (const token of stream) {
      if (signal?.aborted) return fullText;
      fullText += token;
      onToken(token);
    }
    
    console.log('[streamCloudPrompt] AI response length:', fullText?.length || 0);

    if (!fullText?.trim()) {
      const fallback = "Listen up! I'm having a moment here. Try asking me again in a few seconds. 💪";
      for (const ch of fallback) onToken(ch);
      return fallback;
    }

    if (!hasRichContext) {
      setCachedPromptResult(MODEL_NAME, typeof prompt === 'string' ? prompt : JSON.stringify(prompt), fullText, undefined, locale);
    }
    return fullText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[streamCloudPrompt] Error:', errorMessage);

    // NEVER show raw API errors to users — only a friendly message
    const userFallback = "💪 I'm slammed right now. Give me a sec and try again!";
    for (const ch of userFallback) onToken(ch);
    return userFallback;
  }
}

/**
 * Create an embedding (Groq does not offer embeddings - returns empty)
 */
export async function createCloudEmbedding(_input: string): Promise<number[]> {
  // Import dynamically to avoid circular dependencies
  const { createEmbedding } = await import('@/lib/ai/gemini-service');
  return createEmbedding(_input);
}
