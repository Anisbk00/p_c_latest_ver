/**
 * Safe Area Hook
 * 
 * Handles dynamic safe area changes such as:
 * - Keyboard appearing/disappearing
 * - Notched devices rotating
 * - Dynamic island devices
 * 
 * Uses Visual Viewport API when available, with fallback to resize events.
 */

import { useState, useEffect, useCallback } from 'react';
import { isNative } from '@/lib/capacitor';

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
}

interface SafeAreaHook extends SafeAreaInsets {
  refresh: () => void;
}

/**
 * Get current safe area insets from CSS environment variables
 */
function getSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
  if (typeof window === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const computedStyle = getComputedStyle(document.documentElement);
  
  const parseEnv = (value: string): number => {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  };

  return {
    top: parseEnv(computedStyle.getPropertyValue('--sat') || computedStyle.getPropertyValue('env(safe-area-inset-top)') || '0'),
    bottom: parseEnv(computedStyle.getPropertyValue('--sab') || computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0'),
    left: parseEnv(computedStyle.getPropertyValue('--sal') || computedStyle.getPropertyValue('env(safe-area-inset-left)') || '0'),
    right: parseEnv(computedStyle.getPropertyValue('--sar') || computedStyle.getPropertyValue('env(safe-area-inset-right)') || '0'),
  };
}

/**
 * Hook for responsive safe area handling with keyboard detection
 */
export function useSafeArea(): SafeAreaHook {
  const [insets, setInsets] = useState<SafeAreaInsets>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    keyboardHeight: 0,
    isKeyboardVisible: false,
  });

  const refresh = useCallback(() => {
    const safeArea = getSafeAreaInsets();
    setInsets(prev => ({
      ...prev,
      ...safeArea,
    }));
  }, []);

  useEffect(() => {
    // Listen for orientation changes
    const handleOrientationChange = () => {
      // Delay to allow CSS to update
      setTimeout(refresh, 100);
    };

    // Visual Viewport API for keyboard detection
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport.height);
        const safeArea = getSafeAreaInsets();
        
        setInsets({
          ...safeArea,
          keyboardHeight,
          isKeyboardVisible: keyboardHeight > 0,
        });
      }
    };

    // Fallback resize handler
    const handleResize = () => {
      refresh();
    };

    // Add listeners
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    }

    // Cleanup
    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleResize);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      }
    };
  }, [refresh]);

  return {
    ...insets,
    refresh,
  };
}

/**
 * Hook to check if device has a notch/Dynamic Island
 */
export function useHasNotch(): boolean {
  const [hasNotch, setHasNotch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check for notch via safe area top inset
    const checkNotch = () => {
      const insets = getSafeAreaInsets();
      setHasNotch(insets.top > 20); // Standard status bar is ~20px, notch devices are 44-59px
    };

    // Create stable handler reference for proper cleanup
    const handleOrientationChange = () => setTimeout(checkNotch, 100);

    checkNotch();
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return hasNotch;
}

/**
 * Hook to detect keyboard visibility
 */
export function useKeyboardVisibility(): { isVisible: boolean; height: number } {
  const [state, setState] = useState({ isVisible: false, height: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ── Capacitor Keyboard plugin (native) ──────────────────
    if (isNative) {
      let removeShow: (() => void) | null = null;
      let removeHide: (() => void) | null = null;

      import('@capacitor/keyboard').then(({ Keyboard }) => {
        Keyboard.addListener('keyboardWillShow', (info) => {
          setState({ isVisible: true, height: info.keyboardHeight });
        }).then(h => { removeShow = () => h.remove(); });

        Keyboard.addListener('keyboardWillHide', () => {
          setState({ isVisible: false, height: 0 });
        }).then(h => { removeHide = () => h.remove(); });
      }).catch(() => { /* fallback handled below */ });

      return () => {
        removeShow?.();
        removeHide?.();
      };
    }

    // ── Web: Visual Viewport API ────────────────────────────
    if (window.visualViewport) {
      const update = () => {
        const keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport.height);
        setState({
          isVisible: keyboardHeight > 50, // Threshold to avoid small fluctuations
          height: keyboardHeight,
        });
      };

      window.visualViewport.addEventListener('resize', update);
      window.visualViewport.addEventListener('scroll', update);

      return () => {
        window.visualViewport.removeEventListener('resize', update);
        window.visualViewport.removeEventListener('scroll', update);
      };
    }

    // Fallback: Listen for focus events on inputs
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // Keyboard likely visible
        setState(prev => ({ ...prev, isVisible: true }));
      }
    };

    const handleFocusOut = () => {
      setState(prev => ({ ...prev, isVisible: false }));
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return state;
}
