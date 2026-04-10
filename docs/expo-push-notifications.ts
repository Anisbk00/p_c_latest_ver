// ═══════════════════════════════════════════════════════════════════════════════
// Push Notification Service for Expo/React Native
// ═══════════════════════════════════════════════════════════════════════════════
//
// This file shows how to:
// 1. Request notification permissions
// 2. Get Expo Push Token
// 3. Save token to Supabase
// 4. Handle incoming notifications
//
// Copy this code to your Expo app (e.g., services/notifications.ts)
// ═══════════════════════════════════════════════════════════════════════════════

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase'; // Your Supabase client

// ═══════════════════════════════════════════════════════════════════════════════
// Configure Notification Behavior
// ═══════════════════════════════════════════════════════════════════════════════

// Set how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,        // Show notification banner
    shouldPlaySound: true,        // Play notification sound
    shouldSetBadge: true,         // Update app badge count
    shouldShowBanner: true,       // Show banner at top
    shouldShowList: true,         // Show in notification list
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Get Expo Push Token
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register for push notifications and get Expo Push Token
 * 
 * @param userId - The user's ID to associate the device with
 * @returns Expo Push Token string or null if failed
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  let token: string | null = null;

  // ─── Step 1: Check if device supports notifications ───────────────────────
  if (!Device.isDevice) {
    console.log('[Push] Must use physical device for Push Notifications');
    return null;
  }

  // ─── Step 2: Request permissions ─────────────────────────────────────────
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // If not granted, ask for permission
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // If still not granted, exit
  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  // ─── Step 3: Get Expo Push Token ─────────────────────────────────────────
  try {
    // Get the token - this is what you send to your server
    const { data: pushTokenData } = await Notifications.getExpoPushTokenAsync({
      projectId: '4c225a1f-48a4-4cb3-bd3d-58f1b0a18057', // Your EAS project ID
    });

    token = pushTokenData;
    console.log('[Push] Got Expo Push Token:', token);

    // ─── Step 4: Configure Android channel ─────────────────────────────────
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        enableVibrate: true,
        enableLights: true,
      });
    }

    // ─── Step 5: Save token to Supabase ─────────────────────────────────────
    if (token && userId) {
      await saveDeviceToken(userId, token);
    }

    return token;

  } catch (error) {
    console.error('[Push] Error getting push token:', error);
    return null;
  }
}

/**
 * Save device token to Supabase user_devices table
 */
async function saveDeviceToken(userId: string, token: string): Promise<boolean> {
  try {
    // Check if this device is already registered
    const { data: existing, error: checkError } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', userId)
      .eq('device_token', token)
      .maybeSingle();

    if (checkError) {
      console.error('[Push] Error checking existing device:', checkError);
    }

    if (existing) {
      // Update last_used_at
      await supabase
        .from('user_devices')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', existing.id);
      
      console.log('[Push] Updated existing device token');
      return true;
    }

    // Insert new device
    const { error: insertError } = await supabase
      .from('user_devices')
      .insert({
        user_id: userId,
        device_token: token,
        device_type: Platform.OS, // 'ios' or 'android'
        device_name: Device.modelName || 'Unknown',
        push_enabled: true,
        sound_enabled: true,
        badge_enabled: true,
      });

    if (insertError) {
      console.error('[Push] Error saving device token:', insertError);
      return false;
    }

    console.log('[Push] Device token saved successfully');
    return true;

  } catch (error) {
    console.error('[Push] Error in saveDeviceToken:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handle Incoming Notifications
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set up notification listeners
 * Call this in your App.tsx or _layout.tsx
 * 
 * @returns Cleanup function to remove listeners
 */
export function setupNotificationListeners() {
  // ─── Listener 1: Notification received (foreground) ───────────────────────
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('[Push] Notification received:', notification);
      
      // Handle the notification data
      const data = notification.request.content.data;
      if (data?.deepLink) {
        // Navigate to deep link (e.g., '/workouts', '/foods')
        console.log('[Push] Deep link:', data.deepLink);
      }
    }
  );

  // ─── Listener 2: Notification tapped (background/quit) ────────────────────
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('[Push] Notification tapped:', response);
      
      const data = response.notification.request.content.data;
      if (data?.deepLink) {
        // Navigate to the deep link
        console.log('[Push] Navigate to:', data.deepLink);
        // router.push(data.deepLink as string);
      }
    }
  );

  // Return cleanup function
  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}

/**
 * Check if app was opened from a notification (when app was quit)
 */
export async function checkInitialNotification(): Promise<void> {
  const lastNotification = await Notifications.getLastNotificationResponseAsync();
  
  if (lastNotification) {
    console.log('[Push] App opened from notification:', lastNotification);
    
    const data = lastNotification.notification.request.content.data;
    if (data?.deepLink) {
      // Navigate to deep link after a short delay
      setTimeout(() => {
        console.log('[Push] Navigate to:', data.deepLink);
        // router.push(data.deepLink as string);
      }, 1000);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Usage Example in App.tsx
// ═══════════════════════════════════════════════════════════════════════════════

/*
import { useEffect } from 'react';
import { registerForPushNotifications, setupNotificationListeners, checkInitialNotification } from './services/notifications';

export default function App() {
  useEffect(() => {
    // Set up notification listeners
    const cleanup = setupNotificationListeners();
    
    // Check if app opened from notification
    checkInitialNotification();
    
    // Register for push notifications when user logs in
    const userId = 'current-user-id'; // Get from auth context
    if (userId) {
      registerForPushNotifications(userId);
    }
    
    return cleanup;
  }, []);
  
  return <YourApp />;
}
*/
