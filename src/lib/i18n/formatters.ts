/**
 * Locale-aware formatters for numbers, dates, and fitness units.
 *
 * All formatters accept a locale string and produce correctly
 * formatted output — including Arabic-Indic numerals for 'ar'.
 *
 * @module lib/i18n/formatters
 */

import type { Locale } from './translations';
import { LOCALE_BCP47 } from './translations';

// ─────────────────────────────────────────────────────────────
// Number formatting
// ─────────────────────────────────────────────────────────────

/** Format an integer (e.g. calories) */
export function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_BCP47[locale], {
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a decimal number with specified fraction digits */
export function formatDecimal(value: number, locale: Locale, decimals = 1): string {
  return new Intl.NumberFormat(LOCALE_BCP47[locale], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format a percentage */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_BCP47[locale], {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

// ─────────────────────────────────────────────────────────────
// Fitness unit formatting
// ─────────────────────────────────────────────────────────────

const UNIT_LABELS: Record<Locale, { km: string; mi: string; kg: string; lbs: string; kcal: string; g: string; min: string; h: string; bpm: string }> = {
  en: { km: 'km', mi: 'mi', kg: 'kg', lbs: 'lbs', kcal: 'kcal', g: 'g', min: 'min', h: 'h', bpm: 'bpm' },
  fr: { km: 'km', mi: 'mi', kg: 'kg', lbs: 'lbs', kcal: 'kcal', g: 'g', min: 'min', h: 'h', bpm: 'bpm' },
  ar: { km: 'كم', mi: 'ميل', kg: 'كغ', lbs: 'رطل', kcal: 'سعرة', g: 'غ', min: 'دقيقة', h: 'س', bpm: 'ن/د' },
};

export function formatDistance(meters: number, locale: Locale, useImperial = false): string {
  const labels = UNIT_LABELS[locale];
  if (useImperial) {
    const miles = meters / 1609.34;
    return `${formatDecimal(miles, locale, 2)} ${labels.mi}`;
  }
  const km = meters / 1000;
  return `${formatDecimal(km, locale, 2)} ${labels.km}`;
}

export function formatWeight(kg: number, locale: Locale, useImperial = false): string {
  const labels = UNIT_LABELS[locale];
  if (useImperial) {
    const lbs = kg * 2.20462;
    return `${formatDecimal(lbs, locale, 1)} ${labels.lbs}`;
  }
  return `${formatDecimal(kg, locale, 1)} ${labels.kg}`;
}

export function formatCalories(kcal: number, locale: Locale): string {
  const labels = UNIT_LABELS[locale];
  return `${formatInteger(kcal, locale)} ${labels.kcal}`;
}

export function formatGrams(g: number, locale: Locale): string {
  const labels = UNIT_LABELS[locale];
  return `${formatDecimal(g, locale, 1)}${labels.g}`;
}

/** Format duration in minutes → "1h 23min" / "23min" */
export function formatDuration(minutes: number, locale: Locale): string {
  const labels = UNIT_LABELS[locale];
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${formatInteger(m, locale)} ${labels.min}`;
  return `${formatInteger(h, locale)}${labels.h} ${formatInteger(m, locale)}${labels.min}`;
}

/** Format pace in seconds-per-km → "5:32 min/km" */
export function formatPace(secPerKm: number, locale: Locale): string {
  const labels = UNIT_LABELS[locale];
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  const secStr = sec.toString().padStart(2, '0');
  // For Arabic, convert digits via Intl
  const minFmt = formatInteger(min, locale);
  const secFmt = formatInteger(parseInt(secStr, 10), locale).padStart(2, '0');
  return `${minFmt}:${secFmt} ${labels.min}/${labels.km}`;
}

// ─────────────────────────────────────────────────────────────
// Date formatting
// ─────────────────────────────────────────────────────────────

export function formatDate(date: Date | string, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(d);
}

export function formatDateShort(date: Date | string, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: 'numeric',
    month: 'short',
  }).format(d);
}

export function formatTime(date: Date | string, locale: Locale, use24h = true): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  }).format(d);
}

export function formatRelativeDate(date: Date | string, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const labels = { en: 'Today', fr: "Aujourd'hui", ar: 'اليوم' };
    return labels[locale];
  }
  if (diffDays === 1) {
    const labels = { en: 'Yesterday', fr: 'Hier', ar: 'أمس' };
    return labels[locale];
  }
  if (diffDays < 7) {
    const labels = {
      en: `${diffDays} days ago`,
      fr: `Il y a ${diffDays} jours`,
      ar: `منذ ${formatInteger(diffDays, locale)} أيام`,
    };
    return labels[locale];
  }
  return formatDateShort(d, locale);
}

// ─────────────────────────────────────────────────────────────
// Food name resolution (global_foods table has name_en/fr/ar)
// ─────────────────────────────────────────────────────────────

export interface LocalizedFood {
  name?: string | null;
  name_en?: string | null;
  name_fr?: string | null;
  name_ar?: string | null;
}

/** Get the best food name for the current locale, falling back to English then generic name */
export function getFoodName(food: LocalizedFood, locale: Locale): string {
  const localeKey = `name_${locale}` as keyof LocalizedFood;
  return (food[localeKey] as string | null | undefined)
    ?? food.name_en
    ?? food.name
    ?? '';
}
