'use client';

/**
 * LocaleBridge
 *
 * Connects AppContext.userSettings.language → LocaleProvider.
 * Placed inside <AppProvider> so it always has access to the latest
 * language setting, including optimistic updates from the Settings page.
 *
 * Handles:
 * - Initial locale from server-fetched user settings
 * - Immediate re-render when language changes in Settings
 *
 * @module components/i18n/LocaleBridge
 */

import { useApp } from '@/contexts/app-context';
import { LocaleProvider } from '@/lib/i18n/locale-context';
import type { Locale } from '@/lib/i18n/translations';

const VALID_LOCALES = new Set<Locale>(['en', 'fr']);

function toLocale(raw: string | null | undefined): Locale {
  if (raw && VALID_LOCALES.has(raw as Locale)) return raw as Locale;
  return 'en';
}

interface LocaleBridgeProps {
  children: React.ReactNode;
}

export function LocaleBridge({ children }: LocaleBridgeProps) {
  const { userSettings } = useApp();
  const locale = toLocale(userSettings?.language);

  // Key forces React to re-mount LocaleProvider when locale changes,
  // ensuring all child components get the new translations
  return (
    <LocaleProvider key={locale} locale={locale}>
      {children}
    </LocaleProvider>
  );
}
