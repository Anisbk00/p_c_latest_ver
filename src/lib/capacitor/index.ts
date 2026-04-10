/**
 * Capacitor Native Bridge
 *
 * Central abstraction layer for all native Capacitor plugins.
 * Every export gracefully falls back to the Web API equivalent
 * when the app runs in a browser (PWA mode).
 *
 * Usage:
 *   import { isNative, vibrate, checkOnline } from '@/lib/capacitor';
 *
 * @module lib/capacitor
 */

// Import Capacitor core - this is safe for web
import { Capacitor } from '@capacitor/core';

// ═══════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═══════════════════════════════════════════════════════════════

/** True when running inside the Capacitor native shell (Android / iOS). */
export const isNative = Capacitor.isNativePlatform();

/** 'android' | 'ios' | 'web' */
export const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';

/** True when running specifically on Android */
export const isAndroid = platform === 'android';

/** True when running specifically on iOS */
export const isIOS = platform === 'ios';

/** True when running in a regular browser / PWA */
export const isWeb = platform === 'web';

// ═══════════════════════════════════════════════════════════════
// UTILITY HELPERS - Work on all platforms
// ═══════════════════════════════════════════════════════════════

/**
 * Vibrate using Capacitor Haptics on native, or the Web Vibration API
 */
export async function vibrate(
  style: 'light' | 'medium' | 'heavy' = 'medium'
): Promise<void> {
  if (isNative) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      const map = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      await Haptics.impact({ style: map[style] });
    } catch {
      // Haptics not available
    }
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    const ms = style === 'light' ? 30 : style === 'medium' ? 60 : 120;
    navigator.vibrate(ms);
  }
}

/**
 * Check current network status. Returns `true` when online.
 */
export async function checkOnline(): Promise<boolean> {
  if (isNative) {
    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      return status.connected;
    } catch {
      return true;
    }
  }
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Open an external URL in the system browser (Capacitor) or `window.open` (web).
 */
export async function openExternal(url: string): Promise<void> {
  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } catch {
      // Fallback to window.open
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener');
      }
    }
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * Read a value from Capacitor Preferences (native) or localStorage (web).
 */
export async function getPreference(key: string): Promise<string | null> {
  if (isNative) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      return value;
    } catch {
      // Fallback to localStorage
    }
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
}

/**
 * Write a value to Capacitor Preferences / localStorage.
 */
export async function setPreference(key: string, value: string): Promise<void> {
  if (isNative) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value });
      return;
    } catch {
      // Fallback to localStorage
    }
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
}

/**
 * Remove a value from Capacitor Preferences / localStorage.
 */
export async function removePreference(key: string): Promise<void> {
  if (isNative) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key });
      return;
    } catch {
      // Fallback to localStorage
    }
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  }
}

/**
 * Hide the native splash screen (no-op on web).
 */
export async function hideSplash(): Promise<void> {
  if (isNative) {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide();
    } catch {
      // Splash screen not available
    }
  }
}

/**
 * Configure StatusBar appearance (no-op on web).
 */
export async function configureStatusBar(opts: {
  style?: 'DARK' | 'LIGHT' | 'DEFAULT';
  backgroundColor?: string;
  overlaysWebView?: boolean;
}): Promise<void> {
  if (!isNative) return;
  
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    if (opts.style) {
      const styleMap = { 
        DARK: Style.Dark, 
        LIGHT: Style.Light, 
        DEFAULT: Style.Default 
      };
      await StatusBar.setStyle({ style: styleMap[opts.style] });
    }
    if (opts.backgroundColor) {
      await StatusBar.setBackgroundColor({ color: opts.backgroundColor });
    }
    if (opts.overlaysWebView !== undefined) {
      await StatusBar.setOverlaysWebView({ overlay: opts.overlaysWebView });
    }
  } catch {
    // StatusBar not available
  }
}

// ═══════════════════════════════════════════════════════════════
// NATIVE PLUGIN HELPERS - Lazy loaded only when needed
// These are typed as any to avoid webpack bundling issues
// ═══════════════════════════════════════════════════════════════

/**
 * Get a photo from the camera or photo library
 */
export async function getPhoto(options?: {
  quality?: number;
  allowEditing?: boolean;
  resultType?: 'uri' | 'base64' | 'dataUrl';
  source?: 'prompt' | 'camera' | 'photos';
  saveToGallery?: boolean;
}): Promise<{ dataUrl?: string; base64String?: string; format: string } | null> {
  if (!isNative && typeof window !== 'undefined') {
    // Web fallback using file input
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({ 
              dataUrl: reader.result as string, 
              format: file.type.split('/')[1] || 'jpeg' 
            });
          };
          reader.readAsDataURL(file);
        } else {
          resolve(null);
        }
      };
      input.click();
    });
  }
  
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: options?.quality ?? 90,
      allowEditing: options?.allowEditing ?? false,
      resultType: options?.resultType === 'base64' 
        ? CameraResultType.Base64 
        : options?.resultType === 'dataUrl'
        ? CameraResultType.DataUrl
        : CameraResultType.Uri,
      source: options?.source === 'camera' 
        ? CameraSource.Camera 
        : options?.source === 'photos'
        ? CameraSource.Photos
        : CameraSource.Prompt,
      saveToGallery: options?.saveToGallery ?? false,
    });
    return {
      dataUrl: photo.dataUrl,
      base64String: photo.base64String,
      format: photo.format,
    };
  } catch {
    return null;
  }
}

/**
 * Get current geolocation position
 * Uses 30s timeout for reliable GPS acquisition
 */
export async function getCurrentPosition(): Promise<{
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp?: number;
} | null> {
  if (!isNative && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude ?? undefined,
            speed: position.coords.speed ?? undefined,
            heading: position.coords.heading ?? undefined,
            timestamp: position.timestamp,
          });
        },
        () => resolve(null),
        { 
          enableHighAccuracy: true,
          timeout: 30000, // 30 seconds for GPS acquisition
          maximumAge: 10000, // Accept cached position up to 10s old
        }
      );
    });
  }
  
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 30000, // 30 seconds for GPS acquisition
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude ?? undefined,
      speed: position.coords.speed ?? undefined,
      heading: position.coords.heading ?? undefined,
      timestamp: position.timestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleNotification(options: {
  title: string;
  body: string;
  id?: number;
  schedule?: { at: Date };
}): Promise<boolean> {
  if (!isNative) {
    // Web fallback using browser notifications
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(options.title, { body: options.body });
        return true;
      }
    }
    return false;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{
        id: options.id ?? Date.now(),
        title: options.title,
        body: options.body,
        schedule: options.schedule ? { at: options.schedule.at } : undefined,
      }],
    });
    return true;
  } catch {
    return false;
  }
}
