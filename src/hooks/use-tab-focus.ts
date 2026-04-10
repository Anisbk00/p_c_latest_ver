"use client";

import { useEffect, useRef, useCallback, DependencyList } from "react";

// ═══════════════════════════════════════════════════════════════
// useTabFocus Hook
// ═══════════════════════════════════════════════════════════════

/**
 * Hook that triggers a callback when the tab/window regains focus.
 * Useful for refreshing data when user returns to the app.
 * 
 * Uses ref pattern to avoid stale closures.
 * 
 * @param onFocus - Callback to run when tab gains focus
 * @param deps - Dependencies that should trigger callback ref update
 * @param options - Configuration options
 * 
 * Usage:
 * useTabFocus(
 *   useCallback(() => {
 *     refetchData();
 *   }, [refetchData])
 * );
 */
export function useTabFocus(
  onFocus: () => void,
  deps: DependencyList = [],
  options: {
    /** Minimum time between focus triggers (ms) - default: 1000 */
    throttleMs?: number;
    /** Also trigger on window focus event - default: true */
    includeWindowFocus?: boolean;
  } = {}
): void {
  const { throttleMs = 1000, includeWindowFocus = true } = options;
  
  // Use ref to always have the latest callback without re-subscribing
  const onFocusRef = useRef(onFocus);
  const lastTriggerTime = useRef(0);
  const isMounted = useRef(true);

  // Update the ref whenever the callback changes
  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

  // Stable trigger function that uses the ref
  const triggerFocus = useCallback(() => {
    if (!isMounted.current) return;

    const now = Date.now();
    
    // Throttle to prevent rapid-fire triggers
    if (now - lastTriggerTime.current < throttleMs) {
      return;
    }
    
    lastTriggerTime.current = now;
    
    // Use the ref to always call the latest callback
    try {
      onFocusRef.current();
    } catch (error) {
      console.error("Error in useTabFocus callback:", error);
    }
  }, [throttleMs]);

  useEffect(() => {
    isMounted.current = true;

    // Handle visibility change (tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerFocus();
      }
    };

    // Handle window focus (clicking back into window)
    const handleWindowFocus = () => {
      triggerFocus();
    };

    // Subscribe to events
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    if (includeWindowFocus) {
      window.addEventListener("focus", handleWindowFocus);
    }

    return () => {
      isMounted.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      
      if (includeWindowFocus) {
        window.removeEventListener("focus", handleWindowFocus);
      }
    };
  }, [triggerFocus, includeWindowFocus, ...deps]);
}

// ═══════════════════════════════════════════════════════════════
// useOnlineStatus Hook
// ═══════════════════════════════════════════════════════════════

/**
 * Hook that tracks online/offline status.
 * Returns current online status and triggers callback on change.
 * 
 * @param onStatusChange - Optional callback when status changes
 * @returns {boolean} - Current online status
 * 
 * Usage:
 * const isOnline = useOnlineStatus((online) => {
 *   if (online) syncData();
 * });
 */
export function useOnlineStatus(
  onStatusChange?: (isOnline: boolean) => void
): boolean {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
  
  // Initialize with current status
  const [isOnline, setIsOnline] = React.useState<boolean>(
    isBrowser ? navigator.onLine : true
  );
  
  // Use ref for callback to avoid re-subscribing
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!isBrowser) return;

    const handleOnline = () => {
      setIsOnline(true);
      onStatusChangeRef.current?.(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      onStatusChangeRef.current?.(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isBrowser]);

  return isOnline;
}

// ═══════════════════════════════════════════════════════════════
// useIntervalWithRef Hook
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for intervals that uses ref pattern to avoid stale closures.
 * Automatically clears interval on unmount.
 * 
 * @param callback - Function to call on each interval
 * @param delay - Interval delay in ms, or null to pause
 * 
 * Usage:
 * useIntervalWithRef(() => {
 *   // This always has access to latest state
 *   console.log(count);
 * }, 1000);
 */
export function useIntervalWithRef(
  callback: () => void,
  delay: number | null
): void {
  const callbackRef = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  // Update ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    isMounted.current = true;

    // Don't set interval if delay is null
    if (delay === null) return;

    // Create interval that uses ref for callback
    intervalRef.current = setInterval(() => {
      if (!isMounted.current) return;
      
      try {
        callbackRef.current();
      } catch (error) {
        console.error("Error in interval callback:", error);
      }
    }, delay);

    return () => {
      isMounted.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [delay]);
}

// ═══════════════════════════════════════════════════════════════
// useAnimationFrame Hook
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for requestAnimationFrame with ref pattern.
 * Useful for smooth animations without stale closures.
 * 
 * @param callback - Animation frame callback
 * @param isActive - Whether animation is running
 */
export function useAnimationFrame(
  callback: (deltaTime: number) => void,
  isActive: boolean = true
): void {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number | null>(null);
  const isMounted = useRef(true);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    isMounted.current = true;

    if (!isActive) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!isMounted.current) return;

      const deltaTime = lastTimeRef.current ? timestamp - lastTimeRef.current : 0;
      lastTimeRef.current = timestamp;

      try {
        callbackRef.current(deltaTime);
      } catch (error) {
        console.error("Error in animation frame:", error);
        return;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      isMounted.current = false;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isActive]);
}

// Need to import React for useState in useOnlineStatus
import React from "react";
