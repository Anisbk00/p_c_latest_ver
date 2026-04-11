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

        // Android: create notification channels (required for Android 13+)
        if (isAndroid) {
          try {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            const channelIds = ['default', 'workout_reminder', 'meal_reminder', 'streak_protection', 'achievement', 'daily_summary', 'motivational', 'hydration_reminder'];
            const channelNames = {
              default: 'General',
              workout_reminder: 'Workout Reminders',
              meal_reminder: 'Meal Reminders',
              streak_protection: 'Streak Alerts',
              achievement: 'Achievements',
              daily_summary: 'Daily Summary',
              motivational: 'Motivation',
              hydration_reminder: 'Hydration Reminders',
            };
            await LocalNotifications.createChannel({
              id: 'default',
              name: 'General',
              importance: 4, // HIGH
              visibility: 1, // PUBLIC
              vibration: true,
              sound: 'default',
              description: 'General notifications',
            });
            for (const id of channelIds) {
              await LocalNotifications.createChannel({
                id,
                name: channelNames[id as keyof typeof channelNames] || id,
                importance: 4,
                visibility: 1,
                vibration: true,
                sound: 'default',
                description: `${channelNames[id as keyof typeof channelNames] || id} notifications`,
              });
            }
          } catch (e) {
            console.warn('[Cap] Failed to create notification channels:', e);
          }
        }

        // Request permission and register
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive === 'granted') {
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
            // Foreground notification - in-app updates happen via Supabase Realtime
          });

          PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            // Handle notification tap - navigate to deep link
            const deepLink = action.notification.data?.deepLink;
            if (deepLink) {
              window.location.href = deepLink;
            }
          });

          await PushNotifications.register();
        } else {
          console.log('[Cap] Push permission not granted:', permStatus.receive);
        }
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

      // ── iOS Local Notifications (lock-screen without APNs) ──
      if (isIOS) {
        try {
          const { LocalNotifications } = await import('@capacitor/local-notifications');
          const { notificationService } = await import('@/lib/notifications/service');

          // Request local notification permission
          await LocalNotifications.requestPermissions();

          // Fetch user preferences to know what to schedule
          const prefs = await notificationService.getPreferences();
          const p = prefs.preferences;

          const notificationsToSchedule: Array<{
            id: string;
            title: string;
            body: string;
            schedule: { at: Date };
            extra?: Record<string, string>;
          }> = [];

          if (p && p.notifications_enabled) {
            const now = new Date();

            // Workout reminder
            if (p.workout_reminders_enabled) {
              const h = parseInt((p.preferred_morning_time || '08:00').split(':')[0], 10) || 8;
              const scheduled = new Date(now); scheduled.setHours(h, 0, 0, 0);
              if (scheduled > now) {
                notificationsToSchedule.push({
                  id: `local-workout-${now.toISOString().split('T')[0]}`,
                  title: 'Time to Workout! 💪',
                  body: "Don't break your streak! Your workout is waiting.",
                  schedule: { at: scheduled },
                  extra: { deepLink: '/workouts' },
                });
              }
            }

            // Meal reminders
            if (p.meal_reminders_enabled) {
              const meals = [
                { id: 'breakfast', title: 'Log Your Breakfast 🍽️', body: "Don't forget to track your breakfast.", hour: 8, link: '/foods' },
                { id: 'lunch', title: 'Log Your Lunch 🍽️', body: "Don't forget to track your lunch.", hour: 12, link: '/foods' },
                { id: 'dinner', title: 'Log Your Dinner 🍽️', body: "Don't forget to track your dinner.", hour: 19, link: '/foods' },
              ];
              for (const meal of meals) {
                const scheduled = new Date(now); scheduled.setHours(meal.hour, 0, 0, 0);
                if (scheduled > now) {
                  notificationsToSchedule.push({
                    id: `local-meal-${meal.id}-${now.toISOString().split('T')[0]}`,
                    title: meal.title,
                    body: meal.body,
                    schedule: { at: scheduled },
                    extra: { deepLink: meal.link },
                  });
                }
              }
            }

            // Hydration reminders
            if (p.hydration_reminders_enabled) {
              for (const h of [9, 11, 13, 15, 17, 19]) {
                const scheduled = new Date(now); scheduled.setHours(h, 0, 0, 0);
                if (scheduled > now) {
                  notificationsToSchedule.push({
                    id: `local-hydration-${h}-${now.toISOString().split('T')[0]}`,
                    title: 'Stay Hydrated! 💧',
                    body: "Time for a glass of water. You're doing great!",
                    schedule: { at: scheduled },
                  });
                }
              }
            }

            // Daily summary
            if (p.daily_summary_enabled) {
              const scheduled = new Date(now); scheduled.setHours(21, 0, 0, 0);
              if (scheduled > now) {
                notificationsToSchedule.push({
                  id: `local-summary-${now.toISOString().split('T')[0]}`,
                  title: 'Daily Summary 📊',
                  body: 'Check out your progress for today!',
                  schedule: { at: scheduled },
                  extra: { deepLink: '/' },
                });
              }
            }

            // Streak protection
            if (p.streak_protection_enabled) {
              const scheduled = new Date(now); scheduled.setHours(20, 0, 0, 0);
              if (scheduled > now) {
                notificationsToSchedule.push({
                  id: `local-streak-${now.toISOString().split('T')[0]}`,
                  title: 'Streak at Risk! 🔥',
                  body: 'Log an activity now to protect your streak!',
                  schedule: { at: scheduled },
                  extra: { deepLink: '/workouts' },
                });
              }
            }

            // Motivational
            if (p.motivational_enabled) {
              const msgs = [
                "You're stronger than you think! 💪", "Every step counts. Keep going! 🚀",
                "Consistency is the key to results! 🔑", "Your future self will thank you! 🌟",
                "Small progress is still progress! 📈", "Champions are made in the quiet hours! 🏆",
                "Believe in the process! 💎", "Today is a great day to push harder! ⚡",
                "You're one workout away from a good mood! 😊",
              ];
              const idx = now.getDate() % msgs.length;
              const scheduled = new Date(now); scheduled.setHours(10 + (now.getDate() % 9), 0, 0, 0);
              if (scheduled > now) {
                notificationsToSchedule.push({
                  id: `local-motivational-${now.toISOString().split('T')[0]}`,
                  title: 'Daily Motivation 💪',
                  body: msgs[idx],
                  schedule: { at: scheduled },
                });
              }
            }
          }

          // Cancel any existing local notifications first (to avoid duplicates)
          await LocalNotifications.cancel({ notifications: [] });

          // Schedule all pending ones for today
          if (notificationsToSchedule.length > 0) {
            await LocalNotifications.schedule({ notifications: notificationsToSchedule });
            console.log(`[Cap] iOS: Scheduled ${notificationsToSchedule.length} local notifications for today`);
          }

          // Handle tap on local notification → navigate to deep link
          LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
            const deepLink = action.notification.extra?.deepLink;
            if (deepLink) {
              window.location.href = deepLink;
            }
          });

        } catch (e) {
          console.warn('[Cap] iOS local notifications setup failed:', e);
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
