const cache = new Map<string, { value: string; expiresAt: number }>();

const DEFAULT_TTL_MS = 1000 * 60 * 5;
const MAX_ITEMS = 200;

/**
 * Generate a cache key including locale for language-specific caching
 * Locale ensures that responses in different languages are cached separately
 */
function makeKey(model: string, prompt: string, locale = 'en'): string {
  return `${model}::${locale}::${prompt.trim().toLowerCase()}`;
}

export function getCachedPromptResult(model: string, prompt: string, locale = 'en'): string | null {
  const key = makeKey(model, prompt, locale);
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

export function setCachedPromptResult(model: string, prompt: string, value: string, ttlMs = DEFAULT_TTL_MS, locale = 'en'): void {
  if (cache.size >= MAX_ITEMS) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }

  cache.set(makeKey(model, prompt, locale), {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}
