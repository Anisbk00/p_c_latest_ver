/**
 * Biometric Authentication Hook
 * 
 * Provides biometric authentication (fingerprint, face ID) capabilities
 * for secure app access and sensitive actions using WebAuthn.
 * 
 * @module hooks/use-biometric-auth
 */

import { useState, useCallback, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface BiometricAuthState {
  isAvailable: boolean;
  isEnabled: boolean;
  isSupported: boolean;
  biometricType: 'fingerprint' | 'face' | 'none';
  lastUsedAt: Date | null;
  failedAttempts: number;
  isLocked: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export interface UseBiometricAuthReturn {
  // State
  isAvailable: boolean;
  isEnabled: boolean;
  isSupported: boolean;
  biometricType: 'fingerprint' | 'face' | 'none';
  isLocked: boolean;
  failedAttempts: number;
  
  // Actions
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  verify: (reason?: string) => Promise<boolean>;
  authenticate: (reason?: string) => Promise<boolean>;
  resetLockout: () => void;
  
  // Loading states
  isEnabling: boolean;
  isAuthenticating: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'biometric_auth_settings';
const CREDENTIAL_ID_KEY = 'biometric_credential_id';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// WebAuthn configuration
const WEBAUTHN_RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const WEBAUTHN_RP_NAME = 'Progress Companion';
const WEBAUTHN_USER_ID = new TextEncoder().encode('progress-companion-user');

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function getStoredSettings(): Partial<BiometricAuthState> {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to read biometric settings:', e);
  }
  return {};
}

function saveSettings(settings: Partial<BiometricAuthState>): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save biometric settings:', e);
  }
}

function getStoredCredentialId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CREDENTIAL_ID_KEY);
}

function saveCredentialId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CREDENTIAL_ID_KEY, id);
}

function clearCredentialId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CREDENTIAL_ID_KEY);
}

function detectBiometricType(): 'fingerprint' | 'face' | 'none' {
  if (typeof window === 'undefined') return 'none';
  
  // Check for Web Authentication API
  if (!window.PublicKeyCredential) return 'none';
  
  // Platform authenticator typically indicates biometric capability
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
    // iOS devices typically have Face ID or Touch ID
    return 'face'; // Default to face for newer devices
  }
  
  if (userAgent.includes('android')) {
    // Android devices typically have fingerprint
    return 'fingerprint';
  }
  
  // Desktop with Windows Hello or Mac Touch ID
  if (userAgent.includes('mac')) {
    return 'fingerprint';
  }
  
  if (userAgent.includes('windows')) {
    return 'face'; // Windows Hello
  }
  
  return 'fingerprint'; // Default assumption
}

async function checkBiometricSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  try {
    // Check for Web Authentication API
    if (!window.PublicKeyCredential) return false;
    
    // Check if platform authenticator is available
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (e) {
    console.error('Failed to check biometric support:', e);
    return false;
  }
}

// Convert ArrayBuffer to Base64URL string
function arrayBufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach(byte => {
    str += String.fromCharCode(byte);
  });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Convert Base64URL string to ArrayBuffer
function base64URLToArrayBuffer(base64URL: string): ArrayBuffer {
  const base64 = base64URL.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const paddedBase64 = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binaryString = atob(paddedBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate random challenge
function generateChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

export function useBiometricAuth(): UseBiometricAuthReturn {
  // State
  const [isSupported, setIsSupported] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'face' | 'none'>('none');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lastUsedAt, setLastUsedAt] = useState<Date | null>(null);
  
  // Loading states
  const [isEnabling, setIsEnabling] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  // Check support on mount
  useEffect(() => {
    async function init() {
      const supported = await checkBiometricSupport();
      setIsSupported(supported);
      
      if (supported) {
        const type = detectBiometricType();
        setBiometricType(type);
        setIsAvailable(true);
      }
      
      // Load stored settings
      const stored = getStoredSettings();
      if (stored.isEnabled !== undefined) {
        setIsEnabled(stored.isEnabled);
      }
      if (stored.failedAttempts !== undefined) {
        setFailedAttempts(stored.failedAttempts);
      }
      if (stored.lastUsedAt) {
        setLastUsedAt(new Date(stored.lastUsedAt));
      }
      if (stored.isLocked !== undefined) {
        setIsLocked(stored.isLocked);
      }
      
      // Check lockout expiry
      if (stored.isLocked && stored.lastUsedAt) {
        const lockoutEnd = new Date(stored.lastUsedAt).getTime() + LOCKOUT_DURATION_MS;
        if (Date.now() > lockoutEnd) {
          setIsLocked(false);
          setFailedAttempts(0);
          saveSettings({ isLocked: false, failedAttempts: 0 });
        }
      }
    }
    
    init();
  }, []);
  
  // Enable biometric authentication - creates a WebAuthn credential
  const enable = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !isAvailable) {
      return false;
    }
    
    setIsEnabling(true);
    
    try {
      // Check if platform authenticator is available
      const isPlatformAuthAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!isPlatformAuthAvailable) {
        console.error('Platform authenticator not available');
        return false;
      }
      
      // Create a new credential
      const challenge = generateChallenge();
      
      const credentialOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          id: WEBAUTHN_RP_ID,
          name: WEBAUTHN_RP_NAME,
        },
        user: {
          id: WEBAUTHN_USER_ID,
          name: 'user@progress-companion',
          displayName: 'Progress Companion User',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
        attestation: 'none',
      };
      
      const credential = await navigator.credentials.create({
        publicKey: credentialOptions
      }) as PublicKeyCredential;
      
      if (credential) {
        // Store the credential ID for later authentication
        const credentialId = arrayBufferToBase64URL(credential.rawId);
        saveCredentialId(credentialId);
        
        setIsEnabled(true);
        setFailedAttempts(0);
        setIsLocked(false);
        saveSettings({ isEnabled: true, failedAttempts: 0, isLocked: false });
        
        return true;
      } else {
        return false;
      }
    } catch (e) {
      console.error('Failed to enable biometric auth:', e);
      // User cancelled or error occurred
      if (e instanceof Error && e.name === 'NotAllowedError') {
        // User cancelled the biometric prompt
        return false;
      }
      return false;
    } finally {
      setIsEnabling(false);
    }
  }, [isSupported, isAvailable]);
  
  // Disable biometric authentication
  const disable = useCallback(async (): Promise<boolean> => {
    setIsEnabling(true);
    
    try {
      // Clear stored credential
      clearCredentialId();
      
      setIsEnabled(false);
      setFailedAttempts(0);
      setIsLocked(false);
      saveSettings({ isEnabled: false, failedAttempts: 0, isLocked: false });
      
      return true;
    } catch (e) {
      console.error('Failed to disable biometric auth:', e);
      return false;
    } finally {
      setIsEnabling(false);
    }
  }, []);
  
  // Verify with biometric using WebAuthn
  const verify = useCallback(async (reason?: string): Promise<boolean> => {
    if (!isSupported || !isAvailable) {
      return false;
    }
    
    if (!isEnabled) {
      return false;
    }
    
    if (isLocked) {
      return false;
    }
    
    setIsAuthenticating(true);
    
    try {
      const storedCredentialId = getStoredCredentialId();
      if (!storedCredentialId) {
        console.error('No stored credential ID');
        return false;
      }
      
      const challenge = generateChallenge();
      
      const assertionOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        rpId: WEBAUTHN_RP_ID,
        allowCredentials: [{
          id: base64URLToArrayBuffer(storedCredentialId),
          type: 'public-key',
        }],
        userVerification: 'required',
        timeout: 60000,
      };
      
      const assertion = await navigator.credentials.get({
        publicKey: assertionOptions
      }) as PublicKeyCredential;
      
      if (assertion) {
        const now = new Date();
        setLastUsedAt(now);
        setFailedAttempts(0);
        saveSettings({ lastUsedAt: now.toISOString(), failedAttempts: 0 });
        
        return true;
      } else {
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        
        if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
          setIsLocked(true);
          saveSettings({ failedAttempts: newFailedAttempts, isLocked: true });
        }
        
        saveSettings({ failedAttempts: newFailedAttempts });
        return false;
      }
    } catch (e) {
      console.error('Biometric authentication error:', e);
      
      // User cancelled
      if (e instanceof Error && e.name === 'NotAllowedError') {
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        
        if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
          setIsLocked(true);
          saveSettings({ failedAttempts: newFailedAttempts, isLocked: true });
        }
        
        saveSettings({ failedAttempts: newFailedAttempts });
        return false;
      }
      
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [isSupported, isAvailable, isEnabled, isLocked, failedAttempts]);
  
  // Authenticate with biometric (alias for verify)
  const authenticate = useCallback(async (reason?: string): Promise<boolean> => {
    return verify(reason);
  }, [verify]);
  
  // Reset lockout
  const resetLockout = useCallback(() => {
    setIsLocked(false);
    setFailedAttempts(0);
    saveSettings({ isLocked: false, failedAttempts: 0 });
  }, []);
  
  return {
    // State
    isAvailable,
    isEnabled,
    isSupported,
    biometricType,
    isLocked,
    failedAttempts,
    
    // Actions
    enable,
    disable,
    verify,
    authenticate,
    resetLockout,
    
    // Loading states
    isEnabling,
    isAuthenticating,
  };
}

export default useBiometricAuth;
