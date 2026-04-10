"use client";

import React from "react";
import { useTheme } from "next-themes";
import { UserSettings } from "@/lib/types/settings";
import { ThemeSelector } from "./ThemeSelector";
import { useLocale } from "@/lib/i18n";

export const AppearanceSettings = React.memo(function AppearanceSettings({ 
  settings, 
  updateSettings,
  isThemePreview,
  setThemePreview
}: { 
  settings: UserSettings; 
  updateSettings: (updates: Partial<UserSettings>) => void;
  isThemePreview: boolean;
  setThemePreview: (theme: string | null) => void;
}) {
  const { setTheme } = useTheme();
  const { t } = useLocale();

  // Direct selection - no hover preview, no dirty state
  const handleSelect = (themeId: string) => {
    setTheme(themeId);
    updateSettings({ theme: themeId as UserSettings['theme'] });
  };

  return (
    <div className="space-y-8 relative pb-24">
      {/* Theme Selection */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t('appearance.theme.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('appearance.theme.description')}</p>
        </div>
        <ThemeSelector 
          currentTheme={settings.theme}
          onSelect={handleSelect}
        />
      </section>
    </div>
  );
});
