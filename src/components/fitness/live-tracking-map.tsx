"use client";

/**
 * Live Tracking Map - Premium Uber-like Implementation
 * 
 * Features:
 * - Theme-aware UI (dark/light mode support)
 * - Real-time GPS with immediate position display
 * - Live HUD: speed, elevation, distance, time
 * - Gradient trajectory line (color-coded by speed)
 * - Professional button styling with proper contrast
 * - Smart GPS acquisition with fallback
 * 
 * @module components/fitness/live-tracking-map
 */

import { useState, useEffect, useRef, useCallback, useMemo, type MutableRefObject } from "react";
import maplibregl, { type Map, type Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { 
  MapPin, 
  Wifi, 
  WifiOff, 
  Loader2, 
  Compass,
  Locate,
  Maximize2,
  Minimize2,
  Navigation,
  Crosshair,
  AlertCircle,
  Gauge,
  Mountain,
  Route,
  TrendingUp,
  Play,
  Pause,
  Square,
  Flame,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { GPSFusionEngine } from "@/lib/gps-fusion-engine";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GeoPoint {
  lat: number;
  lon: number;
  elevation?: number;
  timestamp?: number;
  heartRate?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
}

export interface RouteData {
  points: GeoPoint[];
  startTime?: string;
  endTime?: string;
  totalDistance?: number;
}

interface LiveTrackingMapProps {
  route?: RouteData | null;
  currentPosition?: GeoPoint | null;
  fusionEngineRef?: MutableRefObject<GPSFusionEngine | null>;
  isTracking?: boolean;
  className?: string;
  height?: number | string;
  showControls?: boolean;
  showFollowingControls?: boolean;
  defaultZoom?: number;
  onMapReady?: () => void;
  // Live metrics from tracking
  totalDistance?: number;
  totalDuration?: number;
  elevationGain?: number;
  calories?: number;
  // Fullscreen callback
  onFullscreenChange?: (isFullscreen: boolean) => void;
  // Embedded controls for fullscreen mode
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

type MapMode = 'north-up' | 'heading-up';

// ═══════════════════════════════════════════════════════════════
// THEME CONFIGURATION
// ═══════════════════════════════════════════════════════════════

type AppTheme = 'light' | 'dark' | 'gymbro' | 'gymgirl';

interface ThemeColors {
  isDark: boolean;
  primary: string;
  primaryGlow: string;
  accent: string;
  accentGlow: string;
  gold: string;
  bg: string;
  bgCard: string;
  border: string;
  text: string;
  textMuted: string;
}

function getThemeColors(theme: AppTheme): ThemeColors {
  switch (theme) {
    case 'gymbro':
      return {
        isDark: true,
        primary: '#EF4444',
        primaryGlow: 'rgba(239, 68, 68, 0.4)',
        accent: '#DC2626',
        accentGlow: 'rgba(220, 38, 38, 0.3)',
        gold: '#F59E0B',
        bg: '#050607',
        bgCard: 'rgba(10, 12, 14, 0.9)',
        border: 'rgba(239, 68, 68, 0.3)',
        text: '#FAFAFA',
        textMuted: '#9CA3AF',
      };
    case 'gymgirl':
      return {
        isDark: false,
        primary: '#FF6B9D',
        primaryGlow: 'rgba(255, 107, 157, 0.3)',
        accent: '#FF8FAB',
        accentGlow: 'rgba(255, 143, 171, 0.2)',
        gold: '#FFB6C1',
        bg: '#FFE4EE',
        bgCard: 'rgba(255, 232, 240, 0.9)',
        border: 'rgba(255, 107, 157, 0.3)',
        text: '#4A1A2C',
        textMuted: '#9D4E6A',
      };
    case 'dark':
      return {
        isDark: true,
        primary: '#10b981',
        primaryGlow: 'rgba(16, 185, 129, 0.3)',
        accent: '#22c55e',
        accentGlow: 'rgba(34, 197, 94, 0.2)',
        gold: '#84cc16',
        bg: '#0f172a',
        bgCard: 'rgba(15, 23, 42, 0.9)',
        border: 'rgba(255, 255, 255, 0.1)',
        text: '#FAFAFA',
        textMuted: '#9CA3AF',
      };
    default: // light
      return {
        isDark: false,
        primary: '#2563EB',
        primaryGlow: 'rgba(37, 99, 235, 0.2)',
        accent: '#10B981',
        accentGlow: 'rgba(16, 185, 129, 0.2)',
        gold: '#F59E0B',
        bg: '#FFFFFF',
        bgCard: 'rgba(255, 255, 255, 0.9)',
        border: 'rgba(0, 0, 0, 0.1)',
        text: '#0F1724',
        textMuted: '#6B7280',
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAP STYLE - Theme-aware styles
// ═══════════════════════════════════════════════════════════════

const createMapStyle = (theme: AppTheme) => {
  const colors = getThemeColors(theme);
  const isDark = colors.isDark || theme === 'gymbro';
  const isGymbro = theme === 'gymbro';
  
  // Gymbro uses extra dark "dark_matter" tiles for a more aggressive look
  const darkTiles = isGymbro
    ? [
        "https://a.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}@2x.png",
      ]
    : [
        "https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png",
      ];
  
  return {
    version: 8 as const,
    name: isDark ? "Dark Premium" : "Light Premium",
    sources: {
      "carto-tiles": {
        type: "raster" as const,
        tiles: isDark
          ? darkTiles
          : [
              "https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png",
            ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
      },
    },
    layers: [
      {
        id: "carto-base",
        type: "raster" as const,
        source: "carto-tiles",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  };
};

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Format duration as HH:MM:SS
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format distance
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

// Get speed color for trajectory (theme-aware)
function getSpeedColor(speed: number, theme: AppTheme): string {
  const kmh = speed * 3.6;
  
  if (theme === 'gymbro') {
    // Gymbro: blood red gradient
    if (kmh < 5) return '#DC2626'; // Dark red - walking
    if (kmh < 10) return '#EF4444'; // Red - jogging
    if (kmh < 15) return '#F59E0B'; // Gold - running
    if (kmh < 20) return '#D97706'; // Amber - fast
    if (kmh < 30) return '#B91C1C'; // Deep red - cycling
    return '#991B1B'; // Very dark red
  }
  
  if (theme === 'gymgirl') {
    // Gymgirl: pink gradient
    if (kmh < 5) return '#FFB6C1'; // Light pink
    if (kmh < 10) return '#FF8FAB'; // Medium pink
    if (kmh < 15) return '#FF6B9D'; // Primary pink
    if (kmh < 20) return '#E91E63'; // Deep pink
    if (kmh < 30) return '#C2185B'; // Magenta
    return '#880E4F'; // Dark magenta
  }
  
  // Default dark/light theme
  if (kmh < 5) return '#22c55e'; // Green - walking/slow
  if (kmh < 10) return '#84cc16'; // Lime - jogging
  if (kmh < 15) return '#eab308'; // Yellow - running
  if (kmh < 20) return '#f97316'; // Orange - fast running
  if (kmh < 30) return '#ef4444'; // Red - cycling speed
  return '#dc2626'; // Dark red - very fast
}

// ═══════════════════════════════════════════════════════════════
// LIVE HUD COMPONENT - Premium metrics overlay (theme-aware)
// ═══════════════════════════════════════════════════════════════

function LiveHUD({
  speed,
  elevation,
  distance,
  duration,
  elevationGain,
  calories,
  heading,
  isTracking,
  isPaused,
  isFullscreen,
  theme,
}: {
  speed?: number;
  elevation?: number;
  calories?: number;
  distance: number;
  duration: number;
  elevationGain?: number;
  heading?: number;
  isTracking: boolean;
  isPaused?: boolean;
  isFullscreen?: boolean;
  theme: AppTheme;
}) {
  const speedKmh = speed ? Math.round(speed * 3.6) : 0;
  const colors = getThemeColors(theme);
  const isGymbro = theme === 'gymbro';
  const isGymgirl = theme === 'gymgirl';
  const isDark = colors.isDark;
  
  // Theme-aware colors
  const primaryColor = colors.primary;
  const accentColor = colors.accent;
  const goldColor = colors.gold;
  const bgColor = colors.bgCard;
  const borderColor = colors.border;
  const textColor = colors.text;
  const mutedColor = colors.textMuted;
  
  // In non-fullscreen mode, show compact 3-card stats row (mobile friendly)
  if (!isFullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-2 left-2 right-2 z-10 sm:top-3 sm:left-3 sm:right-3"
      >
        {/* Compact stats row - responsive */}
        <div className="flex gap-1.5 sm:gap-2 justify-center">
          {/* Elevation Card */}
          <div 
            className="flex-1 backdrop-blur-xl rounded-lg sm:rounded-xl border shadow-lg p-1.5 sm:p-2"
            style={{ 
              backgroundColor: bgColor,
              borderColor: borderColor,
              maxWidth: 'calc(50% - 3px)'
            }}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <div 
                className="w-4 h-4 sm:w-5 sm:h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: isGymbro ? `${colors.accent}20` : '#06b6d420' }}
              >
                <Mountain className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: isGymbro ? colors.accent : '#06b6d4' }} />
              </div>
              <span className="text-[8px] sm:text-[9px] font-medium uppercase" style={{ color: mutedColor }}>Elev</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-sm sm:text-base font-bold" style={{ color: textColor }}>{elevationGain ? Math.round(elevationGain) : 0}</span>
              <span className="text-[8px] sm:text-[9px]" style={{ color: mutedColor }}>m</span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Fullscreen mode - compact 4-card stats (theme-aware, mobile responsive)
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute top-2 left-2 right-2 z-10 sm:top-3 sm:left-3 sm:right-3"
    >
      <div className="flex gap-1.5 sm:gap-2 justify-center flex-wrap">
        {/* Speed Card */}
        <div 
          className="flex-1 backdrop-blur-xl rounded-lg sm:rounded-xl border shadow-lg p-1.5 sm:p-2"
          style={{ backgroundColor: bgColor, borderColor: borderColor, maxWidth: '110px' }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
              <Gauge className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: primaryColor }} />
            </div>
            <span className="text-[8px] sm:text-[9px] font-medium uppercase" style={{ color: mutedColor }}>Speed</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-base sm:text-lg font-bold" style={{ color: textColor }}>{speedKmh}</span>
            <span className="text-[8px] sm:text-[9px]" style={{ color: mutedColor }}>km/h</span>
          </div>
        </div>
        
        {/* Elevation Card */}
        <div
          className="flex-1 backdrop-blur-xl rounded-lg sm:rounded-xl border shadow-lg p-1.5 sm:p-2"
          style={{ backgroundColor: bgColor, borderColor: borderColor, maxWidth: '110px' }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded flex items-center justify-center" style={{ backgroundColor: isGymbro ? `${colors.accent}20` : '#06b6d420' }}>
              <Mountain className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: isGymbro ? colors.accent : '#06b6d4' }} />
            </div>
            <span className="text-[8px] sm:text-[9px] font-medium uppercase" style={{ color: mutedColor }}>Elev</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-base sm:text-lg font-bold" style={{ color: textColor }}>{elevation ? Math.round(elevation) : '--'}</span>
            <span className="text-[8px] sm:text-[9px]" style={{ color: mutedColor }}>m</span>
          </div>
        </div>

        {/* Calories Card */}
        <div 
          className="flex-1 backdrop-blur-xl rounded-lg sm:rounded-xl border shadow-lg p-1.5 sm:p-2"
          style={{ backgroundColor: bgColor, borderColor: borderColor, maxWidth: '110px' }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded flex items-center justify-center" style={{ backgroundColor: '#f9731620' }}>
              <Flame className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: '#f97316' }} />
            </div>
            <span className="text-[8px] sm:text-[9px] font-medium uppercase" style={{ color: mutedColor }}>Calories</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-base sm:text-lg font-bold" style={{ color: textColor }}>{calories ? Math.round(calories) : 0}</span>
            <span className="text-[8px] sm:text-[9px]" style={{ color: mutedColor }}>kcal</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LIVE TRACKING MAP COMPONENT
// ═══════════════════════════════════════════════════════════════

export function LiveTrackingMap({
  route: routeProp,
  currentPosition,
  fusionEngineRef,
  isTracking = false,
  className,
  height = 300,
  showControls = true,
  showFollowingControls = true,
  defaultZoom = 15,
  onMapReady,
  totalDistance = 0,
  totalDuration = 0,
  elevationGain = 0,
  calories = 0,
  onFullscreenChange,
  isPaused = false,
  onPause,
  onResume,
  onStop,
}: LiveTrackingMapProps) {
  // Theme support - detect actual theme including gymbro/gymgirl
  const { theme } = useTheme();
  
  // Determine the actual app theme
  const getAppTheme = useCallback((): AppTheme => {
    if (typeof window === 'undefined') return 'light';
    const html = document.documentElement;
    if (html.classList.contains('gymbro')) return 'gymbro';
    if (html.classList.contains('gymgirl')) return 'gymgirl';
    if (html.classList.contains('dark')) return 'dark';
    return 'light';
  }, []);
  
  // Initialize theme synchronously to avoid race condition with map creation
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    const html = document.documentElement;
    if (html.classList.contains('gymbro')) return 'gymbro';
    if (html.classList.contains('gymgirl')) return 'gymgirl';
    if (html.classList.contains('dark')) return 'dark';
    return 'light';
  });

  // Memoized theme colors to avoid unnecessary object recreation (F-LTM-4.10)
  const colors = useMemo(() => getThemeColors(appTheme), [appTheme]);
  const isDark = colors.isDark;
  
  // Update theme on change
  useEffect(() => {
    const updateTheme = () => setAppTheme(getAppTheme());
    updateTheme();
    
    // Observer for class changes on html element
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, [getAppTheme]);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const positionMarkerRef = useRef<Marker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const lastPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastCenterUpdateRef = useRef<number>(0);
  const gpsAttemptedRef = useRef(false);
  // Track style loaded state explicitly - map.isStyleLoaded() is unreliable
  const styleLoadedRef = useRef(false);
  // rAF throttle for route update effect (coalesce rapid GPS updates) (F-LTM-4.5)
  const routeUpdateRafRef = useRef<number | null>(null);
  // GPS retry timer cleanup (F-LTM-4.1)
  const gpsRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track isFollowing in ref for use inside rAF callbacks (F-LTM-4.15)
  const isFollowingRef = useRef(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'acquired' | 'error'>('idle');
  const [sourcesReady, setSourcesReady] = useState(false);
  
  // Map state
  const [mapMode, setMapMode] = useState<MapMode>('north-up');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  // Keep isFollowingRef in sync for use inside rAF callbacks
  useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);
  const [zoom, setZoom] = useState(defaultZoom);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [userPosition, setUserPosition] = useState<GeoPoint | null>(null);

  // Local timer for fullscreen mode - keeps time ticking even when parent doesn't re-render
  const [localDuration, setLocalDuration] = useState(totalDuration);
  const trackingStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isTracking && !isPaused && totalDuration > 0) {
      setLocalDuration(totalDuration);
      trackingStartRef.current = Date.now() - (totalDuration * 1000);
    } else if (!isTracking || isPaused) {
      trackingStartRef.current = null;
      setLocalDuration(totalDuration);
    }
  }, [isTracking, isPaused, totalDuration]);

  useEffect(() => {
    if (!isTracking || isPaused || !trackingStartRef.current || !isFullscreen) return;
    const startRef = trackingStartRef.current; // capture for closure
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startRef) / 1000;
      setLocalDuration(Math.max(0, elapsed));
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, isPaused, isFullscreen]);

  const route = routeProp;
  const points = route?.points || [];

  // Track previous theme to detect changes
  const prevThemeRef = useRef(appTheme);

  // Update map style when theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    // Only update if theme actually changed
    if (prevThemeRef.current !== appTheme) {
      prevThemeRef.current = appTheme;
      // Mark style as NOT loaded before switching - prevents stale route updates
      styleLoadedRef.current = false;
      queueMicrotask(() => setSourcesReady(false));
      if (process.env.NODE_ENV === 'development') {
        console.log('[Map] Switching style to theme:', appTheme);
      }
      map.setStyle(createMapStyle(appTheme));
    }
  }, [appTheme]);

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZE MAP
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!mapContainerRef.current || isInitializedRef.current) return;
    
    isInitializedRef.current = true;
    prevThemeRef.current = appTheme;

    // Get initial center from localStorage or use default
    let initialCenter: [number, number] = [9.5375, 33.8869]; // Default: Tunis
    let storedPosition: GeoPoint | null = null;
    try {
      const stored = localStorage.getItem('progress-companion-last-position');
      if (stored) {
        const data = JSON.parse(stored);
        initialCenter = [data.lon, data.lat];
        storedPosition = { lat: data.lat, lon: data.lon };
      }
    } catch {
      // Ignore
    }
    
    // Set initial state via microtask to avoid synchronous setState in effect
    queueMicrotask(() => {
      setIsLoading(true);
      setError(null);
      if (storedPosition) {
        setUserPosition(storedPosition);
        setGpsStatus('acquired');
      }
    });

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: createMapStyle(appTheme),
        center: initialCenter,
        zoom: defaultZoom,
        attributionControl: false,
        trackResize: true,
        antialias: true,
        pitch: 0,
        bearing: 0,
      });

      // Navigation controls removed - users can use touch gestures or mouse wheel to zoom

      map.on('load', () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Map] Map loaded successfully');
        }
        setIsLoading(false);
        onMapReady?.();
        
        // Add route source for trajectory line
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [],
            },
          },
        });

        // Route glow layer (outer glow effect)
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': colors.primary,
            'line-width': 10,
            'line-blur': 5,
            'line-opacity': 0.3,
          },
        });

        // Main route line - thicker for visibility
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': colors.primary,
            'line-width': 5,
          },
        });

        // Add source for speed-colored segments
        map.addSource('route-segments', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });

        // Speed-colored segments layer - thicker for visibility
        map.addLayer({
          id: 'route-segments-layer',
          type: 'line',
          source: 'route-segments',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 5,
          },
        });

        // Accuracy circle source
        map.addSource('accuracy', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: initialCenter,
            },
          },
        });

        // Convert primary color to rgba for accuracy circle (theme-aware)
        const primaryR = parseInt(colors.primary.slice(1, 3), 16);
        const primaryG = parseInt(colors.primary.slice(3, 5), 16);
        const primaryB = parseInt(colors.primary.slice(5, 7), 16);
        
        map.addLayer({
          id: 'accuracy-circle',
          type: 'circle',
          source: 'accuracy',
          paint: {
            'circle-radius': 40,
            'circle-color': `rgba(${primaryR}, ${primaryG}, ${primaryB}, 0.15)`,
            'circle-stroke-width': 1,
            'circle-stroke-color': `rgba(${primaryR}, ${primaryG}, ${primaryB}, 0.3)`,
          },
        });

        // Create premium position marker with theme colors
        const el = document.createElement('div');
        el.className = 'premium-position-marker';
        // Convert hex to rgba for use in CSS
        const primaryRgba = `${parseInt(colors.primary.slice(1,3), 16)}, ${parseInt(colors.primary.slice(3,5), 16)}, ${parseInt(colors.primary.slice(5,7), 16)}`;
        const primaryLight = isDark ? colors.primary : colors.primary; // Keep primary as-is
        el.innerHTML = `
          <div class="marker-container" style="position: relative; width: 48px; height: 48px;">
            <!-- Outer pulse rings -->
            <div class="pulse-ring-1" style="
              position: absolute;
              top: 0;
              left: 0;
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background: rgba(${primaryRgba}, 0.15);
              animation: premiumPulse1 2.5s ease-out infinite;
            "></div>
            <div class="pulse-ring-2" style="
              position: absolute;
              top: 6px;
              left: 6px;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background: rgba(${primaryRgba}, 0.2);
              animation: premiumPulse2 2.5s ease-out infinite 0.3s;
            "></div>
            <!-- Inner dot with gradient -->
            <div class="inner-dot" style="
              position: absolute;
              top: 14px;
              left: 14px;
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: linear-gradient(135deg, ${primaryLight} 0%, ${colors.primary} 100%);
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(${primaryRgba}, 0.5), 0 0 0 2px rgba(${primaryRgba}, 0.3);
            "></div>
            <!-- Heading indicator (triangle) -->
            <div class="heading-indicator" style="
              position: absolute;
              top: -2px;
              left: 50%;
              transform: translateX(-50%);
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-bottom: 10px solid ${colors.primary};
              filter: drop-shadow(0 -1px 2px rgba(0,0,0,0.3));
            "></div>
          </div>
          <style>
            @keyframes premiumPulse1 {
              0% { transform: scale(1); opacity: 1; }
              100% { transform: scale(2.5); opacity: 0; }
            }
            @keyframes premiumPulse2 {
              0% { transform: scale(1); opacity: 1; }
              100% { transform: scale(2); opacity: 0; }
            }
          </style>
        `;
        el.style.width = '48px';
        el.style.height = '48px';
        el.style.cursor = 'pointer';

        positionMarkerRef.current = new maplibregl.Marker({
          element: el,
          anchor: 'center',
          rotationAlignment: 'map',
        })
          .setLngLat(initialCenter)
          .addTo(map);

        setCenter(initialCenter);
        
        // Mark sources and style as ready - route can now be rendered
        styleLoadedRef.current = true;
        if (process.env.NODE_ENV === 'development') {
          console.log('[Map] Sources and layers added, ready for route data');
        }
        setSourcesReady(true);
      });

      map.on('error', (e) => {
        console.error('[Map] MapLibre error:', e);
        setError('Failed to load map');
        setIsLoading(false);
      });

      map.on('zoom', () => {
        setZoom(map.getZoom());
      });

      map.on('moveend', () => {
        const c = map.getCenter();
        setCenter([c.lng, c.lat]);
      });

      mapRef.current = map;
    } catch (err) {
      console.error('[Map] Failed to initialize:', err);
      queueMicrotask(() => {
        setError('Failed to initialize map');
        setIsLoading(false);
      });
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (routeUpdateRafRef.current) {
        cancelAnimationFrame(routeUpdateRafRef.current);
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      isInitializedRef.current = false;
      gpsAttemptedRef.current = false;
      setSourcesReady(false);
    };
  }, [defaultZoom, onMapReady]);

  // ═══════════════════════════════════════════════════════════════
  // SMART GPS ACQUISITION - Immediate + Retry
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    // Only run once when map is ready and we don't have a position
    if (gpsAttemptedRef.current || userPosition) return;
    
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    
    gpsAttemptedRef.current = true;
    
    // Set acquiring status via timeout to avoid direct setState in effect
    const statusTimer = setTimeout(() => setGpsStatus('acquiring'), 0);

    const acquireGPS = async () => {
      // Try to get position immediately
      if (navigator.geolocation) {
        // First attempt: quick, low accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            map.jumpTo({ center: lngLat, zoom: defaultZoom });
            setCenter(lngLat);
            setUserPosition({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              heading: pos.coords.heading || 0,
              speed: pos.coords.speed || 0,
              elevation: pos.coords.altitude || undefined,
            });
            setGpsStatus('acquired');
            
            // Update marker
            if (positionMarkerRef.current) {
              positionMarkerRef.current.setLngLat(lngLat);
            }
            
            // Save for next time
            try {
              localStorage.setItem('progress-companion-last-position', JSON.stringify({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                timestamp: Date.now(),
              }));
            } catch {}
            
            // Now try for high accuracy position
            navigator.geolocation.getCurrentPosition(
              (highAccPos) => {
                const highLngLat: [number, number] = [highAccPos.coords.longitude, highAccPos.coords.latitude];
                map.panTo(highLngLat, { duration: 500 });
                setUserPosition({
                  lat: highAccPos.coords.latitude,
                  lon: highAccPos.coords.longitude,
                  accuracy: highAccPos.coords.accuracy,
                  heading: highAccPos.coords.heading || 0,
                  speed: highAccPos.coords.speed || 0,
                  elevation: highAccPos.altitude || undefined,
                });
                if (positionMarkerRef.current) {
                  positionMarkerRef.current.setLngLat(highLngLat);
                }
              },
              () => {}, // Ignore errors on high accuracy attempt
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
          },
          (err) => {
            console.warn('[Map] GPS acquisition failed:', err.message);
            if (err.code === err.PERMISSION_DENIED) {
              setGpsStatus('error');
              setError('Location permission denied');
            } else {
              // Retry after delay - track timer for cleanup on unmount (F-LTM-4.1)
              if (gpsRetryTimerRef.current) clearTimeout(gpsRetryTimerRef.current);
              gpsRetryTimerRef.current = setTimeout(() => {
                gpsAttemptedRef.current = false;
                gpsRetryTimerRef.current = null;
              }, 3000);
            }
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      }
    };

    acquireGPS();
    
    return () => {
      clearTimeout(statusTimer);
      if (gpsRetryTimerRef.current) {
        clearTimeout(gpsRetryTimerRef.current);
        gpsRetryTimerRef.current = null;
      }
    };
  }, [isLoading, userPosition, defaultZoom]);

  // ═══════════════════════════════════════════════════════════════
  // UPDATE ROUTE WITH SPEED-COLORED SEGMENTS
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const map = mapRef.current;
    
    // Wait for sources and style to be ready, and have points to render
    if (!sourcesReady || !map || !styleLoadedRef.current || points.length === 0) {
      return;
    }

    // Throttle with rAF to coalesce rapid GPS updates into a single frame (F-LTM-4.5)
    if (routeUpdateRafRef.current) cancelAnimationFrame(routeUpdateRafRef.current);
    
    routeUpdateRafRef.current = requestAnimationFrame(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Map] Updating route with', points.length, 'points, isTracking:', isTracking);
      }

      // Update basic route line
      const coordinates = points.map(p => [p.lon, p.lat] as [number, number]);

      const source = map.getSource('route') as GeoJSONSource;
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates,
          },
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('[Map] Route source updated with', coordinates.length, 'coordinates');
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Map] Route source not found!');
        }
      }

      // Create speed-colored segments
      const segmentsSource = map.getSource('route-segments') as GeoJSONSource;
      if (segmentsSource && points.length > 1) {
        const features: GeoJSON.Feature[] = [];
        
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          
          // Calculate speed for this segment
          const speed = curr.speed ?? 
            (prev.timestamp && curr.timestamp 
              ? Math.sqrt(
                  Math.pow((curr.lat - prev.lat) * 111000, 2) + 
                  Math.pow((curr.lon - prev.lon) * 111000 * Math.cos(prev.lat * Math.PI / 180), 2)
                ) / ((curr.timestamp - prev.timestamp) / 1000)
              : 5); // Default 5 m/s
          
          const color = getSpeedColor(speed, appTheme);
          
          features.push({
            type: 'Feature',
            properties: { color },
            geometry: {
              type: 'LineString',
              coordinates: [[prev.lon, prev.lat], [curr.lon, curr.lat]],
            },
          });
        }
        
        segmentsSource.setData({
          type: 'FeatureCollection',
          features,
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('[Map] Segments updated with', features.length, 'features');
        }
      }

      // Fit to route bounds (F-LTM-4.15: prevent animation queuing)
      if (coordinates.length >= 1) {
        const bounds = new maplibregl.LngLatBounds();
        coordinates.forEach(coord => bounds.extend(coord));
        
        if (!isTracking) {
          // Post-workout view: always fit the entire route with more padding
          map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 0 });
          if (process.env.NODE_ENV === 'development') {
            console.log('[Map] Fitted to route bounds (post-workout):', coordinates.length, 'points');
          }
        } else if (isFollowingRef.current) {
          // Active tracking: only animate for initial points to prevent animation queuing
          map.fitBounds(bounds, { padding: 50, maxZoom: 16, duration: points.length <= 5 ? 0 : 500 });
        }
      }
    });

    return () => {
      if (routeUpdateRafRef.current) {
        cancelAnimationFrame(routeUpdateRafRef.current);
      }
    };
  }, [points, isFollowing, isTracking, appTheme, sourcesReady]);

  // ═══════════════════════════════════════════════════════════════
  // HIDE/SHOW POSITION MARKER based on tracking state
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const marker = positionMarkerRef.current;
    if (!marker) return;
    
    // Hide marker when not actively tracking (post-workout view)
    const markerEl = marker.getElement();
    if (markerEl) {
      markerEl.style.display = isTracking ? 'block' : 'none';
    }
  }, [isTracking]);

  // ═══════════════════════════════════════════════════════════════
  // SMOOTH POSITION TRACKING
  // ═══════════════════════════════════════════════════════════════

  const isAnimatingRef = useRef(false);
  const smoothPositionRef = useRef<{ lat: number; lon: number; heading: number } | null>(null);

  useEffect(() => {
    if (!isTracking) {
      isAnimatingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    isAnimatingRef.current = true;

    const animate = () => {
      if (!isAnimatingRef.current) return;

      const map = mapRef.current;
      const marker = positionMarkerRef.current;
      if (map && marker && map.isStyleLoaded()) {
        let pos: { lat: number; lon: number; heading: number; speed: number; accuracy?: number; elevation?: number } | null = null;

        if (fusionEngineRef?.current) {
          const fusedState = fusionEngineRef.current.getInterpolatedState();
          if (fusedState) {
            pos = {
              lat: fusedState.lat,
              lon: fusedState.lon,
              heading: fusedState.heading,
              speed: fusedState.speed,
              accuracy: fusedState.accuracy,
              elevation: fusedState.altitude,
            };
          }
        }

        if (!pos && currentPosition) {
          pos = {
            lat: currentPosition.lat,
            lon: currentPosition.lon,
            heading: currentPosition.heading || 0,
            speed: currentPosition.speed || 0,
            accuracy: currentPosition.accuracy,
            elevation: currentPosition.elevation,
          };
        }

        if (pos) {
          setGpsStatus('acquired');
          
          if (!smoothPositionRef.current) {
            smoothPositionRef.current = { lat: pos.lat, lon: pos.lon, heading: pos.heading };
          } else {
            const lerpFactor = 0.25;
            smoothPositionRef.current.lat += (pos.lat - smoothPositionRef.current.lat) * lerpFactor;
            smoothPositionRef.current.lon += (pos.lon - smoothPositionRef.current.lon) * lerpFactor;
            smoothPositionRef.current.heading = pos.heading;
          }

          const lngLat: [number, number] = [smoothPositionRef.current.lon, smoothPositionRef.current.lat];
          
          marker.setLngLat(lngLat);

          // Update accuracy circle
          const accuracySource = map.getSource('accuracy') as GeoJSONSource;
          if (accuracySource && pos.accuracy) {
            accuracySource.setData({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: lngLat },
            });

            const metersToPixels = 156543.03392 * Math.cos(pos.lat * Math.PI / 180) / Math.pow(2, zoom);
            const radiusPixels = Math.max(15, Math.min(150, pos.accuracy / metersToPixels));
            map.setPaintProperty('accuracy-circle', 'circle-radius', radiusPixels);
          }

          const now = Date.now();
          if (isFollowing && now - lastCenterUpdateRef.current > 400) {
            if (!lastPositionRef.current || 
                Math.abs(lastPositionRef.current.lat - pos.lat) > 0.000005 ||
                Math.abs(lastPositionRef.current.lon - pos.lon) > 0.000005) {
              map.panTo(lngLat, { duration: 250, animate: true });
              lastPositionRef.current = { lat: pos.lat, lon: pos.lon };
              lastCenterUpdateRef.current = now;
              setCenter(lngLat);
            }
          }

          if (mapMode === 'heading-up' && smoothPositionRef.current.heading) {
            map.rotateTo(smoothPositionRef.current.heading, { duration: 80 });
          }

          setUserPosition({
            lat: smoothPositionRef.current.lat,
            lon: smoothPositionRef.current.lon,
            heading: smoothPositionRef.current.heading,
            speed: pos.speed,
            accuracy: pos.accuracy,
            elevation: pos.elevation,
          });
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isAnimatingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isTracking, fusionEngineRef, currentPosition, isFollowing, mapMode, zoom]);

  // ═══════════════════════════════════════════════════════════════
  // ONLINE/OFFLINE DETECTION
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const checkOnline = () => setIsOnline(navigator.onLine);
    checkOnline();
    window.addEventListener('online', checkOnline);
    window.addEventListener('offline', checkOnline);
    return () => {
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('offline', checkOnline);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CENTER ON USER POSITION
  // ═══════════════════════════════════════════════════════════════

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !userPosition) return;
    
    map.flyTo({
      center: [userPosition.lon, userPosition.lat],
      zoom: 17,
      duration: 800,
    });
    setIsFollowing(true);
  }, [userPosition]);

  // Handle fullscreen toggle with callback
  const handleFullscreenToggle = useCallback(() => {
    const newFullscreen = !isFullscreen;
    setIsFullscreen(newFullscreen);
    onFullscreenChange?.(newFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        onFullscreenChange?.(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onFullscreenChange]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  const heightStyle = isFullscreen ? '100vh' : typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={mapContainerRef}
      className={cn(
        "relative overflow-hidden rounded-2xl block",
        isFullscreen && "fixed inset-0 z-[100] rounded-none",
        className
      )}
      style={{ height: heightStyle, width: isFullscreen ? '100vw' : '100%', backgroundColor: colors.bg }}
      role="img"
      aria-label="Live tracking map"
    >
      {/* Loading overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-20"
            style={{ backgroundColor: colors.bg }}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div 
                  className="w-16 h-16 rounded-full border-4 animate-spin"
                  style={{ borderColor: colors.border, borderTopColor: colors.primary }}
                />
                <MapPin className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6" style={{ color: colors.primary }} />
              </div>
              <span className="text-sm font-medium" style={{ color: colors.textMuted }}>Loading map...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GPS Status Indicator - Premium Glass Style (theme-aware) */}
      <AnimatePresence>
        {gpsStatus === 'acquiring' && !isLoading && !isTracking && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-10"
          >
            <div 
              className="flex items-center gap-3 px-5 py-2.5 rounded-full backdrop-blur-xl border shadow-xl"
              style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
            >
              <div className="relative">
                <div className="w-4 h-4 rounded-full animate-ping absolute" style={{ backgroundColor: `${colors.primary}40` }} />
                <div className="w-4 h-4 rounded-full relative" style={{ backgroundColor: colors.primary }} />
              </div>
              <span className="text-sm font-medium" style={{ color: colors.text }}>Finding your location...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIVE HUD - Shows when tracking */}
      {isTracking && (
        <LiveHUD
          speed={userPosition?.speed}
          elevation={userPosition?.elevation}
          distance={totalDistance}
          duration={totalDuration}
          elevationGain={elevationGain}
          calories={calories}
          heading={userPosition?.heading}
          isTracking={isTracking}
          isPaused={isPaused}
          isFullscreen={isFullscreen}
          theme={appTheme}
        />
      )}

      {/* Top Right: Connection Status - only when not tracking (HUD is shown instead) */}
      {!isTracking && (
        <div className="absolute top-2 left-2 z-10 sm:top-3 sm:left-3">
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl border shadow-lg transition-all"
            style={{ 
              backgroundColor: isOnline ? `${colors.accent}20` : `${colors.gold}20`,
              borderColor: isOnline ? `${colors.accent}40` : `${colors.gold}40`,
              color: isOnline ? colors.accent : colors.gold
            }}
          >
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="text-xs font-semibold">{isOnline ? "Online" : "Offline"}</span>
          </div>
        </div>
      )}

      {/* Top Right: Control Buttons - Theme-aware Glass */}
      {showFollowingControls && (
        <div className="absolute top-2 right-2 flex flex-col gap-2 z-10 sm:top-3 sm:right-3">
          {/* Compass Mode */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setMapMode(prev => prev === 'north-up' ? 'heading-up' : 'north-up')}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all backdrop-blur-xl border shadow-lg"
            style={{ 
              backgroundColor: mapMode === 'heading-up' ? colors.primary : colors.bgCard,
              borderColor: mapMode === 'heading-up' ? `${colors.primary}80` : colors.border,
              color: mapMode === 'heading-up' ? '#ffffff' : colors.text
            }}
            title={mapMode === 'north-up' ? 'Heading-up mode' : 'North-up mode'}
          >
            <Compass className={cn("w-4 h-4 sm:w-5 sm:h-5", mapMode === 'heading-up' && "animate-spin")} style={{ animationDuration: '3s' }} />
          </motion.button>

          {/* Follow Position */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsFollowing(prev => !prev)}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all backdrop-blur-xl border shadow-lg"
            style={{ 
              backgroundColor: isFollowing ? colors.primary : colors.bgCard,
              borderColor: isFollowing ? `${colors.primary}80` : colors.border,
              color: isFollowing ? '#ffffff' : colors.text
            }}
            title={isFollowing ? 'Stop following' : 'Follow position'}
          >
            <Locate className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>

          {/* Fullscreen */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleFullscreenToggle}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all backdrop-blur-xl border shadow-lg"
            style={{ 
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
              color: colors.text
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </motion.button>
        </div>
      )}

      {/* Embedded Workout Controls - Shows in fullscreen mode */}
      {isFullscreen && isTracking && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-0 left-0 right-0 z-10 px-4 pt-8"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 40%, transparent 100%)' }}
        >
          <div className="max-w-md mx-auto pb-8">
            {/* Primary Stats Summary */}
            <div className="flex justify-center gap-4 sm:gap-6 mb-3 sm:mb-4">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">{formatDuration(localDuration)}</div>
                <div className="text-[10px] sm:text-xs text-white/60">TIME</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">{(totalDistance / 1000).toFixed(2)}km</div>
                <div className="text-[10px] sm:text-xs text-white/60">DIST</div>
              </div>
            </div>
            
            {/* Control Buttons */}
            <div className="flex gap-2 sm:gap-3">
              {/* Main Control Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={isPaused ? onResume : onPause}
                className="flex-1 h-14 sm:h-16 rounded-2xl font-semibold text-base sm:text-lg flex items-center justify-center gap-2"
                style={{ 
                  backgroundColor: isPaused ? colors.accent : colors.gold,
                  color: '#ffffff'
                }}
              >
                {isPaused ? (
                  <>
                    <Play className="w-5 h-5 sm:w-6 sm:h-6" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-5 h-5 sm:w-6 sm:h-6" />
                    Pause
                  </>
                )}
              </motion.button>

              {/* Stop Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onStop}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: colors.primary }}
              >
                <Square className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Speed Legend - Shows when tracking (theme-aware) */}
      {isTracking && points.length > 1 && (
        <div className="absolute bottom-2 left-2 z-10 sm:bottom-3 sm:left-3">
          <div 
            className="flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl backdrop-blur-xl border shadow-lg"
            style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
          >
            <span className="text-[8px] sm:text-[10px] uppercase font-medium" style={{ color: colors.textMuted }}>Speed</span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              <div className="w-3 h-1.5 sm:w-4 sm:h-2 rounded-sm" style={{ background: getSpeedColor(3, appTheme) }} />
              <div className="w-3 h-1.5 sm:w-4 sm:h-2 rounded-sm" style={{ background: getSpeedColor(8, appTheme) }} />
              <div className="w-3 h-1.5 sm:w-4 sm:h-2 rounded-sm" style={{ background: getSpeedColor(15, appTheme) }} />
              <div className="w-3 h-1.5 sm:w-4 sm:h-2 rounded-sm" style={{ background: getSpeedColor(22, appTheme) }} />
              <div className="w-3 h-1.5 sm:w-4 sm:h-2 rounded-sm" style={{ background: getSpeedColor(35, appTheme) }} />
            </div>
            <span className="text-[7px] sm:text-[9px]" style={{ color: colors.textMuted }}>slow → fast</span>
          </div>
        </div>
      )}

      {/* Recenter Button - Shows when user pans away (theme-aware) */}
      <AnimatePresence>
        {!isFollowing && userPosition && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={handleRecenter}
            className="absolute bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full font-medium shadow-lg transition-colors"
            style={{ 
              backgroundColor: colors.primary,
              color: '#ffffff'
            }}
          >
            <Crosshair className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="text-xs sm:text-sm">Recenter</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-16 sm:bottom-20 left-2 sm:left-3 right-2 sm:right-3 z-10"
          >
            <div 
              className="flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl backdrop-blur-xl border"
              style={{ 
                backgroundColor: `${colors.primary}20`,
                borderColor: `${colors.primary}40`,
                color: colors.primary
              }}
            >
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MapLibre default controls styling override */}
      <style jsx global>{`
        .maplibregl-ctrl-group {
          background: rgba(15, 23, 42, 0.9) !important;
          backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 12px !important;
          overflow: hidden;
        }
        .maplibregl-ctrl-group button {
          width: 36px !important;
          height: 36px !important;
        }
        .maplibregl-ctrl-group button:not(:disabled):hover {
          background: rgba(255, 255, 255, 0.1) !important;
        }
        .maplibregl-ctrl-icon {
          filter: brightness(0) invert(1) !important;
        }
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
