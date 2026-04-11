/**
 * GPS Tracking Hook - Production-Grade Location System
 * 
 * Implements Uber/Google Maps level tracking:
 * - Extended Kalman Filter for GPS + IMU fusion
 * - Outlier rejection for GPS spikes
 * - Position prediction (handles GPS latency)
 * - 60fps interpolation for smooth rendering
 * - Trajectory smoothing
 * 
 * @module hooks/use-gps-tracking
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { isNative, vibrate as capVibrate, checkOnline } from '@/lib/capacitor';
import {
  GPSPoint,
  TrackingSession,
  TrackingConfig,
  MetricsSnapshot,
  LapData,
  haversineDistance,
  calculateAllMetrics,
  calculateMovingTime,
  calculateElevationChanges,
  shouldAutoPause,
  generateSessionId,
  DEFAULT_CONFIG,
} from '@/lib/gps-tracking';
import { 
  saveOfflineWorkout, 
  getOfflineWorkout, 
  getOfflineWorkouts,
  updateOfflineWorkout,
  OfflineWorkout 
} from '@/lib/offline-storage';
import {
  GPSFusionEngine,
  getGPSFusionEngine,
  resetGPSFusionEngine,
  type FusedState,
  type GPSReading,
  type IMUReading,
} from '@/lib/gps-fusion-engine';
import { saveLastKnownPosition } from '@/lib/map-tiles';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface UseGPSTrackingReturn {
  // State
  session: TrackingSession | null;
  metrics: MetricsSnapshot | null;
  isTracking: boolean;
  isPaused: boolean;
  isOffline: boolean;
  gpsError: string | null;
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unknown';
  incompleteSession: OfflineWorkout | null; // GPS-002: for session recovery
  
  // Actions
  startTracking: (activityType?: string) => Promise<void>;
  pauseTracking: () => void;
  resumeTracking: () => void;
  stopTracking: () => Promise<TrackingSession | null>;
  addLap: () => void;
  resumeIncompleteSession: () => Promise<void>; // GPS-002: resume crashed session
  discardIncompleteSession: () => Promise<void>; // GPS-002: discard crashed session
  
  // Config
  config: TrackingConfig;
  updateConfig: (updates: Partial<TrackingConfig>) => void;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

export function useGPSTracking(
  userWeight: number = 70,
  userMaxHR?: number
): UseGPSTrackingReturn {
  // State
  const [session, setSession] = useState<TrackingSession | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const isOfflineRef = useRef(isOffline); // GPS-SS-1: ref to avoid stale closure in callbacks
  isOfflineRef.current = isOffline;
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const [config, setConfig] = useState<TrackingConfig>(DEFAULT_CONFIG);
  
  // Refs that mirror state for callbacks passed to watchPosition
  // These avoid stale closure issues where watchPosition holds an old callback reference
  const sessionRef = useRef<TrackingSession | null>(null);
  const isPausedRef = useRef(false);
  const configRef = useRef<TrackingConfig>(config);
  // Keep refs in sync with state
  sessionRef.current = session;
  isPausedRef.current = isPaused;
  configRef.current = config;
  
  // Fusion engine for production-grade tracking
  const fusionEngineRef = useRef<GPSFusionEngine | null>(null);
  const [fusedState, setFusedState] = useState<FusedState | null>(null);
  
  // IMU listener ref
  const deviceMotionHandlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const deviceOrientationHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  
  // Refs for watchPosition
  const watchIdRef = useRef<number | null>(null);
  const capWatchIdRef = useRef<string | null>(null); // Capacitor native watch ID
  const lastPointRef = useRef<GPSPoint | null>(null);
  const autoPauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const distanceAtLastLapRef = useRef<number>(0);
  const metricsRafRef = useRef<number | null>(null); // GPS-RE-3: coalesce metrics computation
  
  // Wake Lock for preventing screen sleep (GPS-001 fix)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockReleaseHandlerRef = useRef<(() => void) | null>(null); // GPS-MEM-1: stored for cleanup
  
  // GPS watchdog timer (GPS-006 fix)
  const lastGpsUpdateRef = useRef<number>(Date.now());
  const gpsWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  
  // GPS timeout tracking for rate-limited logging
  const consecutiveTimeoutsRef = useRef(0);
  const lastTimeoutLogRef = useRef(0);
  
  // Permission status ref for cleanup (GPS-003 fix)
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  const permissionHandlerRef = useRef<(() => void) | null>(null);
  
  // Incomplete session for recovery (GPS-002 fix)
  const [incompleteSession, setIncompleteSession] = useState<OfflineWorkout | null>(null);
  
  // GPS-RC-1: ref-based guard for initial point (avoids stale closure over newSession)
  const hasInitialPointRef = useRef(false);
  
  // ═══════════════════════════════════════════════════════════════
  // Permission Check (GPS-003 fix: cleanup listener)
  // ═══════════════════════════════════════════════════════════════
  
  const checkPermission = useCallback(async () => {
    if (!navigator.permissions) {
      setPermissionStatus('unknown');
      return;
    }
    
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      
      // Remove old listener if exists (GPS-003 fix: proper cleanup)
      if (permissionStatusRef.current && permissionHandlerRef.current) {
        permissionStatusRef.current.removeEventListener('change', permissionHandlerRef.current);
      }
      
      permissionStatusRef.current = result;
      setPermissionStatus(result.state as 'prompt' | 'granted' | 'denied');
      
      const handleChange = () => {
        setPermissionStatus(result.state as 'prompt' | 'granted' | 'denied');
      };
      
      // Store handler reference for cleanup
      permissionHandlerRef.current = handleChange;
      result.addEventListener('change', handleChange);
    } catch {
      setPermissionStatus('unknown');
    }
  }, []);
  
  // ═══════════════════════════════════════════════════════════════
  // Offline Detection
  // ═══════════════════════════════════════════════════════════════
  
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // ═══════════════════════════════════════════════════════════════
  // Wake Lock API (GPS-001 fix: prevent screen sleep)
  // ═══════════════════════════════════════════════════════════════
  
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator && isTracking) {
      try {
        // GPS-MEM-1: remove previous release handler before re-acquiring
        if (wakeLockRef.current && wakeLockReleaseHandlerRef.current) {
          wakeLockRef.current.removeEventListener('release', wakeLockReleaseHandlerRef.current);
        }
        
        wakeLockRef.current = await navigator.wakeLock.request('screen');

        const releaseHandler = () => {
          // Wake lock released
        };
        wakeLockReleaseHandlerRef.current = releaseHandler;
        wakeLockRef.current.addEventListener('release', releaseHandler);
      } catch (err) {
        console.warn('[GPS] Wake Lock failed:', err);
      }
    }
  }, [isTracking]);
  
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      // GPS-MEM-1: remove listener before releasing (even if release fails)
      if (wakeLockReleaseHandlerRef.current) {
        wakeLockRef.current.removeEventListener('release', wakeLockReleaseHandlerRef.current);
        wakeLockReleaseHandlerRef.current = null;
      }
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.warn('[GPS] Wake Lock release failed:', err);
      }
      wakeLockRef.current = null;
    }
  }, []);
  
  // ═══════════════════════════════════════════════════════════════
  // Visibility Change Handling (GPS-001 fix: background/foreground)
  // ═══════════════════════════════════════════════════════════════
  
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Foreground: Re-acquire wake lock and check for GPS stalls
        if (isTracking && !isPaused) {
          await requestWakeLock();
          
          // Reset the GPS update timestamp when coming back to foreground
          // This prevents false "GPS signal lost" errors after backgrounding
          lastGpsUpdateRef.current = Date.now();
        }
      } else {
        // Background: Release wake lock to save battery
        await releaseWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTracking, isPaused, requestWakeLock, releaseWakeLock]);
  
  // ═══════════════════════════════════════════════════════════════
  // GPS Watchdog Timer (GPS-006 fix: detect GPS stalls)
  // ═══════════════════════════════════════════════════════════════
  
  useEffect(() => {
    if (isTracking && !isPaused) {
      gpsWatchdogRef.current = setInterval(() => {
        const timeSinceLastUpdate = Date.now() - lastGpsUpdateRef.current;
        if (timeSinceLastUpdate > 30000) {
          setGpsError('GPS signal lost. Trying to reconnect...');
        }
      }, 10000);
      
      return () => {
        if (gpsWatchdogRef.current) {
          clearInterval(gpsWatchdogRef.current);
        }
      };
    }
  }, [isTracking, isPaused]);
  
  // ═══════════════════════════════════════════════════════════════
  // Session Recovery (GPS-002 fix: recover incomplete workouts)
  // ═══════════════════════════════════════════════════════════════
  
  useEffect(() => {
    const checkIncompleteSessions = async () => {
      try {
        const workouts = await getOfflineWorkouts();
        // Find incomplete sessions from the last 24 hours
        const incomplete = workouts.find(w => 
          w.completedAt === null && 
          w.source === 'tracked' &&
          Date.now() - new Date(w.startedAt).getTime() < 24 * 60 * 60 * 1000
        );
        setIncompleteSession(incomplete || null);
      } catch {
        // Ignore incomplete session check failure
      }
    };
    
    checkIncompleteSessions();
  }, []);
  
  // Note: resumeIncompleteSession is defined later after handlePosition/handleError are defined
  
  const discardIncompleteSession = useCallback(async () => {
    if (incompleteSession) {
      // Mark as completed (discarded)
      await updateOfflineWorkout(incompleteSession.tempId, {
        completedAt: new Date().toISOString(),
        notes: '[Discarded after app restart]',
      });
      setIncompleteSession(null);
    }
  }, [incompleteSession]);
  
  // ═══════════════════════════════════════════════════════════════
  // GPS Position Handling with Fusion Engine
  // ═══════════════════════════════════════════════════════════════
  
  const handlePosition = useCallback((position: GeolocationPosition) => {
    // Use refs instead of closure values to avoid stale closure from watchPosition
    const currentSession = sessionRef.current;
    if (!currentSession || isPausedRef.current) return;
    
    // Update last GPS update time for watchdog (GPS-006 fix)
    lastGpsUpdateRef.current = Date.now();
    setGpsError(null); // Clear any previous GPS error
    
    // Reset timeout counter on successful position
    consecutiveTimeoutsRef.current = 0;
    
    // Create GPS reading for fusion engine
    const gpsReading: GPSReading = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy || 10,
      speed: position.coords.speed,
      heading: position.coords.heading,
      altitude: position.coords.altitude,
      timestamp: position.timestamp,
    };
    
    const currentConfig = configRef.current;
    
    // Process through fusion engine (Kalman filter + outlier rejection)
    const engine = fusionEngineRef.current;
    if (engine) {
      const fused = engine.processGPS(gpsReading);
      if (fused) {
        setFusedState(fused);
        
        // Save position for instant map display on next app load
        saveLastKnownPosition(fused.lat, fused.lon, position.coords.accuracy);
        
        // Only add point if fusion accepted it (not an outlier)
        if (!fused.isPredicted) {
          // Auto-pause detection (using fused speed) — check BEFORE accumulating distance
          // to prevent the engine's internal distance from drifting ahead of session points.
          if (currentConfig.autoPause && fused.speed < 0.3 && currentSession.points.length > 5) {
            return;
          }
          
          const point: GPSPoint = {
            lat: fused.lat,
            lon: fused.lon,
            altitude: fused.altitude,
            timestamp: fused.timestamp,
            accuracy: position.coords.accuracy,
            speed: fused.speed,
            heading: fused.heading,
          };
          
          // Get distance from fusion engine
          const totalDistance = engine.getTotalDistance();
          
          // Update session with fused point
          setSession(prev => {
            if (!prev) return prev;
            
            const newPoints = [...prev.points, point];
            point.distance = totalDistance;
            
            // Auto-lap detection
            let newLaps = [...prev.laps];
            if (currentConfig.autoLap && totalDistance - distanceAtLastLapRef.current >= currentConfig.autoLapDistance) {
              const lapStartDistance = distanceAtLastLapRef.current;
              const lapEndDistance = totalDistance;
              const lapDistance = lapEndDistance - lapStartDistance;
              
              const lapStartPoint = prev.points.find(p => (p.distance || 0) >= lapStartDistance);
              const lapDuration = lapStartPoint 
                ? (point.timestamp - lapStartPoint.timestamp) / 1000 
                : 0;
              
              newLaps.push({
                lapNumber: newLaps.length + 1,
                startTime: lapStartPoint?.timestamp || Date.now(),
                endTime: point.timestamp,
                distance: lapDistance,
                duration: lapDuration,
                movingTime: lapDuration,
                avgPace: lapDuration > 0 ? (lapDistance / 1000) / (lapDuration / 3600) / 60 : null,
                avgHeartRate: null,
                elevationGain: 0,
                isAutoLap: true,
                trigger: 'distance',
              });
              
              distanceAtLastLapRef.current = totalDistance;
              capVibrate('light').catch(() => {});
            }
            
            return {
              ...prev,
              points: newPoints,
              laps: newLaps,
              totalDistance,
              totalDuration: (Date.now() - prev.startedAt) / 1000,
            };
          });
          
          lastPointRef.current = point;
          hasInitialPointRef.current = true; // GPS-RC-1
        }
      }
    } else {
      // Fallback: No fusion engine (shouldn't happen)
      const point: GPSPoint = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        altitude: position.coords.altitude,
        timestamp: position.timestamp,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
      };
      
      // Simple accuracy filter
      if (currentConfig.gpsAccuracyFilter && point.accuracy && point.accuracy > currentConfig.minAccuracy) {
        return;
      }
      
      let distanceIncrement = 0;
      if (lastPointRef.current) {
        distanceIncrement = haversineDistance(
          lastPointRef.current.lat,
          lastPointRef.current.lon,
          point.lat,
          point.lon
        );
      }
      
      setSession(prev => {
        if (!prev) return prev;
        
        const newPoints = [...prev.points, point];
        const lastDistance = prev.points.length > 0 
          ? (prev.points[prev.points.length - 1].distance || 0) 
          : 0;
        point.distance = lastDistance + distanceIncrement;
        
        return {
          ...prev,
          points: newPoints,
          totalDistance: point.distance,
          totalDuration: (Date.now() - prev.startedAt) / 1000,
        };
      });
      
      lastPointRef.current = point;
      hasInitialPointRef.current = true; // GPS-RC-1
    }
    
    // Persist to offline storage every 30 seconds
    const latestSession = sessionRef.current;
    if (latestSession && latestSession.points.length % 30 === 0) {
      persistSessionRef.current();
    }
  }, []);
  
  const handleError = useCallback((error: GeolocationPositionError) => {
    // Don't treat timeout as a hard error - watchPosition will retry automatically
    // GPS typically takes 10-60 seconds for first fix, 30s timeout is aggressive
    if (error.code === error.TIMEOUT) {
      consecutiveTimeoutsRef.current++;
      
      // Rate-limit logging to avoid console spam (max once every 5 seconds)
      const now = Date.now();
      if (now - lastTimeoutLogRef.current > 5000) {
        const timeoutCount = consecutiveTimeoutsRef.current;
        console.warn(`[GPS] Geolocation timeout (#${timeoutCount}) - GPS acquiring signal, will retry automatically`);
        lastTimeoutLogRef.current = now;
      }
      return;
    }
    
    // Reset timeout counter on non-timeout errors
    consecutiveTimeoutsRef.current = 0;
    
    let errorMessage: string;
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location permission denied. Please enable location access.';
        setPermissionStatus('denied');
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information unavailable.';
        break;
      default:
        errorMessage = `GPS error: ${error.message}`;
    }
    
    setGpsError(errorMessage);
  }, []);
  
  // ═══════════════════════════════════════════════════════════════
  // Resume Incomplete Session (defined after handlePosition/handleError)
  // ═══════════════════════════════════════════════════════════════
  
  const resumeIncompleteSession = useCallback(async () => {
    if (!incompleteSession) return;
    
    // Reset fusion engine to avoid inheriting stale distance/velocity from previous session
    resetGPSFusionEngine();
    fusionEngineRef.current = getGPSFusionEngine();
    
    const points = incompleteSession.routeData ? JSON.parse(incompleteSession.routeData) : [];
    const laps = incompleteSession.splits ? JSON.parse(incompleteSession.splits) : [];
    
    const resumedSession: TrackingSession = {
      id: incompleteSession.tempId,
      activityType: incompleteSession.activityType,
      startedAt: new Date(incompleteSession.startedAt).getTime(),
      points,
      laps,
      status: 'active',
      isOffline: incompleteSession.offlineMode || false,
      totalDistance: incompleteSession.distanceMeters || 0,
      totalDuration: (Date.now() - new Date(incompleteSession.startedAt).getTime()) / 1000,
      movingTime: 0,
      elevationGain: incompleteSession.elevationGain || 0,
      elevationLoss: incompleteSession.elevationLoss || 0,
      avgSpeed: incompleteSession.avgSpeed || 0,
      avgPace: incompleteSession.avgPace || 0,
      calories: incompleteSession.caloriesBurned || 0,
      avgHeartRate: incompleteSession.avgHeartRate,
      avgCadence: incompleteSession.avgCadence,
    };
    
    setSession(resumedSession);
    setIsTracking(true);
    setIncompleteSession(null);
    setGpsError(null);
    
    // ── Capacitor native path ──────────────────────────────
    if (isNative) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const perms = await Geolocation.requestPermissions();
        if (perms.location !== 'denied') {
          const capWatchId = await Geolocation.watchPosition(
            {
              enableHighAccuracy: true,
              timeout: 30000, // 30 seconds for GPS acquisition (mobile)
              maximumAge: 0,
              minimumUpdateInterval: 1000,
            },
            (position, err) => {
              if (err) {
                if (err.code !== 3) { // Not timeout
                  console.error('[GPS] Capacitor geolocation error:', err);
                }
                return;
              }
              if (position) {
                const webPosition = {
                  coords: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude,
                    altitudeAccuracy: position.coords.altitudeAccuracy,
                    heading: position.coords.heading,
                    speed: position.coords.speed,
                  },
                  timestamp: position.timestamp,
                } as GeolocationPosition;
                handlePosition(webPosition);
              }
            }
          );
          capWatchIdRef.current = capWatchId;
          await requestWakeLock();
          capVibrate('medium').catch(() => {});
          return;
        }
      } catch (e) {
        console.error('[GPS] Capacitor geolocation failed, falling back to web', e);
      }
    }
    
    // ── Web fallback ───────────────────────────────────────
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 30000, // 30 seconds for GPS acquisition (web)
          maximumAge: 0,
        }
      );
    }
    
    // Request wake lock
    await requestWakeLock();
    
    // Haptic feedback
    capVibrate('medium').catch(() => {});
  }, [incompleteSession, handlePosition, handleError, requestWakeLock]);
  
  // ═══════════════════════════════════════════════════════════════
  // Session Persistence
  // ═══════════════════════════════════════════════════════════════
  
  const persistSession = useCallback(async () => {
    // Use sessionRef to get latest session data (avoids stale closure)
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    
    const offlineWorkout: OfflineWorkout = {
      id: currentSession.id,
      tempId: currentSession.id,
      activityType: currentSession.activityType,
      workoutType: 'cardio',
      startedAt: new Date(currentSession.startedAt).toISOString(),
      completedAt: currentSession.status === 'stopped' ? new Date().toISOString() : null,
      durationMinutes: Math.round(currentSession.totalDuration / 60),
      distanceMeters: currentSession.totalDistance,
      caloriesBurned: currentSession.calories,
      routeData: JSON.stringify(currentSession.points),
      avgHeartRate: currentSession.avgHeartRate,
      avgCadence: currentSession.avgCadence,
      elevationGain: currentSession.elevationGain,
      elevationLoss: currentSession.elevationLoss,
      avgPace: currentSession.avgPace,
      avgSpeed: currentSession.avgSpeed,
      splits: JSON.stringify(currentSession.laps),
      notes: null,
      isPrivate: true,
      source: 'tracked',
      offlineMode: isOfflineRef.current, // GPS-SS-1
      synced: false,
      version: 1,
      syncAttempts: 0,
      lastSyncAttempt: null,
      syncError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    try {
      await saveOfflineWorkout(offlineWorkout);
    } catch {
      // Ignore persist failure (non-critical)
    }
  }, []); // GPS-SS-1: uses isOfflineRef to avoid stale closure
  
  // Ref to persistSession so handlePosition can call it without stale closure
  const persistSessionRef = useRef(persistSession);
  persistSessionRef.current = persistSession;
  
  // ═══════════════════════════════════════════════════════════════
  // Metrics Update
  // ═══════════════════════════════════════════════════════════════
  
  // GPS-RE-3: Coalesce rapid session updates into a single metrics computation per frame
  useEffect(() => {
    if (!session || session.points.length === 0) {
      setMetrics(null);
      return;
    }
    
    // Cancel previous pending computation
    if (metricsRafRef.current) {
      cancelAnimationFrame(metricsRafRef.current);
    }
    
    metricsRafRef.current = requestAnimationFrame(() => {
      const newMetrics = calculateAllMetrics(session.points, userWeight, userMaxHR, session.activityType);
      setMetrics(newMetrics);
      
      // Update session with computed metrics
      setSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          movingTime: newMetrics.movingTime,
          elevationGain: newMetrics.elevationGain,
          elevationLoss: newMetrics.elevationLoss,
          avgSpeed: newMetrics.avgSpeed,
          avgPace: newMetrics.avgPace,
          calories: newMetrics.calories,
          avgHeartRate: newMetrics.heartRate,
          avgCadence: newMetrics.cadence,
        };
      });
    });
    
    return () => {
      if (metricsRafRef.current) {
        cancelAnimationFrame(metricsRafRef.current);
      }
    };
  }, [session?.points, userWeight, userMaxHR]);
  
  // ═══════════════════════════════════════════════════════════════
  // IMU Handlers (for fusion engine)
  // ═══════════════════════════════════════════════════════════════
  
  const startIMUListeners = useCallback(() => {
    const engine = fusionEngineRef.current;
    if (!engine) return;
    
    // Device motion (accelerometer)
    const motionHandler = (event: DeviceMotionEvent) => {
      if (!event.accelerationIncludingGravity) return;
      
      const imuReading: IMUReading = {
        accelerationX: event.accelerationIncludingGravity.x || 0,
        accelerationY: event.accelerationIncludingGravity.y || 0,
        accelerationZ: event.accelerationIncludingGravity.z || 0,
        rotationAlpha: 0,
        rotationBeta: 0,
        rotationGamma: 0,
        timestamp: Date.now(),
      };
      
      engine.processIMU(imuReading);
    };
    
    // Device orientation (compass/gyro)
    const orientationHandler = (event: DeviceOrientationEvent) => {
      if (event.alpha === null) return;
      
      const imuReading: IMUReading = {
        accelerationX: 0,
        accelerationY: 0,
        accelerationZ: 0,
        rotationAlpha: event.alpha || 0,
        rotationBeta: event.beta || 0,
        rotationGamma: event.gamma || 0,
        timestamp: Date.now(),
      };
      
      engine.processIMU(imuReading);
    };
    
    deviceMotionHandlerRef.current = motionHandler;
    deviceOrientationHandlerRef.current = orientationHandler;
    
    window.addEventListener('devicemotion', motionHandler);
    window.addEventListener('deviceorientation', orientationHandler);
  }, []);
  
  const stopIMUListeners = useCallback(() => {
    if (deviceMotionHandlerRef.current) {
      window.removeEventListener('devicemotion', deviceMotionHandlerRef.current);
      deviceMotionHandlerRef.current = null;
    }
    if (deviceOrientationHandlerRef.current) {
      window.removeEventListener('deviceorientation', deviceOrientationHandlerRef.current);
      deviceOrientationHandlerRef.current = null;
    }
  }, []);
  
  // ═══════════════════════════════════════════════════════════════
  // Control Functions
  // ═══════════════════════════════════════════════════════════════
  
  const startTracking = useCallback(async (activityType: string = 'running') => {
    setGpsError(null);
    
    // Reset GPS watchdog timestamp - this prevents false "GPS signal lost" errors
    // when the user starts tracking after the page has been open for a while
    lastGpsUpdateRef.current = Date.now();
    
    // Initialize fusion engine
    resetGPSFusionEngine();
    fusionEngineRef.current = getGPSFusionEngine();
    
    // NOTE: We do NOT call startInterpolation here anymore.
    // The map component pulls interpolated state directly via getInterpolatedState()
    // This avoids 60fps setState calls which cause React overhead.
    
    // Create session IMMEDIATELY - don't wait for GPS
    const newSession: TrackingSession = {
      id: generateSessionId(),
      activityType,
      startedAt: Date.now(),
      points: [],
      laps: [],
      status: 'active',
      isOffline,
      totalDistance: 0,
      totalDuration: 0,
      movingTime: 0,
      elevationGain: 0,
      elevationLoss: 0,
      avgSpeed: 0,
      avgPace: 0,
      calories: 0,
      avgHeartRate: null,
      avgCadence: null,
    };
    
    setSession(newSession);
    setIsTracking(true);
    setIsPaused(false);
    distanceAtLastLapRef.current = 0;
    hasInitialPointRef.current = false; // GPS-RC-1: reset for new session
    
    // Haptic feedback immediately
    capVibrate('medium').catch(() => {});
    
    // Update config activity type
    setConfig(prev => ({ ...prev, activityType }));
    
    // Request wake lock
    await requestWakeLock();
    
    // Start IMU listeners for sensor fusion
    startIMUListeners();
    
    // ── Capacitor native path ──────────────────────────────
    if (isNative) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        
        // Request permission on native
        const perms = await Geolocation.requestPermissions();
        if (perms.location === 'denied') {
          setGpsError('Location permission denied. Please enable location access.');
          setIsTracking(false);
          return;
        }
        
        const capWatchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true, // Always high accuracy for fusion
            timeout: 30000, // 30 seconds for GPS acquisition (mobile)
            maximumAge: 0, // Always get fresh data
            minimumUpdateInterval: 1000, // Update every second
          },
          (position, err) => {
            if (err) {
              // Don't treat timeout as hard error - will retry
              if (err.code === 3) { // TIMEOUT
                // Will retry automatically
              } else {
                console.error('[GPS] Capacitor geolocation error:', err);
              }
              return;
            }
            if (position) {
              // Convert Capacitor position to web GeolocationPosition format
              const webPosition = {
                coords: {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  altitude: position.coords.altitude,
                  altitudeAccuracy: position.coords.altitudeAccuracy,
                  heading: position.coords.heading,
                  speed: position.coords.speed,
                },
                timestamp: position.timestamp,
              } as GeolocationPosition;
              handlePosition(webPosition);
            }
          }
        );
        capWatchIdRef.current = capWatchId;
        
        // Also try to get initial position quickly (native)
        try {
          const initialPos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false, // Faster, less accurate for quick start
            timeout: 5000,
            maximumAge: 30000, // Accept cached position up to 30 seconds old
          });
          if (initialPos && !hasInitialPointRef.current) { // GPS-RC-1
            const webPosition = {
              coords: {
                latitude: initialPos.coords.latitude,
                longitude: initialPos.coords.longitude,
                accuracy: initialPos.coords.accuracy,
                altitude: initialPos.coords.altitude,
                altitudeAccuracy: initialPos.coords.altitudeAccuracy,
                heading: initialPos.coords.heading,
                speed: initialPos.coords.speed,
              },
              timestamp: initialPos.timestamp,
            } as GeolocationPosition;
            handlePosition(webPosition);
          }
        } catch {
          // Ignore - watchPosition will handle it
        }
        
        return; // Exit early for native path
      } catch {
        // Fall back to web geolocation
      }
    }
    
    // ── Web fallback ───────────────────────────────────────
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: true, // Always high accuracy for fusion
          timeout: 30000, // 30 seconds for GPS acquisition (web)
          maximumAge: 0, // Always get fresh data
        }
      );
      
      // Also try to get initial position quickly
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!hasInitialPointRef.current) { // GPS-RC-1
            handlePosition(pos);
          }
        },
        () => {
          // Ignore error - watchPosition will keep trying
        },
        {
          enableHighAccuracy: false, // Faster, less accurate for quick start
          timeout: 5000, // 5 seconds for quick initial position
          maximumAge: 30000, // Accept cached position up to 30 seconds old
        }
      );
    } else {
      setGpsError('Geolocation not supported. Timer-only mode.');
    }
  }, [isOffline, config.lowPowerMode, handlePosition, handleError, requestWakeLock]);
  
  const pauseTracking = useCallback(() => {
    if (!session) return;
    
    setSession(prev => prev ? { ...prev, status: 'paused' } : null);
    setIsPaused(true);
    
    // Haptic feedback
    capVibrate('light').catch(() => {});
  }, [session]);
  
  const resumeTracking = useCallback(() => {
    if (!session) return;
    
    setSession(prev => prev ? { ...prev, status: 'active' } : null);
    setIsPaused(false);
    
    // Haptic feedback
    capVibrate('light').catch(() => {});
  }, [session]);
  
  const stopTracking = useCallback(async (): Promise<TrackingSession | null> => {
    // Use sessionRef to get the latest session data (avoids stale closure)
    const currentSession = sessionRef.current;
    if (!currentSession) return null;
    
    // Clear any GPS errors - we're stopping tracking
    setGpsError(null);
    
    // GPS-MEM-3: Clear auto-pause timer
    if (autoPauseTimerRef.current) {
      clearTimeout(autoPauseTimerRef.current);
      autoPauseTimerRef.current = null;
    }
    
    // Stop fusion engine interpolation
    if (fusionEngineRef.current) {
      fusionEngineRef.current.stopInterpolation();
    }
    
    // Stop IMU listeners
    stopIMUListeners();
    
    // Stop watching position (Capacitor native)
    if (capWatchIdRef.current !== null) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        await Geolocation.clearWatch({ id: capWatchIdRef.current });
      } catch {
        // Ignore errors during cleanup
      }
      capWatchIdRef.current = null;
    }
    
    // Stop watching position (Web)
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    // Get trajectory from fusion engine (smoothed)
    let finalPoints = currentSession.points;
    if (fusionEngineRef.current) {
      const trajectory = fusionEngineRef.current.getTrajectory();
      if (trajectory.length > 0) {
        finalPoints = trajectory.map(t => ({
          lat: t.lat,
          lon: t.lon,
          altitude: t.altitude,
          timestamp: t.timestamp,
          speed: t.speed,
          heading: t.heading,
          distance: t.distance,
          accuracy: null,
        }));
      }
    }
    
    // Final metrics calculation
    const finalMetrics = calculateAllMetrics(finalPoints, userWeight, userMaxHR, currentSession.activityType);
    
    // Use distance computed from the actual stored points (consistent with trajectory)
    // rather than the fusion engine's internal accumulator which may drift due to auto-pause.
    const finalDistance = finalMetrics.distance;
    
    const completedSession: TrackingSession = {
      ...currentSession,
      points: finalPoints,
      status: 'stopped',
      totalDuration: (Date.now() - currentSession.startedAt) / 1000,
      movingTime: finalMetrics.movingTime,
      totalDistance: finalDistance,
      elevationGain: finalMetrics.elevationGain,
      elevationLoss: finalMetrics.elevationLoss,
      avgSpeed: finalMetrics.avgSpeed,
      avgPace: finalMetrics.avgPace,
      calories: finalMetrics.calories,
      avgHeartRate: finalMetrics.heartRate,
      avgCadence: finalMetrics.cadence,
    };
    
    setSession(completedSession);
    setIsTracking(false);
    setIsPaused(false);
    
    // Persist final session
    const offlineWorkout: OfflineWorkout = {
      id: completedSession.id,
      tempId: completedSession.id,
      activityType: completedSession.activityType,
      workoutType: 'cardio',
      startedAt: new Date(completedSession.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: Math.round(completedSession.totalDuration / 60),
      distanceMeters: completedSession.totalDistance,
      caloriesBurned: completedSession.calories,
      routeData: JSON.stringify(completedSession.points),
      avgHeartRate: completedSession.avgHeartRate,
      avgCadence: completedSession.avgCadence,
      elevationGain: completedSession.elevationGain,
      elevationLoss: completedSession.elevationLoss,
      avgPace: completedSession.avgPace,
      avgSpeed: completedSession.avgSpeed,
      splits: JSON.stringify(completedSession.laps),
      notes: null,
      isPrivate: true,
      source: 'tracked',
      offlineMode: isOfflineRef.current, // GPS-SS-1
      synced: false,
      version: 1,
      syncAttempts: 0,
      lastSyncAttempt: null,
      syncError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    try {
      await saveOfflineWorkout(offlineWorkout);
    } catch {
      // Ignore save failure for final session
    }
    
    // Haptic feedback
    capVibrate('heavy').catch(() => {});
    
    return completedSession;
  }, [userWeight, userMaxHR]); // GPS-SS-1: uses isOfflineRef
  
  const addLap = useCallback(() => {
    if (!session || session.points.length === 0) return;
    
    const lastPoint = session.points[session.points.length - 1];
    const prevLap = session.laps[session.laps.length - 1];
    const lapStartDistance = prevLap ? distanceAtLastLapRef.current : 0;
    const lapDistance = lastPoint.distance - lapStartDistance;
    
    // Find the lap start point
    const lapStartPoint = prevLap 
      ? session.points.find(p => (p.distance || 0) >= lapStartDistance)
      : session.points[0];
    
    const lapDuration = lapStartPoint 
      ? (lastPoint.timestamp - lapStartPoint.timestamp) / 1000 
      : session.totalDuration;
    
    const newLap: LapData = {
      lapNumber: session.laps.length + 1,
      startTime: lapStartPoint?.timestamp || session.startedAt,
      endTime: lastPoint.timestamp,
      distance: lapDistance,
      duration: lapDuration,
      movingTime: calculateMovingTime(
        session.points.filter(p => 
          p.timestamp >= (lapStartPoint?.timestamp || 0) && 
          p.timestamp <= lastPoint.timestamp
        )
      ),
      avgPace: lapDuration > 0 && lapDistance > 0 
        ? (lapDistance / 1000) / (lapDuration / 3600) / 60 
        : null,
      avgHeartRate: null,
      elevationGain: 0,
      isAutoLap: false,
      trigger: 'manual',
    };
    
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        laps: [...prev.laps, newLap],
      };
    });
    
    distanceAtLastLapRef.current = lastPoint.distance;
    
    // Haptic feedback
    capVibrate('light').catch(() => {});
  }, [session]);
  
  const updateConfig = useCallback((updates: Partial<TrackingConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);
  
  // ═══════════════════════════════════════════════════════════════
  // Cleanup (GPS-003, GPS-005 fixes)
  // ═══════════════════════════════════════════════════════════════
  
  useEffect(() => {
    checkPermission();
    
    return () => {
      // Stop fusion engine
      if (fusionEngineRef.current) {
        fusionEngineRef.current.stopInterpolation();
        fusionEngineRef.current = null;
      }
      // Stop IMU listeners
      stopIMUListeners();
      // Clear Capacitor GPS watcher (mobile)
      if (capWatchIdRef.current !== null) {
        import('@capacitor/geolocation').then(({ Geolocation }) => {
          Geolocation.clearWatch({ id: capWatchIdRef.current! });
        }).catch(() => {});
        capWatchIdRef.current = null;
      }
      // Clear Web GPS watcher
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      // Clear auto-pause timer
      if (autoPauseTimerRef.current) {
        clearTimeout(autoPauseTimerRef.current);
      }
      // Clear GPS watchdog (GPS-006 fix)
      if (gpsWatchdogRef.current) {
        clearInterval(gpsWatchdogRef.current);
      }
      // Release wake lock (GPS-001 fix)
      releaseWakeLock();
      // Remove permission status listener (GPS-003 fix: proper cleanup)
      if (permissionStatusRef.current && permissionHandlerRef.current) {
        permissionStatusRef.current.removeEventListener('change', permissionHandlerRef.current);
      }
    };
  }, [checkPermission, releaseWakeLock, stopIMUListeners]);
  
  // beforeunload handler for data safety (GPS-005 fix)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (session && isTracking) {
        // Persist session before unload
        persistSession();
        
        // Warn user about active workout
        const message = 'You have an active workout. Your progress will be saved, but are you sure you want to leave?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [session, isTracking, persistSession]);
  
  // Persist on unmount
  useEffect(() => {
    return () => {
      if (session && isTracking) {
        persistSession();
      }
    };
  }, [session, isTracking, persistSession]);
  
  return {
    // State
    session,
    metrics,
    isTracking,
    isPaused,
    isOffline,
    gpsError,
    permissionStatus,
    incompleteSession,
    fusedState, // Uber-grade fusion state (position, velocity, heading)
    
    // Fusion engine ref for direct pull-based access (60fps rendering)
    fusionEngineRef,
    
    // Actions
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
    addLap,
    resumeIncompleteSession,
    discardIncompleteSession,
    
    // Config
    config,
    updateConfig,
  };
}
