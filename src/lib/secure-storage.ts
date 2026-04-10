/**
 * Secure Storage Utility for Progress Companion
 * 
 * Uses Capacitor Preferences when available (mobile) for secure storage,
 * falls back to localStorage for web. This provides better security and
 * persistence on mobile devices where localStorage can be cleared by OS.
 * 
 * Updated: 2025-01-20
 */

// Storage keys - centralized for consistency
export const STORAGE_KEYS = {
  WATER_TARGET_ML: 'water-target-ml',
  STEPS_TARGET: 'steps-target',
  ONBOARDING: 'progress-companion-onboarding',
  PROFILE_WARNING_DISMISSED: 'profile-warning-dismissed',
} as const;

// Cache for whether we're in a native Capacitor environment
let _isNative: boolean | null = null;

/**
 * Check if we're running in a native Capacitor environment
 */
function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    
    if (!capacitor) return false;
    
    if (typeof capacitor.isNativePlatform === 'function') {
      return capacitor.isNativePlatform();
    }
    
    if (typeof capacitor.getPlatform === 'function') {
      const platform = capacitor.getPlatform();
      return platform === 'ios' || platform === 'android';
    }
  } catch {
    // Ignore errors
  }
  
  return false;
}

/**
 * Get a value from secure storage
 * Uses Capacitor Preferences on mobile, localStorage on web
 */
export async function getStorageItem(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  // Cache the native check result
  if (_isNative === null) {
    _isNative = isCapacitorNative();
  }
  
  // On web, always use localStorage
  if (!_isNative) {
    return localStorage.getItem(key);
  }
  
  // On native, try Capacitor Preferences (loaded lazily)
  try {
    const preferencesModule = await import('@capacitor/preferences' as string) as {
      Preferences?: {
        get: (opts: { key: string }) => Promise<{ value: string | null }>;
      };
    };
    if (preferencesModule?.Preferences) {
      const { value } = await preferencesModule.Preferences.get({ key });
      return value;
    }
  } catch (error) {
    console.error(`Error getting storage item "${key}":`, error);
  }
  
  // Fallback to localStorage
  return localStorage.getItem(key);
}

/**
 * Set a value in secure storage
 * Uses Capacitor Preferences on mobile, localStorage on web
 */
export async function setStorageItem(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // Cache the native check result
  if (_isNative === null) {
    _isNative = isCapacitorNative();
  }
  
  // On web, always use localStorage
  if (!_isNative) {
    localStorage.setItem(key, value);
    return;
  }
  
  // On native, try Capacitor Preferences (loaded lazily)
  try {
    const preferencesModule = await import('@capacitor/preferences' as string) as {
      Preferences?: {
        set: (opts: { key: string; value: string }) => Promise<void>;
      };
    };
    if (preferencesModule?.Preferences) {
      await preferencesModule.Preferences.set({ key, value });
    }
  } catch (error) {
    console.error(`Error setting storage item "${key}":`, error);
  }
  
  // Always save to localStorage as backup
  localStorage.setItem(key, value);
}

/**
 * Remove a value from secure storage
 */
export async function removeStorageItem(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // Cache the native check result
  if (_isNative === null) {
    _isNative = isCapacitorNative();
  }
  
  // On web, always use localStorage
  if (!_isNative) {
    localStorage.removeItem(key);
    return;
  }
  
  // On native, try Capacitor Preferences (loaded lazily)
  try {
    const preferencesModule = await import('@capacitor/preferences' as string) as {
      Preferences?: {
        remove: (opts: { key: string }) => Promise<void>;
      };
    };
    if (preferencesModule?.Preferences) {
      await preferencesModule.Preferences.remove({ key });
    }
  } catch (error) {
    console.error(`Error removing storage item "${key}":`, error);
  }
  
  // Always remove from localStorage too
  localStorage.removeItem(key);
}

/**
 * Synchronous getter for cases where async isn't possible
 * Falls back to localStorage only (Capacitor requires async)
 */
export function getStorageItemSync(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

/**
 * Synchronous setter for cases where async isn't possible
 * Falls back to localStorage only (Capacitor requires async)
 */
export function setStorageSync(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
  
  // Also try to sync to Capacitor asynchronously
  setStorageItem(key, value).catch(err => {
    console.error(`Failed to sync "${key}" to Capacitor:`, err);
  });
}

/**
 * Get a numeric value from storage
 */
export async function getStorageNumber(key: string, defaultValue: number = 0): Promise<number> {
  const value = await getStorageItem(key);
  if (value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Store a numeric value
 */
export async function setStorageNumber(key: string, value: number): Promise<void> {
  await setStorageItem(key, value.toString());
}

// Re-export aliases for backwards compatibility
export const getItem = getStorageItem;
export const setItem = setStorageItem;
export const removeItem = removeStorageItem;
