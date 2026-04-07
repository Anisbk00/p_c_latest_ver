/**
 * i18n barrel export
 *
 * Import everything from here:
 *   import { useLocale, LocaleProvider, type Locale } from '@/lib/i18n'
 *
 * @module lib/i18n
 */

export { LocaleProvider, useLocale } from './locale-context';
export type { LocaleContextValue } from './locale-context';

export {
  resolveTranslation,
  isRTL,
  LOCALE_BCP47,
  TRANSLATIONS,
  RTL_LOCALES,
} from './translations';
export type { Locale, TranslationKey } from './translations';

export {
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
} from './formatters';
export type { LocalizedFood } from './formatters';
