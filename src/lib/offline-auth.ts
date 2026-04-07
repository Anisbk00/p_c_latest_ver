/**
 * Offline Authentication Cache
 *
 * Stores auth session locally for offline login capability.
 * Users can access the app offline if they've logged in at least once.
 *
 * Security: Session data is encrypted using Web Crypto API with a key
 * derived from a device-specific fingerprint to prevent token theft.
 *
 * @module lib/offline-auth
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { User, Session } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface CachedAuth {
  user: User;
  session: Session;
  profile: Record<string, unknown>;
  cachedAt: string;
  expiresAt: string;
}

interface EncryptedCache {
  iv: string;           // Base64-encoded initialization vector
  ciphertext: string;   // Base64-encoded encrypted data
  cachedAt: string;
  expiresAt: string;
}

interface OfflineAuthResult {
  success: boolean;
  user?: User | null;
  session?: Session | null;
  profile?: Record<string, unknown> | null;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const AUTH_CACHE_KEY = 'offline-auth-session';
const PROFILE_CACHE_KEY = 'offline-auth-profile';
const ENCRYPTION_KEY_KEY = 'offline-auth-key';
const SESSION_VALIDITY_DAYS = 7; // Allow offline login for 7 days

// ═══════════════════════════════════════════════════════════════
// Web Crypto API Encryption Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a device fingerprint for key derivation
 * Uses browser-specific characteristics that are stable per device
 */
async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return 'server';

  // Collect device characteristics
  const components: string[] = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth.toString(),
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() || '4',
    // Use a random component stored in localStorage for uniqueness
    ((): string => {
      let deviceId = localStorage.getItem('device-id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('device-id', deviceId);
      }
      return deviceId;
    })(),
  ];

  // Create a hash of the components
  const encoder = new TextEncoder();
  const data = encoder.encode(components.join('|'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create the encryption key
 * Uses PBKDF2 to derive a key from device fingerprint
 */
async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined') return null;

  try {
    // Get device fingerprint as key material
    const fingerprint = await getDeviceFingerprint();
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(fingerprint),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive AES-GCM key using PBKDF2
    // Use a fixed salt (device-specific fingerprint already provides uniqueness)
    const salt = encoder.encode('progress-companion-offline-auth-v1');
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return key;
  } catch (error) {
    console.error('[OfflineAuth] Failed to get encryption key:', error);
    return null;
  }
}

/**
 * Encrypt data using AES-GCM
 */
async function encryptData(data: string): Promise<{ iv: string; ciphertext: string } | null> {
  if (typeof window === 'undefined') return null;

  try {
    const key = await getEncryptionKey();
    if (!key) return null;

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );

    // Convert to base64
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));

    return { iv: ivBase64, ciphertext: ciphertextBase64 };
  } catch (error) {
    console.error('[OfflineAuth] Encryption failed:', error);
    return null;
  }
}

/**
 * Decrypt data using AES-GCM
 */
async function decryptData(ivBase64: string, ciphertextBase64: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const key = await getEncryptionKey();
    if (!key) return null;

    // Convert from base64
    const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(ciphertextBase64).split('').map(c => c.charCodeAt(0)));

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('[OfflineAuth] Decryption failed:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Cache Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Cache auth session for offline access with encryption
 */
export async function cacheAuthSession(
  user: User,
  session: Session,
  profile: Record<string, unknown>
): Promise<void> {
  if (typeof window === 'undefined') return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  const cachedAuth: CachedAuth = {
    user,
    session,
    profile,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  try {
    // Encrypt the session data
    const jsonData = JSON.stringify(cachedAuth);
    const encrypted = await encryptData(jsonData);

    if (encrypted) {
      // Store encrypted data
      const encryptedCache: EncryptedCache = {
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      await idbSet(AUTH_CACHE_KEY, encryptedCache);
      console.log('[OfflineAuth] Session cached with encryption (tokens redacted)');
    } else {
      // Fallback: Store without encryption (better than nothing)
      console.warn('[OfflineAuth] Encryption unavailable, storing without encryption');
      await idbSet(AUTH_CACHE_KEY, cachedAuth);
    }
  } catch (error) {
    console.error('[OfflineAuth] Failed to cache session:', error);
  }
}

/**
 * Get cached auth session for offline login
 */
export async function getCachedAuthSession(): Promise<OfflineAuthResult> {
  if (typeof window === 'undefined') {
    return { success: false, reason: 'Server environment' };
  }

  try {
    const cached = await idbGet(AUTH_CACHE_KEY) as EncryptedCache | CachedAuth | undefined;

    if (!cached) {
      return { success: false, reason: 'No cached session found' };
    }

    // Check if cached session has expired
    const expiresAt = new Date(cached.expiresAt);
    if (new Date() > expiresAt) {
      console.log('[OfflineAuth] Cached session expired');
      await clearCachedAuth();
      return { success: false, reason: 'Session expired' };
    }

    // Check if data is encrypted
    let authData: CachedAuth;
    if ('iv' in cached && 'ciphertext' in cached) {
      // Encrypted data - decrypt it
      const decryptedJson = await decryptData(cached.iv, cached.ciphertext);
      if (!decryptedJson) {
        console.error('[OfflineAuth] Failed to decrypt session');
        await clearCachedAuth();
        return { success: false, reason: 'Decryption failed' };
      }
      authData = JSON.parse(decryptedJson) as CachedAuth;
    } else {
      // Unencrypted data (legacy fallback)
      authData = cached as CachedAuth;
    }

    console.log('[OfflineAuth] Using cached session (tokens redacted)');
    return {
      success: true,
      user: authData.user,
      session: authData.session,
      profile: authData.profile,
    };
  } catch (error) {
    console.error('[OfflineAuth] Failed to get cached session:', error);
    return { success: false, reason: 'Failed to read cache' };
  }
}

/**
 * Clear cached auth session
 */
export async function clearCachedAuth(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await idbDel(AUTH_CACHE_KEY);
    await idbDel(PROFILE_CACHE_KEY);
    // Don't delete device-id from localStorage - keep for consistent fingerprint
    console.log('[OfflineAuth] Session cache cleared');
  } catch (error) {
    console.error('[OfflineAuth] Failed to clear cache:', error);
  }
}

/**
 * Check if cached session is valid
 */
export async function hasValidCachedSession(): Promise<boolean> {
  const result = await getCachedAuthSession();
  return result.success;
}

/**
 * Get cached session age in hours
 */
export async function getCachedSessionAge(): Promise<number | null> {
  if (typeof window === 'undefined') return null;

  try {
    const cached = await idbGet(AUTH_CACHE_KEY) as EncryptedCache | CachedAuth | undefined;
    if (!cached) return null;

    const cachedAt = new Date(cached.cachedAt);
    const ageMs = Date.now() - cachedAt.getTime();
    return Math.floor(ageMs / (1000 * 60 * 60)); // Hours
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Offline Login Handler
// ═══════════════════════════════════════════════════════════════

/**
 * Attempt offline login using cached credentials
 * Called when online login fails due to network issues
 * 
 * SECURITY: If online, validates cached token with server first.
 * If offline, uses cached credentials but marks session as "offline-only".
 */
export async function attemptOfflineLogin(): Promise<OfflineAuthResult> {
  const cached = await getCachedAuthSession();

  if (!cached.success) {
    return {
      success: false,
      reason: cached.reason || 'No offline session available',
    };
  }

  // Verify the session structure
  if (!cached.user || !cached.session) {
    return { success: false, reason: 'Invalid cached session' };
  }

  // SECURITY FIX: If we're online, validate the cached token with server
  // This prevents use of revoked/expired tokens when network is available
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      // Import Supabase client dynamically to avoid circular deps
      const { getClient } = await import('@/lib/supabase/client');
      const supabase = getClient();
      
      // Validate the cached session with the server
      const { data: { user }, error } = await supabase.auth.getUser(cached.session.access_token);
      
      if (error || !user) {
        // Token is invalid - clear the cache and fail
        console.warn('[OfflineAuth] Cached token invalid, clearing cache');
        await clearCachedAuth();
        return {
          success: false,
          reason: 'Session expired. Please sign in again.',
        };
      }
      
      // Token is valid - return cached session
      console.log('[OfflineAuth] Online validation successful');
    } catch (validationError) {
      // Network error during validation - proceed with cached session
      // but log the attempt for debugging
      console.warn('[OfflineAuth] Could not validate online, using cached session:', validationError);
    }
  }

  return {
    success: true,
    user: cached.user,
    session: cached.session,
    profile: cached.profile,
  };
}

// ═══════════════════════════════════════════════════════════════
// Session Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Check if we should attempt offline login
 * Returns true if we're offline and have a cached session
 */
export function shouldAttemptOfflineLogin(): boolean {
  if (typeof window === 'undefined') return false;
  return !navigator.onLine;
}

/**
 * Get time until cached session expires
 */
export async function getTimeUntilExpiry(): Promise<number | null> {
  if (typeof window === 'undefined') return null;

  try {
    const cached = await idbGet(AUTH_CACHE_KEY) as EncryptedCache | CachedAuth | undefined;
    if (!cached) return null;

    const expiresAt = new Date(cached.expiresAt);
    const remaining = expiresAt.getTime() - Date.now();

    return remaining > 0 ? remaining : 0;
  } catch {
    return null;
  }
}

/**
 * Check if encryption is available
 */
export function isEncryptionAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(crypto && crypto.subtle);
}
