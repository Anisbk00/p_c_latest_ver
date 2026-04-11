/**
 * Background GPS Optimization Hook
 * 
 * Provides optimized background location tracking:
 * - Background location updates (when supported)
 * - Significant location changes
 * - Power optimization
 * - Activity recognition
 * 
 * Uses Web Geolocation API with power optimization for background tracking.
 * 
 * @module hooks/use-background-gps
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { isNative } from '@/lib/capacitor';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BackgroundLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  isBackground: boolean;
}

export interface ActivityState {
  type: 'still' | 'walking' | 'running' | 'cycling' | 'driving' | 'unknown';
  confidence: number;
}

export interface BackgroundGPSConfig {
  enableBackgroundTracking: boolean;
  updateInterval: number; // milliseconds
  distanceFilter: number; // meters
  desiredAccuracy: 'high' | 'balanced' | 'low';
  pauseLocationUpdatesAutomatically: boolean;
  showsBackgroundLocationIndicator: boolean;
  saveBatteryOnBackground: boolean;
}

type TrackingState = 'idle' | 'foreground' | 'background' | 'paused';

interface UseBackgroundGPSReturn {
  // State
  isTracking: boolean;
  trackingState: TrackingState;
  currentLocation: BackgroundLocation | null;
  activityState: ActivityState;
  backgroundLocations: BackgroundLocation[];
  config: BackgroundGPSConfig;
  isCapacitorAvailable: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown';
  
  // Actions
  startBackgroundTracking: () => Promise<void>;
  stopBackgroundTracking: () => void;
  updateConfig: (updates: Partial<BackgroundGPSConfig>) => void;
  clearBackgroundLocations: () => void;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: BackgroundGPSConfig = {
  enableBackgroundTracking: true,
  updateInterval: 5000, // 5 seconds
  distanceFilter: 10, // 10 meters
  desiredAccuracy: 'balanced',
  pauseLocationUpdatesAutomatically: true,
  showsBackgroundLocationIndicator: true,
  saveBatteryOnBackground: true,
};

// ═══════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════

export function useBackgroundGPS(): UseBackgroundGPSReturn {
  // State
  const [isTracking, setIsTracking] = useState(false);
  const [trackingState, setTrackingState] = useState<TrackingState>('idle');
  const [currentLocation, setCurrentLocation] = useState<BackgroundLocation | null>(null);
  const [activityState, setActivityState] = useState<ActivityState>({
    type: 'unknown',
    confidence: 0,
  });
  const [backgroundLocations, setBackgroundLocations] = useState<BackgroundLocation[]>([]);
  const [config, setConfig] = useState<BackgroundGPSConfig>(DEFAULT_CONFIG);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  // Refs
  const watchIdRef = useRef<number | null>(null);
  const capWatchIdRef = useRef<string | null>(null);
  // Track consecutive timeouts for adaptive backoff and rate-limited logging
  const consecutiveTimeoutsRef = useRef(0);
  const lastTimeoutLogRef = useRef(0);
  // Capacitor is available when running inside a native shell
  const isCapacitorAvailable = isNative;

  // ═══════════════════════════════════════════════════════════════
  // CHECK PERMISSIONS (lazy - called when needed)
  // ═══════════════════════════════════════════════════════════════

  const checkPermissions = useCallback(async () => {
    // Capacitor native path
    if (isNative) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const perms = await Geolocation.checkPermissions();
        const state = perms.location === 'granted' ? 'granted'
          : perms.location === 'denied' ? 'denied' : 'prompt';
        setPermissionStatus(state);
        return state;
      } catch {
        setPermissionStatus('unknown');
        return 'unknown';
      }
    }

    // Web fallback
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionStatus(result.state as 'granted' | 'denied' | 'prompt');
        return result.state as 'granted' | 'denied' | 'prompt';
      } catch {
        setPermissionStatus('unknown');
        return 'unknown';
      }
    }
    return 'unknown';
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // WEB GEOLOCATION HANDLERS
  // ═══════════════════════════════════════════════════════════════

  const handleWebPosition = useCallback((position: GeolocationPosition) => {
    // Reset timeout counter on successful position
    consecutiveTimeoutsRef.current = 0;
    
    const location: BackgroundLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude || undefined,
      speed: position.coords.speed || undefined,
      heading: position.coords.heading || undefined,
      timestamp: position.timestamp,
      isBackground: typeof document !== 'undefined' && document.hidden,
    };

    setCurrentLocation(location);

    // Store background locations separately
    if (typeof document !== 'undefined' && document.hidden) {
      setBackgroundLocations(prev => [...prev, location]);
    }

    // Estimate activity from speed
    if (position.coords.speed !== null) {
      const speedMs = position.coords.speed;
      let activity: ActivityState['type'] = 'unknown';
      
      if (speedMs < 0.5) activity = 'still';
      else if (speedMs < 2) activity = 'walking';
      else if (speedMs < 6) activity = 'running';
      else if (speedMs < 15) activity = 'cycling';
      else activity = 'driving';

      setActivityState({
        type: activity,
        confidence: 0.7,
      });
    }
  }, []);

  const handleWebError = useCallback((error: GeolocationPositionError) => {
    // Don't log timeout errors as errors - they're common during initial acquisition
    // GPS typically takes 10-60 seconds for first fix, 30s timeout is aggressive
    if (error.code === error.TIMEOUT) {
      consecutiveTimeoutsRef.current++;
      
      // Rate-limit logging to avoid console spam (max once every 5 seconds)
      const now = Date.now();
      if (now - lastTimeoutLogRef.current > 5000) {
        lastTimeoutLogRef.current = now;
      }
      
      // Don't stop tracking on timeout - watchPosition will retry
      // The browser's watchPosition has built-in retry logic
      return;
    }
    
    // Reset timeout counter on non-timeout errors or success
    consecutiveTimeoutsRef.current = 0;
    // Geolocation error (not timeout) — non-recoverable
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // VISIBILITY CHANGE HANDLER
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const handleVisibilityChange = () => {
      if (!isTracking) return;

      if (document.hidden) {
        // App went to background
        setTrackingState('background');
        
        // Adjust tracking based on config
        if (config.saveBatteryOnBackground) {
          // Reduce update frequency
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            // Restart with lower frequency
            watchIdRef.current = navigator.geolocation.watchPosition(
              handleWebPosition,
              handleWebError,
              {
                enableHighAccuracy: false,
                maximumAge: 30000,
                timeout: 60000, // 60s timeout for background (relaxed)
              }
            );
          }
        }
      } else {
        // App came to foreground
        setTrackingState('foreground');
        
        // Restore high accuracy tracking
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = navigator.geolocation.watchPosition(
            handleWebPosition,
            handleWebError,
            {
              enableHighAccuracy: config.desiredAccuracy === 'high',
              maximumAge: 0,
              timeout: 30000, // 30s timeout for foreground
            }
          );
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTracking, config, handleWebPosition, handleWebError]);

  // ═══════════════════════════════════════════════════════════════
  // START BACKGROUND TRACKING
  // ═══════════════════════════════════════════════════════════════

  const startBackgroundTracking = useCallback(async () => {
    if (isTracking) return;

    setIsTracking(true);
    setTrackingState('foreground');

    // ── Capacitor native path ──────────────────────────────
    if (isNative) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        // Request permission on native
        const perms = await Geolocation.requestPermissions();
        if (perms.location === 'denied') {
          // Permission denied (native)
          setIsTracking(false);
          setTrackingState('idle');
          return;
        }
        setPermissionStatus('granted');

        const capWatchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: config.desiredAccuracy === 'high',
            timeout: 30000, // 30 seconds for GPS acquisition (mobile)
            maximumAge: 0, // Always get fresh data
            minimumUpdateInterval: config.updateInterval,
          },
          (position, err) => {
            if (err) {
              // Don't log timeout errors as errors - they're common during initial acquisition
              // Capacitor geolocation warning — will retry
              return;
            }
            if (position) {
              handleWebPosition(position as unknown as GeolocationPosition);
            }
          }
        );
        capWatchIdRef.current = capWatchId;
        return;
      } catch (e) {
        // Fall back to web geolocation
      }
    }

    // ── Web fallback ───────────────────────────────────────
    // Request permissions if needed
    if (permissionStatus !== 'granted') {
      try {
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 30000, // 30 seconds for initial permission request
          });
        });
        setPermissionStatus('granted');
      } catch {
        // Permission denied (web)
        setIsTracking(false);
        setTrackingState('idle');
        return;
      }
    }

    // Use Web Geolocation API
    // Use a longer timeout for initial acquisition (30s), separate from update interval
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleWebPosition,
      handleWebError,
      {
        enableHighAccuracy: config.desiredAccuracy === 'high',
        maximumAge: 0,
        timeout: 30000, // 30 seconds for position acquisition (not the update interval)
      }
    );

    // Web geolocation tracking started
  }, [isTracking, permissionStatus, config, handleWebPosition, handleWebError]);

  // ═══════════════════════════════════════════════════════════════
  // STOP BACKGROUND TRACKING
  // ═══════════════════════════════════════════════════════════════

  const stopBackgroundTracking = useCallback(() => {
    // Clear Capacitor watch
    if (capWatchIdRef.current !== null) {
      import('@capacitor/geolocation').then(({ Geolocation }) => {
        Geolocation.clearWatch({ id: capWatchIdRef.current! });
      }).catch(() => {});
      capWatchIdRef.current = null;
    }

    // Clear web watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsTracking(false);
    setTrackingState('idle');
    // Background GPS tracking stopped
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // UPDATE CONFIG
  // ═══════════════════════════════════════════════════════════════

  const updateConfig = useCallback((updates: Partial<BackgroundGPSConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CLEAR BACKGROUND LOCATIONS
  // ═══════════════════════════════════════════════════════════════

  const clearBackgroundLocations = useCallback(() => {
    setBackgroundLocations([]);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP ON UNMOUNT
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    return () => {
      if (capWatchIdRef.current !== null) {
        import('@capacitor/geolocation').then(({ Geolocation }) => {
          Geolocation.clearWatch({ id: capWatchIdRef.current! });
        }).catch(() => {});
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    isTracking,
    trackingState,
    currentLocation,
    activityState,
    backgroundLocations,
    config,
    isCapacitorAvailable,
    permissionStatus,
    startBackgroundTracking,
    stopBackgroundTracking,
    updateConfig,
    clearBackgroundLocations,
  };
}
