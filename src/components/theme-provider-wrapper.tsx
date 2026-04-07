"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/app-context";

export function ThemeProvider({ children, ...props }: any) {
  // Filter out the invalid object-typed 'value' prop.
  // next-themes expects value?: string. Passing an object causes
  // undefined behaviour (theme reverts to default on refresh).
  const { value, ...safeProps } = props;
  return (
    <NextThemesProvider {...safeProps}>
      {children}
    </NextThemesProvider>
  );
}

/**
 * ThemeSync - Syncs theme from AppContext to next-themes
 * 
 * IMPORTANT: This component reads theme from AppContext.userSettings,
 * NOT from useSettings hook. The useSettings hook was causing an
 * infinite loop of /api/settings calls.
 * 
 * AppContext already fetches settings via /api/profile during init.
 */
export function ThemeSync({ children }: { children: React.ReactNode }) {
  const { setTheme, theme: currentTheme } = useTheme();
  const { userSettings } = useApp();
  const lastSyncedTheme = useRef<string | null>(null);

  useEffect(() => {
    // Sync when userSettings.theme changes and differs from current
    if (userSettings?.theme && userSettings.theme !== lastSyncedTheme.current) {
      setTheme(userSettings.theme);
      lastSyncedTheme.current = userSettings.theme;
    }
  }, [userSettings?.theme, setTheme]);

  return <>{children}</>;
}
