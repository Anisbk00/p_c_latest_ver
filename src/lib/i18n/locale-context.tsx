'use client';

/**
 * Locale Context
 *
 * Single source of truth for locale state in the React tree.
 * Reads language from AppContext (user_settings.language).
 * Sets <html lang> and <html dir> imperatively on change.
 * Provides: t(), locale, dir, isRTL, and all formatters.
 *
 * Usage:
 *   const { t, locale, dir, formatCalories, formatDate } = useLocale();
 *   <p>{t('home.calories.consumed')}</p>
 *
 * @module lib/i18n/locale-context
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { resolveTranslation, isRTL, LOCALE_BCP47, type Locale, type TranslationKey } from './translations';
import {
  formatInteger,
  formatDecimal,
  formatPercent,
  formatDistance,
  formatWeight,
  formatCalories,
  formatGrams,
  formatDuration,
  formatPace,
  formatDate,
  formatDateShort,
  formatTime,
  formatRelativeDate,
  getFoodName,
  type LocalizedFood,
} from './formatters';

// ─────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────

export interface LocaleContextValue {
  /** Current locale */
  locale: Locale;
  /** Current text direction */
  dir: 'ltr' | 'rtl';
  /** True when locale is Arabic */
  isRTL: boolean;
  /** BCP-47 language tag (e.g. 'ar-SA') */
  bcp47: string;

  /** Translate a key */
  t: (key: TranslationKey) => string;

  // ── Formatters (bound to current locale) ─────────────────
  formatInteger: (value: number) => string;
  formatDecimal: (value: number, decimals?: number) => string;
  formatPercent: (value: number) => string;
  formatDistance: (meters: number, useImperial?: boolean) => string;
  formatWeight: (kg: number, useImperial?: boolean) => string;
  formatCalories: (kcal: number) => string;
  formatGrams: (g: number) => string;
  formatDuration: (minutes: number) => string;
  formatPace: (secPerKm: number) => string;
  formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  formatDateShort: (date: Date | string) => string;
  formatTime: (date: Date | string, use24h?: boolean) => string;
  formatRelativeDate: (date: Date | string) => string;
  getFoodName: (food: LocalizedFood) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

interface LocaleProviderProps {
  /** The locale value — typically from user_settings.language */
  locale: Locale;
  children: React.ReactNode;
}

export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';
  const bcp47 = LOCALE_BCP47[locale];

  // Imperatively update <html> attributes on locale change.
  // This is safe — it runs client-side only after hydration.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = bcp47;
    document.documentElement.dir = dir;
  }, [bcp47, dir]);

  // Memoised translate function
  const t = useCallback(
    (key: TranslationKey) => resolveTranslation(key, locale),
    [locale],
  );

  // Memoised formatter bundle (all bound to current locale)
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir,
      isRTL: rtl,
      bcp47,
      t,
      formatInteger: (v) => formatInteger(v, locale),
      formatDecimal: (v, d) => formatDecimal(v, locale, d),
      formatPercent: (v) => formatPercent(v, locale),
      formatDistance: (m, imp) => formatDistance(m, locale, imp),
      formatWeight: (kg, imp) => formatWeight(kg, locale, imp),
      formatCalories: (kcal) => formatCalories(kcal, locale),
      formatGrams: (g) => formatGrams(g, locale),
      formatDuration: (min) => formatDuration(min, locale),
      formatPace: (s) => formatPace(s, locale),
      formatDate: (d, opts) => formatDate(d, locale, opts),
      formatDateShort: (d) => formatDateShort(d, locale),
      formatTime: (d, h24) => formatTime(d, locale, h24),
      formatRelativeDate: (d) => formatRelativeDate(d, locale),
      getFoodName: (f) => getFoodName(f, locale),
    }),
    [locale, dir, rtl, bcp47, t],
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Graceful fallback — never throw in production
    const fallback: LocaleContextValue = {
      locale: 'en',
      dir: 'ltr',
      isRTL: false,
      bcp47: 'en-US',
      t: (key) => resolveTranslation(key, 'en'),
      formatInteger: (v) => formatInteger(v, 'en'),
      formatDecimal: (v, d) => formatDecimal(v, 'en', d),
      formatPercent: (v) => formatPercent(v, 'en'),
      formatDistance: (m, imp) => formatDistance(m, 'en', imp),
      formatWeight: (kg, imp) => formatWeight(kg, 'en', imp),
      formatCalories: (kcal) => formatCalories(kcal, 'en'),
      formatGrams: (g) => formatGrams(g, 'en'),
      formatDuration: (min) => formatDuration(min, 'en'),
      formatPace: (s) => formatPace(s, 'en'),
      formatDate: (d, opts) => formatDate(d, 'en', opts),
      formatDateShort: (d) => formatDateShort(d, 'en'),
      formatTime: (d, h24) => formatTime(d, 'en', h24),
      formatRelativeDate: (d) => formatRelativeDate(d, 'en'),
      getFoodName: (f) => getFoodName(f, 'en'),
    };
    return fallback;
  }
  return ctx;
}
