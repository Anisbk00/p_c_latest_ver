/**
 * Iron Coach Cloud Completion - Using Groq
 * 
 * AI service using Groq (llama-3.3-70b-versatile) for:
 * - Text completions (Iron Coach chat)
 * 
 * This provides AI-powered coaching responses.
 */

import { generateText, streamText, MODEL_NAME } from '@/lib/ai/gemini-service';
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
 * Stream a prompt completion using Groq with real token streaming
 */
export async function streamCloudPrompt(options: CloudStreamOptions & { locale?: string; tone?: CoachingTone }): Promise<string> {
  const { prompt, onToken, signal, locale = 'en', userQuestion } = options;
  
  // Extract the user's actual question
  const actualQuestion = userQuestion || (typeof prompt === 'string' ? extractUserQuestion(prompt) : 'fitness question') || 'fitness question';
  
  console.log('[streamCloudPrompt] Starting for question:', actualQuestion?.slice(0, 100));
  
  // Check if aborted before starting
  if (signal?.aborted) {
    console.log('[streamCloudPrompt] Aborted before start');
    return '';
  }
  
  let effectiveSystemPrompt: string | undefined;
  let effectiveUserPrompt: string;
  let hasRichContext = false;

  if (typeof prompt === 'object' && prompt.system && prompt.user) {
    // Rich context from buildContextPrompt — already split into system + user
    hasRichContext = true;
    effectiveSystemPrompt = prompt.system;
    effectiveUserPrompt = prompt.user;
    console.log('[streamCloudPrompt] Using rich context prompt (pre-split), user part length:', effectiveUserPrompt.length);
  } else {
    // Plain string prompt (legacy path or simple prompts)
    const promptStr = typeof prompt === 'string' ? prompt : String(prompt);
    hasRichContext = promptStr.length > Math.max((userQuestion?.length || 50) + 100, 200);
    
    if (hasRichContext) {
      // Legacy rich prompt — split on USER'S QUESTION delimiter
      const questionIdx = promptStr.indexOf("=== USER'S QUESTION ===");
      if (questionIdx > 0) {
        effectiveSystemPrompt = promptStr.slice(0, questionIdx).trim();
        effectiveUserPrompt = promptStr.slice(questionIdx).trim();
      } else {
        effectiveUserPrompt = promptStr;
      }
      console.log('[streamCloudPrompt] Using legacy rich context prompt, user part length:', effectiveUserPrompt.length);
    } else {
      effectiveSystemPrompt = getDefaultSystemPrompt(locale, 'aggressive');
      effectiveUserPrompt = `USER QUESTION: ${actualQuestion}

Respond as Iron Coach. Be aggressive, helpful, and brief. Answer the specific question directly.`;
      console.log('[streamCloudPrompt] Using simple prompt (no context), length:', effectiveUserPrompt.length);
    }
  }

  // Only use cache for simple prompts WITHOUT user data context
  const cached = !hasRichContext ? getCachedPromptResult(MODEL_NAME, typeof prompt === 'string' ? prompt : JSON.stringify(prompt), locale) : null;
  if (cached) {
    console.log('[streamCloudPrompt] Using cached response (simple prompt)');
    for (const ch of cached) onToken(ch);
    return cached;
  }

  try {
    let fullText = '';
    
    // Use real streaming for premium UX — tokens appear as they're generated
    const stream = streamText(effectiveUserPrompt, effectiveSystemPrompt);
    
    for await (const token of stream) {
      if (signal?.aborted) {
        console.log('[streamCloudPrompt] Aborted during streaming');
        return fullText;
      }
      fullText += token;
      onToken(token);
    }
    
    console.log('[streamCloudPrompt] AI response length:', fullText?.length || 0);

    if (!fullText?.trim()) {
      console.log('[streamCloudPrompt] Empty AI response, returning fallback');
      const fallback = "Listen up! I'm having a moment here. Try asking me again in a few seconds. The AI gods are taking a quick breather. 💪";
      for (const ch of fallback) onToken(ch);
      return fallback;
    }

    // Cache simple prompts only (not context-rich)
    if (!hasRichContext) {
      setCachedPromptResult(MODEL_NAME, typeof prompt === 'string' ? prompt : JSON.stringify(prompt), fullText, undefined, locale);
    }
    return fullText;
  } catch (error) {
    console.error('[streamCloudPrompt] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('busy') || errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('high demand')) {
      const rateLimitMsg = "Whoa there, soldier! 🛑 The AI is getting hammered right now. Wait 15-30 seconds and try again. The free tier has limits, but I'll be back to roast you soon! 💪";
      for (const ch of rateLimitMsg) onToken(ch);
      return rateLimitMsg;
    }
    
    const errorFallback = `Damn it! Something went wrong: ${errorMessage.slice(0, 100)}. Try again in a moment. 💀`;
    for (const ch of errorFallback) onToken(ch);
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
