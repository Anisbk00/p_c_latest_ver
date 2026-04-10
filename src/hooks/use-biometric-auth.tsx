/**
 * Biometric Authentication Hook
 * 
 * Provides device biometric authentication (Face ID, Touch ID, Fingerprint)
 * using Capacitor DeviceAuth plugin. Falls back gracefully on web.
 */

import React, { useState, useEffect, useCallback } from 'react';

interface BiometricStatus {
  isAvailable: boolean;
  isEnabled: boolean;
  isVerified: boolean;
  biometricType: 'fingerprint' | 'face' | 'none';
  isSupported: boolean;
}

interface BiometricHook extends BiometricStatus {
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  verify: () => Promise<boolean>;
  prompt: () => Promise<boolean>;
}

// Check if DeviceAuth plugin is available
// Note: capacitor-device-auth is a mobile-only plugin that may not be installed in web builds
// Using a webpack magic comment to suppress the warning for optional imports
async function getDeviceAuth() {
  if (typeof window === 'undefined') return null;
  
  try {
    // @ts-expect-error - Optional dependency that may not be installed
    const deviceAuthModule = await import(/* webpackIgnore: true */ 'capacitor-device-auth');
    return deviceAuthModule?.DeviceAuth || null;
  } catch {
    // Package not installed - this is expected for web builds
    return null;
  }
}

export function useBiometricAuth(): BiometricHook {
  const [status, setStatus] = useState<BiometricStatus>({
    isAvailable: false,
    isEnabled: false,
    isVerified: false,
    biometricType: 'none',
    isSupported: false,
  });

  // Check availability on mount
  useEffect(() => {
    async function checkAvailability() {
      const deviceAuth = await getDeviceAuth();
      
      if (!deviceAuth) {
        // Web environment - biometric not available
        setStatus(prev => ({ ...prev, isSupported: false }));
        return;
      }

      try {
        const result = await deviceAuth.isAvailable();
        const storedEnabled = localStorage.getItem('progress-companion-biometric-enabled') === 'true';
        
        setStatus({
          isAvailable: result.available,
          isEnabled: storedEnabled,
          isVerified: false,
          biometricType: result.biometricType || 'none',
          isSupported: true,
        });
      } catch (error) {
        console.warn('Biometric auth check failed:', error);
        setStatus(prev => ({ ...prev, isSupported: false }));
      }
    }

    checkAvailability();
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    const deviceAuth = await getDeviceAuth();
    
    if (!deviceAuth || !status.isAvailable) {
      return false;
    }

    try {
      const result = await deviceAuth.authenticate({
        reason: 'Enable biometric authentication for quick access to your health data',
        fallback: true,
        cancelTitle: 'Cancel',
      });

      if (result.success) {
        localStorage.setItem('progress-companion-biometric-enabled', 'true');
        setStatus(prev => ({ ...prev, isEnabled: true }));
        return true;
      }
    } catch (error) {
      console.warn('Biometric enable failed:', error);
    }

    return false;
  }, [status.isAvailable]);

  const disable = useCallback(async (): Promise<void> => {
    localStorage.removeItem('progress-companion-biometric-enabled');
    localStorage.removeItem('progress-companion-biometric-verified');
    setStatus(prev => ({ ...prev, isEnabled: false, isVerified: false }));
  }, []);

  const verify = useCallback(async (): Promise<boolean> => {
    const deviceAuth = await getDeviceAuth();
    
    if (!deviceAuth || !status.isAvailable || !status.isEnabled) {
      return true; // Skip verification if not enabled
    }

    try {
      const result = await deviceAuth.authenticate({
        reason: 'Authenticate to access your health data',
        fallback: true,
        cancelTitle: 'Use Password',
      });

      if (result.success) {
        localStorage.setItem('progress-companion-biometric-verified', 'true');
        setStatus(prev => ({ ...prev, isVerified: true }));
        return true;
      }
    } catch (error) {
      console.warn('Biometric verification failed:', error);
    }

    return false;
  }, [status.isAvailable, status.isEnabled]);

  const prompt = useCallback(async (): Promise<boolean> => {
    if (!status.isEnabled) {
      return true;
    }
    return verify();
  }, [status.isEnabled, verify]);

  return {
    ...status,
    enable,
    disable,
    verify,
    prompt,
  };
}

/**
 * Biometric Gate Component
 * Shows children only after biometric verification (if enabled)
 */
export function BiometricGate({ 
  children, 
  fallback 
}: { 
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const { isEnabled, isVerified, isSupported, verify } = useBiometricAuth();
  const [pending, setPending] = useState(true);

  useEffect(() => {
    async function checkGate() {
      // If biometric is not enabled or not supported, show content
      if (!isEnabled || !isSupported) {
        setPending(false);
        return;
      }

      // Check if already verified this session
      const sessionVerified = localStorage.getItem('progress-companion-biometric-verified') === 'true';
      if (sessionVerified) {
        setPending(false);
        return;
      }

      // Try to verify
      const success = await verify();
      setPending(!success);
    }

    checkGate();
  }, [isEnabled, isSupported, verify]);

  if (pending && isEnabled && isSupported) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
