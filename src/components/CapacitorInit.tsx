'use client';

/**
 * CapacitorInit – Client component that bootstraps Capacitor-specific
 * behaviour when the app is running inside a native shell.
 *
 * Drop this component into the root layout so it runs once on mount.
 * On web it's a no-op (renders nothing).
 */

import { useEffect } from 'react';
import { isNative, isAndroid, isIOS } from '@/lib/capacitor';

export function CapacitorInit() {
  useEffect(() => {
    if (!isNative) return;

    let cleanupFns: Array<() => void> = [];

    async function bootstrap() {
      // ── Hide splash screen after a brief delay ─────────────
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide({ fadeOutDuration: 300 });
      } catch (e) {
        console.warn('[Cap] SplashScreen hide failed', e);
      }

      // ── Configure status bar ───────────────────────────────
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        if (isAndroid) {
          await StatusBar.setBackgroundColor({ color: '#0a0a0a' });
          await StatusBar.setOverlaysWebView({ overlay: false });
        }
      } catch (e) {
        console.warn('[Cap] StatusBar config failed', e);
      }

      // ── Handle Android hardware back button ────────────────
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });
        cleanupFns.push(() => listener.remove());
      } catch (e) {
        console.warn('[Cap] App back-button handler failed', e);
      }

      // ── Listen to app state changes (pause / resume) ──────
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', ({ isActive }) => {
          console.log(`[Cap] App ${isActive ? 'resumed' : 'paused'}`);
        });
        cleanupFns.push(() => listener.remove());
      } catch (e) {
        console.warn('[Cap] App state listener failed', e);
      }

      // ── Keyboard adjustments on iOS ────────────────────────
      if (isIOS) {
        try {
          const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
          await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
          await Keyboard.setScroll({ isDisabled: false });
        } catch (e) {
          console.warn('[Cap] Keyboard config failed', e);
        }
      }
    }

    bootstrap();

    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  // This component renders nothing
  return null;
}
