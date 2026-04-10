/**
 * Multilingual AI Output
 *
 * Wraps any AI-generated text in the canonical multi-language structure:
 * { en: "...", fr: "...", ar: "..." }
 *
 * When the LLM is available, it generates all three translations in a single
 * call. When offline or no API key is present, the source language is stored
 * and the other locales fall back gracefully.
 *
 * The `pick()` helper resolves the right locale at render time.
 *
 * @module lib/ai/multilingual-output
 */

import { completeCloudPrompt } from '@/lib/iron-coach/hybrid/cloud';

export type SupportedLocale = 'en' | 'fr' | 'ar';

export interface MultilingualContent {
  en: string;
  fr: string;
  ar: string;
}

export interface MultilingualAIOutput {
  user_id: string;
  recommendation_type: 'workout' | 'meal' | 'habit' | 'insight' | 'nudge' | 'plan';
  content: MultilingualContent;
  confidence: number;
  locale_generated: SupportedLocale; // which locale the source was
  related_ids: {
    workout_id?: string;
    food_id?: string;
    plan_id?: string;
    insight_id?: string;
  };
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Translation generation
// ─────────────────────────────────────────────────────────────

/**
 * Take a source text and generate all three locale versions.
 * Returns a MultilingualContent object.
 * If translation fails, falls back to the source text for all locales.
 */
export async function generateMultilingualContent(
  sourceText: string,
  sourceLocale: SupportedLocale = 'en',
): Promise<MultilingualContent> {
  // If already have all 3, return as-is (caller pre-built them)
  const translationPrompt = `You are a precise fitness/nutrition translator.
Translate the following text into English, French, and Arabic.
Return ONLY a JSON object with keys "en", "fr", "ar". No markdown. No preamble.

Source language: ${sourceLocale}
Text to translate:
"""
${sourceText}
"""

Return format:
{"en":"...","fr":"...","ar":"..."}`;

  try {
    const raw = await completeCloudPrompt(translationPrompt, `You are a translator. Return only JSON with keys en, fr, ar.`);
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as { en?: string; fr?: string; ar?: string };

    return {
      en: parsed.en ?? (sourceLocale === 'en' ? sourceText : ''),
      fr: parsed.fr ?? (sourceLocale === 'fr' ? sourceText : ''),
      ar: parsed.ar ?? (sourceLocale === 'ar' ? sourceText : ''),
    };
  } catch {
    // Graceful fallback: copy source to all locales
    return { en: sourceText, fr: sourceText, ar: sourceText };
  }
}

/**
 * Wrap a plain string into a full MultilingualAIOutput structure.
 */
export async function wrapOutput(params: {
  userId: string;
  type: MultilingualAIOutput['recommendation_type'];
  content: string;
  sourceLocale: SupportedLocale;
  confidence?: number;
  relatedIds?: MultilingualAIOutput['related_ids'];
}): Promise<MultilingualAIOutput> {
  const multilingual = await generateMultilingualContent(params.content, params.sourceLocale);

  return {
    user_id: params.userId,
    recommendation_type: params.type,
    content: multilingual,
    confidence: params.confidence ?? 0.8,
    locale_generated: params.sourceLocale,
    related_ids: params.relatedIds ?? {},
    generated_at: new Date().toISOString(),
  };
}

/**
 * Pick the right locale string from a MultilingualContent object.
 * Falls back: requested → en → first non-empty.
 */
export function pick(content: MultilingualContent, locale: SupportedLocale): string {
  return content[locale] || content.en || content.fr || content.ar || '';
}

/**
 * Build a MultilingualContent from an object that may already contain
 * pre-translated fields (e.g. global_foods.name_en/fr/ar).
 */
export function fromTranslatedFields(fields: {
  name?: string | null;
  name_en?: string | null;
  name_fr?: string | null;
  name_ar?: string | null;
}): MultilingualContent {
  const base = fields.name ?? '';
  return {
    en: fields.name_en ?? base,
    fr: fields.name_fr ?? base,
    ar: fields.name_ar ?? base,
  };
}
