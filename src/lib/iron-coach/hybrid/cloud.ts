/**
 * Iron Coach Cloud Completion - Using Groq
 * 
 * AI service using Groq (llama-3.3-70b-versatile) for:
 * - Text completions (Iron Coach chat)
 * 
 * This provides AI-powered coaching responses.
 */

import { generateText, MODEL_NAME } from '@/lib/ai/gemini-service';
import { getCachedPromptResult, setCachedPromptResult } from './prompt-cache';
import { buildHybridCoachSystemPrompt, type CoachingTone } from './prompt-template';

export interface CloudStreamOptions {
  prompt: string;
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
 * Stream a prompt completion using Groq
 */
export async function streamCloudPrompt(options: CloudStreamOptions & { locale?: string; tone?: CoachingTone }): Promise<string> {
  const { prompt, onToken, signal, locale = 'en', userQuestion } = options;
  
  // Extract the user's actual question
  const actualQuestion = userQuestion || extractUserQuestion(prompt) || 'fitness question';
  
  console.log('[streamCloudPrompt] Starting for question:', actualQuestion?.slice(0, 100));
  
  // Helper to stream text character by character
  const streamText = (text: string) => {
    for (const ch of text) {
      onToken(ch);
    }
  };
  
  // Check if aborted before starting
  if (signal?.aborted) {
    console.log('[streamCloudPrompt] Aborted before start');
    return '';
  }
  
  // Check cache with locale
  const cached = getCachedPromptResult(MODEL_NAME, prompt, locale);
  if (cached) {
    console.log('[streamCloudPrompt] Using cached response');
    streamText(cached);
    return cached;
  }

  // Detect if prompt contains rich context (from buildContextPrompt)
  // Rich prompts include system instructions + user data + question (>200 chars)
  // Simple prompts are just raw questions from non-context paths
  const hasRichContext = prompt.length > Math.max((userQuestion?.length || 50) + 100, 200);

  let effectiveUserPrompt: string;
  let effectiveSystemPrompt: string | undefined;

  if (hasRichContext) {
    // Rich context from buildContextPrompt — it already contains system + user data
    // Extract just the user prompt part (after the first system prompt block)
    // buildContextPrompt returns: systemPrompt + "\n\n" + userPromptWithAllData
    const systemEnd = prompt.indexOf('\n\n');
    if (systemEnd > 0 && systemEnd < 500) {
      // Split into system and user parts to use proper message roles
      effectiveSystemPrompt = prompt.slice(0, systemEnd);
      effectiveUserPrompt = prompt.slice(systemEnd + 2);
    } else {
      // Fallback: use entire prompt as user message
      effectiveUserPrompt = prompt;
    }
    console.log('[streamCloudPrompt] Using rich context prompt, user part length:', effectiveUserPrompt.length);
  } else {
    // No context — use system prompt + simple question (original behavior)
    effectiveSystemPrompt = getDefaultSystemPrompt(locale, 'aggressive');
    effectiveUserPrompt = `USER QUESTION: ${actualQuestion}

Respond as Iron Coach. Be aggressive, helpful, and brief. Answer the specific question directly.`;
    console.log('[streamCloudPrompt] Using simple prompt (no context), length:', effectiveUserPrompt.length);
  }

  try {
    // Generate response using AI
    const fullText = await generateText(effectiveUserPrompt, effectiveSystemPrompt);
    console.log('[streamCloudPrompt] AI response length:', fullText?.length || 0);

    if (signal?.aborted) {
      console.log('[streamCloudPrompt] Aborted after generation');
      return '';
    }

    // Stream and cache the response
    if (fullText && fullText.trim()) {
      streamText(fullText);
      setCachedPromptResult(MODEL_NAME, prompt, fullText, undefined, locale);
      return fullText;
    }
    
    // Return fallback if empty response
    console.log('[streamCloudPrompt] Empty AI response, returning fallback');
    const fallback = "Listen up! I'm having a moment here. Try asking me again in a few seconds. The AI gods are taking a quick breather. 💪";
    streamText(fallback);
    return fallback;
  } catch (error) {
    console.error('[streamCloudPrompt] Error:', error);
    
    // Check if it's a rate limit error
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('busy') || errorMessage.includes('quota') || errorMessage.includes('429')) {
      const rateLimitMsg = "Whoa there, soldier! 🛑 The AI is getting hammered right now. Wait 15-30 seconds and try again. The free tier has limits, but I'll be back to roast you soon! 💪";
      streamText(rateLimitMsg);
      return rateLimitMsg;
    }
    
    // Generic error fallback
    const errorFallback = `Damn it! Something went wrong: ${errorMessage.slice(0, 100)}. Try again in a moment. 💀`;
    streamText(errorFallback);
    return errorFallback;
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
