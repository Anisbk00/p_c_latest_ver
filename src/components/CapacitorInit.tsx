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
      // ── Hide native splash AFTER React splash is visible ─────
      // Wait for React to render its own splash screen before hiding native one.
      // This prevents the visual "double splash" flash on mobile.
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide({ fadeOutDuration: 0 }); // Instant swap — React splash is underneath
      } catch (e) {
        // Silently ignore on web
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

      // ── Register for push notifications ────────────────────
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Request permission and register
        await PushNotifications.requestPermissions();

        PushNotifications.addListener('registration', async (token) => {
          try {
            const { notificationService } = await import('@/lib/notifications/service');
            const { Device } = await import('@capacitor/device');
            const deviceInfo = await Device.getInfo();

            await notificationService.registerDevice({
              device_token: token.value,
              device_type: isAndroid ? 'android' : 'ios',
              device_name: `${deviceInfo.platform} ${deviceInfo.osVersion}`,
            });
          } catch (err) {
            console.warn('[Cap] Failed to register push token:', err);
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.warn('[Cap] Push registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          // Handle foreground notification - update badge count via app context or event
          // The NotificationCenter subscribes to realtime, so in-app updates are automatic
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          // Handle notification tap - navigate to deep link
          const deepLink = action.notification.data?.deepLink;
          if (deepLink) {
            window.location.href = deepLink;
          }
        });

        await PushNotifications.register();
      } catch (e) {
        console.warn('[Cap] Push notification setup failed:', e);
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
