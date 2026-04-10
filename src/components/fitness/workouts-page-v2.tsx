"use client";

/**
 * Workouts Page - Premium iOS-Grade Experience v2
 * 
 * A comprehensive workout tracking experience with:
 * - Live GPS tracking with big real-time map
 * - Route following mode
 * - Heart Rate monitor pairing (BLE)
 * - Photo attachments
 * - Background GPS optimization (Capacitor)
 * - Real-time metrics with haptic feedback
 * - Post-workout AI insights
 * 
 * @module components/fitness/workouts-page-v2
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  Play, Pause, Square, MapPin, Timer, Flame, Activity,
  TrendingUp, ChevronRight, Award, Heart, Zap, Mountain,
  CheckCircle, Flag, Navigation, Share2, Download, Camera,
  FileText, X, Loader2, WifiOff, Lock, Unlock, Trophy,
  Target, Coffee, Sunrise, Sunset, Moon, RefreshCw,
  Bluetooth, BluetoothOff, Battery, Image as ImageIcon, Trash2, Plus,
  BluetoothSearching, AlertCircle, Calendar, Clock, Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from '@/lib/mobile-api';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useApp } from "@/contexts/app-context";
import { useSupabaseAuth } from "@/lib/supabase/auth-context";
import { useGPSTracking } from "@/hooks/use-gps-tracking";
import { usePhotoCapture, WorkoutPhoto } from "@/hooks/use-photo-capture";
import { useHeartRateMonitor } from "@/hooks/use-heart-rate-monitor";
import { useBackgroundGPS } from "@/hooks/use-background-gps";
import {
  formatDuration, formatDistance, formatPace, formatSpeed,
  MetricsSnapshot, GPSPoint, TrackingSession, generateGPX,
} from "@/lib/gps-tracking";
import { LiveTrackingMap, GeoPoint } from "@/components/fitness/live-tracking-map";
import { ProvenanceTag } from "@/components/fitness/provenance-tag";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface Workout {
  id: string;
  activityType: string;
  workoutType: string;
  name: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  activeDuration: number | null; // in seconds
  distanceMeters: number | null;
  routeData: string | null;
  elevationGain: number | null;
  elevationLoss?: number | null;
  avgPace: number | null;
  maxPace?: number | null;
  avgSpeed?: number | null;
  maxSpeed?: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
  trainingLoad?: number | null;
  isPR: boolean;
  prType: string | null;
  notes: string | null;
  rating: number | null;
  photoUrls?: string[] | null;
  splits?: any;
  weatherData?: any;
  deviceSource?: string | null;
}

interface ActivityType {
  id: string;
  name: string;
  icon: React.ReactNode;
  met: number;
  color: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ACTIVITY_TYPES: ActivityType[] = [
  { id: "run", name: "Run", icon: <Activity className="w-5 h-5" />, met: 9.8, color: "#10b981" },
  { id: "cycle", name: "Ride", icon: <Navigation className="w-5 h-5" />, met: 7.5, color: "#3b82f6" },
  { id: "walk", name: "Walk", icon: <MapPin className="w-5 h-5" />, met: 3.5, color: "#22c55e" },
  { id: "hike", name: "Hike", icon: <Mountain className="w-5 h-5" />, met: 6.0, color: "#f59e0b" },
  { id: "swim", name: "Swim", icon: <Zap className="w-5 h-5" />, met: 8.0, color: "#06b6d4" },
  { id: "other", name: "Other", icon: <Target className="w-5 h-5" />, met: 5.0, color: "#6b7280" },
];

// Helper function to get Tailwind background color class for activity
const getActivityBgClass = (activityId: string) => {
  switch (activityId) {
    case "run": return "bg-emerald-500";
    case "cycle": return "bg-blue-500";
    case "walk": return "bg-green-500";
    case "hike": return "bg-amber-500";
    case "swim": return "bg-cyan-500";
    case "other": return "bg-gray-500";
    default: return "bg-gray-500";
  }
};

// ═══════════════════════════════════════════════════════════════
// WORKOUT DETAIL SHEET
// ═══════════════════════════════════════════════════════════════

function WorkoutDetailSheet({
  workout,
  onClose,
}: {
  workout: Workout | null;
  onClose: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  
  const activity = workout ? ACTIVITY_TYPES.find(a => a.id === workout.activityType) : null;
  
  // Parse route data for map
  const routePoints = useMemo((): GeoPoint[] => {
    if (!workout?.routeData) return [];
    try {
      // Handle if routeData is already an object or a string
      const parsed = typeof workout.routeData === 'string' 
        ? JSON.parse(workout.routeData) 
        : workout.routeData;
      
      // Handle different route data formats
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => ({
          lat: p.lat || p.latitude,
          lon: p.lon || p.lng || p.longitude,
          elevation: p.altitude || p.elevation,
          timestamp: p.timestamp,
          heartRate: p.heartRate,
        }));
      }
      if (parsed.points) {
        return parsed.points.map((p: any) => ({
          lat: p.lat || p.latitude,
          lon: p.lon || p.lng || p.longitude,
          elevation: p.altitude || p.elevation,
          timestamp: p.timestamp,
        }));
      }
      if (parsed.coordinates) {
        return parsed.coordinates.map((p: any) => ({
          lat: p.lat || p[1],
          lon: p.lon || p[0],
        }));
      }
      return [];
    } catch {
      return [];
    }
     
  }, [workout]);
  
  // Format date
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Unknown date';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  const formatTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '--:--';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters: number | null) => {
    if (!meters) return '--';
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const formatPace = (pace: number | null) => {
    if (!pace) return '--:--';
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!workout) return null;

  return (
    <AnimatePresence>
      {workout && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          
          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Handle */}
            <div className="sticky top-0 bg-background z-10">
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-muted rounded-full" />
              </div>
            </div>
            
            {/* Header */}
            <div className="px-5 pb-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg",
                      activity ? getActivityBgClass(activity.id) : "bg-gray-500"
                    )}
                  >
                    {activity?.icon || <Activity className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">
                      {workout.name || activity?.name || "Workout"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(workout.startedAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* PR Badge */}
              {workout.isPR && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Personal Record! {workout.prType ? `• ${workout.prType}` : ''}
                  </span>
                </div>
              )}
            </div>
            
            {/* Route Map */}
            {routePoints.length > 0 && (
              <div className="px-5 pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Route
                </h3>
                <div className="rounded-2xl overflow-hidden border border-border/30">
                  <LiveTrackingMap
                    route={{ points: routePoints }}
                    height="200px"
                    showControls={false}
                  />
                </div>
              </div>
            )}
            
            {/* Time Info */}
            <div className="px-5 pt-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(workout.startedAt)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(workout.startedAt)}</span>
                </div>
              </div>
            </div>
            
            {/* Stats Grid */}
            <div className="px-5 pt-4 grid grid-cols-2 gap-3">
              <Card className="bg-card/50 border-border/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Timer className="w-3 h-3" /> Duration
                  </p>
                  <p className="text-2xl font-bold">{formatDuration(workout.durationMinutes)}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Ruler className="w-3 h-3" /> Distance
                  </p>
                  <p className="text-2xl font-bold">{formatDistance(workout.distanceMeters)}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Avg Pace
                  </p>
                  <p className="text-2xl font-bold">{formatPace(workout.avgPace)}<span className="text-xs text-muted-foreground ml-1">/km</span></p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-orange-500" /> Calories
                  </p>
                  <p className="text-2xl font-bold text-orange-500">{workout.caloriesBurned ? Math.round(workout.caloriesBurned) : '--'}</p>
                </CardContent>
              </Card>
            </div>
            
            {/* Additional Stats */}
            <div className="px-5 pt-4">
              <Card className="bg-card/50 border-border/30">
                <CardContent className="py-4 space-y-3">
                  {workout.avgHeartRate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Heart className="w-4 h-4 text-red-500" /> Avg Heart Rate
                      </span>
                      <span className="font-medium">{Math.round(workout.avgHeartRate)} bpm</span>
                    </div>
                  )}
                  {workout.maxHeartRate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Heart Rate</span>
                      <span className="font-medium">{workout.maxHeartRate} bpm</span>
                    </div>
                  )}
                  {workout.elevationGain && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Mountain className="w-4 h-4" /> Elevation Gain
                      </span>
                      <span className="font-medium">{Math.round(workout.elevationGain)} m</span>
                    </div>
                  )}
                  {workout.avgSpeed && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Speed</span>
                      <span className="font-medium">{workout.avgSpeed.toFixed(1)} km/h</span>
                    </div>
                  )}
                  {workout.trainingLoad && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Training Load</span>
                      <span className="font-medium">{workout.trainingLoad}</span>
                    </div>
                  )}
                  {workout.deviceSource && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Device</span>
                      <span className="font-medium">{workout.deviceSource}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Photos */}
            {(() => {
              // Parse photo URLs - handle various formats
              let photos: string[] = [];
              if (workout.photoUrls) {
                if (Array.isArray(workout.photoUrls)) {
                  photos = workout.photoUrls;
                } else if (typeof workout.photoUrls === 'string') {
                  try {
                    photos = JSON.parse(workout.photoUrls);
                  } catch { /* ignore */ }
                }
              }
              return photos.length > 0 ? (
                <div className="px-5 pt-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Photos ({photos.length})
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((url, i) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden bg-muted">
                        <img 
                          src={url} 
                          alt={`Workout photo ${i + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Hide broken image
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Rating */}
            {workout.rating && (
              <div className="px-5 pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Rating</h3>
                <div className="flex items-center justify-center gap-1 py-2">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <span
                      key={r}
                      className={cn(
                        "text-2xl",
                        r <= workout.rating! ? "" : "opacity-30"
                      )}
                    >
                      {r <= workout.rating! ? "⭐" : "☆"}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Notes */}
            {workout.notes && (
              <div className="px-5 pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes
                </h3>
                <Card className="bg-card/50 border-border/30">
                  <CardContent className="py-3">
                    <p className="text-sm">{workout.notes}</p>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Safe Area */}
            <div className="h-[env(safe-area-inset-bottom,16px)]" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// CAMERA MODAL
// ═══════════════════════════════════════════════════════════════

function CameraModal({
  isOpen,
  onClose,
  onCapture,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Start camera when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Stop camera when modal closes
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      return;
    }

    const startCamera = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError('Camera not available. Please check permissions.');
        console.error('Camera error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen, facingMode]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !stream) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    onCapture(dataUrl);
    onClose();
  }, [stream, onCapture, onClose]);

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black"
      >
        {/* Camera Preview */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white">Starting camera...</p>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center p-6">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-white mb-4">{error}</p>
              <Button onClick={onClose} variant="outline">Close</Button>
            </div>
          </div>
        )}

        {/* Top Controls */}
        <div className="absolute top-4 left-0 right-0 flex justify-between px-4">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          
          <button
            onClick={toggleCamera}
            className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center"
          >
            <RefreshCw className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <button
            onClick={handleCapture}
            disabled={isLoading || !!error}
            className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg disabled:opacity-50"
          >
            <div className="w-16 h-16 rounded-full border-4 border-gray-300" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKOUT HISTORY SECTION
// ═══════════════════════════════════════════════════════════════

function WorkoutHistorySection() {
  const { t } = useLocale();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    const fetchWorkouts = async () => {
      try {
        const response = await apiFetch('/api/workouts?limit=7&include_route=true');
        if (response.ok) {
          const data = await response.json();
          // FIX: Map snake_case from API to camelCase for frontend
          const rawWorkouts = data.workouts || data || [];
          const mappedWorkouts = rawWorkouts.map((w: any) => ({
            id: w.id,
            activityType: w.activity_type,
            workoutType: w.workout_type,
            name: w.name,
            startedAt: w.started_at,
            completedAt: w.completed_at,
            durationMinutes: w.duration_minutes,
            activeDuration: w.active_duration, // in seconds
            distanceMeters: w.distance_meters,
            routeData: w.route_data,
            elevationGain: w.elevation_gain,
            elevationLoss: w.elevation_loss,
            avgPace: w.avg_pace,
            maxPace: w.max_pace,
            avgSpeed: w.avg_speed,
            maxSpeed: w.max_speed,
            avgHeartRate: w.avg_heart_rate,
            maxHeartRate: w.max_heart_rate,
            caloriesBurned: w.calories_burned,
            trainingLoad: w.training_load,
            isPR: w.is_pr,
            prType: w.pr_type,
            notes: w.notes,
            rating: w.rating,
            photoUrls: w.photo_urls ? (Array.isArray(w.photo_urls) ? w.photo_urls : 
              (typeof w.photo_urls === 'string' ? JSON.parse(w.photo_urls) : [])) : null,
            splits: w.splits,
            weatherData: w.weather_data,
            deviceSource: w.device_source,
          }));
          setWorkouts(mappedWorkouts);
        }
      } catch (err) {
        console.error('Error fetching workout history:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkouts();
  }, []);

  if (isLoading) {
    return (
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('workouts.recent')}</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('workouts.recent')}</span>
        </div>
        <div className="py-8 text-center bg-muted/30 rounded-2xl">
          <Activity className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('workouts.noWorkouts')} {t('workouts.startFirst')}</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Unknown date';
    
    const date = new Date(dateStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = date.toISOString().split('T')[0];
    const todayOnly = today.toISOString().split('T')[0];
    const yesterdayOnly = yesterday.toISOString().split('T')[0];

    if (dateOnly === todayOnly) return 'Today';
    if (dateOnly === yesterdayOnly) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatWorkoutDuration = (workout: Workout) => {
    // Use activeDuration (in seconds) if available, otherwise convert durationMinutes
    const totalSeconds = workout.activeDuration ?? (workout.durationMinutes ? workout.durationMinutes * 60 : 0);
    if (!totalSeconds) return '--:--';
    
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.round(totalSeconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatWorkoutDistance = (meters: number | null) => {
    if (!meters) return null;
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  };

  return (
    <div className="pt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('workouts.recent')}</span>
      </div>

      {/* Workout Cards */}
      <div className="space-y-3">
        {workouts.slice(0, 7).map((workout, index) => {
          const activity = ACTIVITY_TYPES.find(a => a.id === workout.activityType) || ACTIVITY_TYPES[5];
          
          return (
            <motion.button
              key={workout.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => setSelectedWorkout(workout)}
              className="w-full p-4 rounded-2xl bg-card/50 border border-border/30 hover:border-border/50 transition-all text-left"
            >
              <div className="flex items-center gap-4">
                {/* Activity Icon */}
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center text-white",
                  getActivityBgClass(workout.activityType)
                )}>
                  {activity.icon}
                </div>

                {/* Workout Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{activity.name}</span>
                    {workout.isPR && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-amber-500/50 text-amber-500">
                        PR
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(workout.startedAt)}</span>
                </div>

                {/* Stats */}
                <div className="text-right">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Timer className="w-3.5 h-3.5" />
                      <span>{formatWorkoutDuration(workout)}</span>
                    </div>
                    {formatWorkoutDistance(workout.distanceMeters) && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{formatWorkoutDistance(workout.distanceMeters)}</span>
                      </div>
                    )}
                  </div>
                  {workout.caloriesBurned && (
                    <div className="flex items-center justify-end gap-1 mt-1 text-xs text-orange-500">
                      <Flame className="w-3 h-3" />
                      <span>{Math.round(workout.caloriesBurned)} kcal</span>
                    </div>
                  )}
                </div>
                
                {/* Chevron */}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </motion.button>
          );
        })}
      </div>
      
      {/* Workout Detail Sheet */}
      <WorkoutDetailSheet
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function getTimeOfDay(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function getTimeIcon() {
  const time = getTimeOfDay();
  switch (time) {
    case "morning": return <Sunrise className="w-4 h-4" />;
    case "afternoon": return <Coffee className="w-4 h-4" />;
    case "evening": return <Sunset className="w-4 h-4" />;
    case "night": return <Moon className="w-4 h-4" />;
  }
}

function getGreeting(name: string): string {
  const time = getTimeOfDay();
  const greetings = {
    morning: [`Good morning, ${name}!`, `Rise and shine, ${name}!`],
    afternoon: [`Good afternoon, ${name}!`, `Hey ${name}!`],
    evening: [`Good evening, ${name}!`, `End your day strong, ${name}!`],
    night: [`Night owl session, ${name}?`, `Burning midnight oil, ${name}?`],
  };
  return greetings[time][Math.floor(Math.random() * 2)];
}

// ═══════════════════════════════════════════════════════════════
// ACTIVITY SELECTOR
// ═══════════════════════════════════════════════════════════════

function ActivitySelector({
  selected,
  onSelect,
  disabled,
}: {
  selected: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="grid grid-cols-3 gap-2">
      {ACTIVITY_TYPES.map((activity, index) => (
        <motion.button
          key={activity.id}
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.03 }}
          whileTap={disabled || prefersReducedMotion ? {} : { scale: 0.95 }}
          onClick={() => !disabled && onSelect(activity.id)}
          disabled={disabled}
          className={cn(
            "relative p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5",
            selected === activity.id
              ? "border-transparent bg-opacity-20"
              : "border-border/30 hover:border-border/50 bg-card/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={selected === activity.id ? {
            borderColor: activity.color,
            backgroundColor: `${activity.color}15`,
          } : {}}
          aria-label={`Select ${activity.name}`}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center text-white",
              getActivityBgClass(activity.id)
            )}
          >
            {activity.icon}
          </div>
          <span className={cn(
            "text-xs font-medium",
            selected === activity.id ? "" : "text-muted-foreground"
          )}>
            {activity.name}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HEART RATE WIDGET
// ═══════════════════════════════════════════════════════════════

function HeartRateWidget({
  heartRate,
  isConnected,
  isConnecting,
  device,
  onConnect,
  onDisconnect,
  stats,
}: {
  heartRate: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  device: { name: string } | null;
  onConnect: () => void;
  onDisconnect: () => void;
  stats: { min: number; max: number; average: number };
}) {
  const { t } = useLocale();
  
  const getZone = (hr: number) => {
    if (hr < 120) return { name: 'Recovery', color: 'text-blue-400' };
    if (hr < 140) return { name: 'Endurance', color: 'text-green-400' };
    if (hr < 160) return { name: 'Tempo', color: 'text-yellow-400' };
    if (hr < 180) return { name: 'Threshold', color: 'text-orange-400' };
    return { name: 'VO2 Max', color: 'text-red-400' };
  };

  if (!isConnected) {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onConnect}
        disabled={isConnecting}
        className="w-full p-4 rounded-2xl bg-card/80 border border-border/30 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            {isConnecting ? (
              <BluetoothSearching className="w-5 h-5 text-blue-500 animate-pulse" />
            ) : (
              <BluetoothOff className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">Heart Rate Monitor</p>
            <p className="text-xs text-muted-foreground">
              {isConnecting ? t('workouts.connecting') : t('workouts.tapToPair')}
            </p>
          </div>
        </div>
        <Bluetooth className="w-5 h-5 text-muted-foreground" />
      </motion.button>
    );
  }

  const zone = heartRate ? getZone(heartRate) : null;

  return (
    <div className="p-4 rounded-2xl bg-card/80 border border-border/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="w-3 h-3 rounded-full bg-red-500"
          />
          <span className="text-sm font-medium">{device?.name || 'HR Monitor'}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDisconnect}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          Disconnect
        </Button>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1">
          <p className={cn("text-5xl font-bold tabular-nums", zone?.color || 'text-red-500')}>
            {heartRate || '--'}
          </p>
          <p className="text-xs text-muted-foreground">BPM {zone && `• ${zone.name}`}</p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div className="flex gap-4">
            <div>
              <p className="text-xs">MIN</p>
              <p className="font-medium tabular-nums">{stats.min || '--'}</p>
            </div>
            <div>
              <p className="text-xs">AVG</p>
              <p className="font-medium tabular-nums">{stats.average || '--'}</p>
            </div>
            <div>
              <p className="text-xs">MAX</p>
              <p className="font-medium tabular-nums">{stats.max || '--'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHOTO GALLERY
// ═══════════════════════════════════════════════════════════════

function PhotoGallery({
  photos,
  isCapturing,
  onCapture,
  onRemove,
}: {
  photos: WorkoutPhoto[];
  isCapturing: boolean;
  onCapture: () => void;
  onRemove: (id: string) => void;
}) {
  const [selectedPhoto, setSelectedPhoto] = useState<WorkoutPhoto | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Photos</p>
        <Button
          size="sm"
          variant="outline"
          onClick={onCapture}
          disabled={isCapturing}
          className="h-8"
        >
          {isCapturing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Camera className="w-4 h-4 mr-1.5" />
              Add Photo
            </>
          )}
        </Button>
      </div>

      {photos.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos.map((photo) => (
            <motion.button
              key={photo.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setSelectedPhoto(photo)}
              className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden group"
            >
              <img
                src={photo.thumbnail}
                alt="Workout photo"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-white" />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(photo.id);
                }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center p-6 rounded-xl bg-muted/30 border border-dashed border-border/50">
          <div className="text-center">
            <Camera className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No photos yet</p>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setSelectedPhoto(null)}
          >
            <img
              src={selectedPhoto.dataUrl}
              alt="Workout photo"
              className="max-w-full max-h-full object-contain"
            />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
              aria-label="Close photo preview"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// METRICS DISPLAY
// ═══════════════════════════════════════════════════════════════

function MetricsDisplay({
  metrics,
  elapsedTime,
  heartRate,
  activityType,
}: {
  metrics: MetricsSnapshot | null;
  elapsedTime: number;
  heartRate: number | null;
  activityType: string;
}) {
  const activity = ACTIVITY_TYPES.find(a => a.id === activityType);

  const mainMetrics = [
    { label: 'Distance', value: metrics ? formatDistance(metrics.distance) : '0.00', unit: 'km', icon: MapPin, color: 'text-emerald-500' },
    { label: 'Duration', value: formatDuration(elapsedTime), unit: '', icon: Timer, color: 'text-blue-500' },
    { label: 'Pace', value: metrics ? formatPace(metrics.avgPace) : '--:--', unit: '/km', icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Calories', value: metrics ? Math.round(metrics.calories).toString() : '0', unit: 'kcal', icon: Flame, color: 'text-orange-500' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {mainMetrics.map((metric) => (
        <div key={metric.label} className="text-center">
          <metric.icon className={cn("w-4 h-4 mx-auto mb-1", metric.color)} />
          <p className="text-xl font-bold tabular-nums">{metric.value}</p>
          <p className="text-[10px] text-muted-foreground">{metric.label}</p>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN WORKOUTS PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════

export function WorkoutsPage() {
  const prefersReducedMotion = useReducedMotion();
  const { latestWeight, addWorkout } = useApp();
  const { profile } = useSupabaseAuth();
  const { t } = useLocale();

  // Helper to translate activity names
  const getActivityName = useCallback((activityId: string): string => {
    switch (activityId) {
      case 'run': return t('workouts.run');
      case 'cycle': return t('workouts.ride');
      case 'walk': return t('workouts.walk');
      case 'hike': return t('workouts.hike');
      case 'swim': return t('workouts.swim');
      case 'other': return t('workouts.other');
      default: return activityId;
    }
  }, [t]);

  // State
  const [selectedActivity, setSelectedActivity] = useState('run');
  const [showPostWorkout, setShowPostWorkout] = useState(false);
  const [completedSession, setCompletedSession] = useState<TrackingSession | null>(null);
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  // Hooks
  const {
    session,
    metrics,
    isTracking,
    isPaused,
    isOffline,
    gpsError,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
    addLap,
    fusionEngineRef,
  } = useGPSTracking(latestWeight?.value || 70);

  const {
    photos,
    isCapturing: isCapturingPhoto,
    captureFromCamera,
    selectFromGallery,
    addPhoto,
    removePhoto,
    clearPhotos,
  } = usePhotoCapture();

  const {
    isConnected: hrConnected,
    isConnecting: hrConnecting,
    device: hrDevice,
    heartRate,
    stats: hrStats,
    connect: connectHR,
    disconnect: disconnectHR,
  } = useHeartRateMonitor();

  const {
    isTracking: isBackgroundTracking,
    trackingState,
    activityState,
    startBackgroundTracking,
    stopBackgroundTracking,
  } = useBackgroundGPS();

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTracking && !isPaused && session) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - session.startedAt) / 1000));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, isPaused, session]);

  // Start workout
  const handleStart = useCallback(async () => {
    await startTracking(selectedActivity);
    startBackgroundTracking();
    setElapsedTime(0);
  }, [selectedActivity, startTracking, startBackgroundTracking]);

  // Stop workout
  const handleStop = useCallback(async () => {
    const completed = await stopTracking();
    stopBackgroundTracking();
    if (completed) {
      setCompletedSession(completed);
      setShowPostWorkout(true);
    }
  }, [stopTracking, stopBackgroundTracking]);

  // Save workout
  const handleSave = useCallback(async () => {
    if (!completedSession) return;

    try {
      // Prepare route data from session points
      const routeDataForDb = completedSession.points.length > 0 ? {
        points: completedSession.points.map(p => ({
          lat: p.lat,
          lon: p.lon,
          elevation: p.altitude,
          timestamp: p.timestamp,
          heartRate: p.heartRate,
          speed: p.speed,
        }))
      } : null;

      // Prepare photo URLs (base64 data URLs)
      const photoUrls = photos.length > 0 ? photos.map(p => p.dataUrl) : null;

      await addWorkout({
        activityType: completedSession.activityType,
        workoutType: 'cardio',
        name: `${completedSession.activityType.charAt(0).toUpperCase() + completedSession.activityType.slice(1)} Workout`,
        startedAt: new Date(completedSession.startedAt).toISOString(),
        completedAt: new Date(completedSession.startedAt + completedSession.totalDuration * 1000).toISOString(),
        durationMinutes: Math.ceil(elapsedTime / 60) || 1,
        activeDuration: elapsedTime, // exact duration in seconds
        distanceMeters: completedSession.totalDistance,
        caloriesBurned: completedSession.calories,
        avgPace: completedSession.avgPace,
        avgHeartRate: completedSession.avgHeartRate || 0,
        maxHeartRate: hrStats?.max || 0,
        avgSpeed: completedSession.avgSpeed,
        elevationGain: completedSession.elevationGain,
        elevationLoss: completedSession.elevationLoss,
        routeData: routeDataForDb,
        photos: photoUrls,
        notes: notes,
        rating: rating,
        source: 'manual',
      });
    } catch (err) {
      console.error('Failed to save workout:', err);
    }

    setShowPostWorkout(false);
    setCompletedSession(null);
    clearPhotos();
    setNotes('');
    setRating(null);
    setElapsedTime(0);
  }, [completedSession, photos, notes, rating, hrStats, clearPhotos, addWorkout, elapsedTime]);

  // Discard workout
  const handleDiscard = useCallback(() => {
    setShowPostWorkout(false);
    setCompletedSession(null);
    clearPhotos();
    setNotes('');
    setRating(null);
    setElapsedTime(0);
  }, [clearPhotos]);

  // Export GPX
  const handleExportGPX = useCallback(() => {
    if (!completedSession) return;
    const gpx = generateGPX(completedSession.points);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workout-${new Date().toISOString().split('T')[0]}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [completedSession]);

  // Convert session points to GeoPoints for map
  const routeData = useMemo((): { points: GeoPoint[] } | null => {
    if (!session || session.points.length === 0) return null;
    return {
      points: session.points.map(p => ({
        lat: p.lat,
        lon: p.lon,
        elevation: p.altitude ?? undefined,
        timestamp: p.timestamp,
        heartRate: p.heartRate ?? undefined,
        speed: p.speed ?? undefined,
        heading: p.heading ?? undefined,
        accuracy: p.accuracy ?? undefined,
      })),
    };
  }, [session]);

  // Current position for map
  const currentPosition = useMemo((): GeoPoint | null => {
    if (!session || session.points.length === 0) return null;
    const lastPoint = session.points[session.points.length - 1];
    return {
      lat: lastPoint.lat,
      lon: lastPoint.lon,
      heading: lastPoint.heading ?? undefined,
      speed: lastPoint.speed ?? undefined,
      accuracy: lastPoint.accuracy ?? undefined,
    };
  }, [session]);

  const activity = ACTIVITY_TYPES.find(a => a.id === selectedActivity);

  // ═══════════════════════════════════════════════════════════════
  // POST-WORKOUT SUMMARY
  // ═══════════════════════════════════════════════════════════════

  if (showPostWorkout && completedSession) {
    return (
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-background"
      >
        <div className="p-4 pb-6">
          {/* Header */}
          <div className="text-center py-6">
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              className={cn(
                "w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4",
                activity ? getActivityBgClass(activity.id) : "bg-gray-500"
              )}
            >
              <CheckCircle className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold">{t('workouts.complete')}</h1>
            <p className="text-muted-foreground mt-1">{activity?.name} • {formatDistance(metrics?.distance || 0)} km</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: t('workouts.distance'), value: formatDistance(metrics?.distance || 0), unit: 'km' },
              { label: t('workouts.duration'), value: formatDuration(elapsedTime), unit: '' },
              { label: t('workouts.avgPace'), value: formatPace(metrics?.avgPace || 0), unit: '/km' },
              { label: t('workouts.calories'), value: Math.round(metrics?.calories || 0).toString(), unit: 'kcal' },
            ].map((stat) => (
              <Card key={stat.label} className="bg-card/50">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {stat.value}
                    <span className="text-xs text-muted-foreground ml-1">{stat.unit}</span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Heart Rate Summary */}
          {hrConnected && (
            <Card className="bg-card/50 mb-4">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-4 h-4 text-red-500" />
                  <p className="text-sm font-medium">{t('workouts.heartRate')}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('workouts.min')}</p>
                    <p className="text-xl font-bold tabular-nums">{hrStats.min || '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('workouts.avg')}</p>
                    <p className="text-xl font-bold tabular-nums">{hrStats.average || '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('workouts.max')}</p>
                    <p className="text-xl font-bold tabular-nums">{hrStats.max || '--'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Photos */}
          <Card className="bg-card/50 mb-4">
            <CardContent className="py-4">
              <p className="text-sm font-medium mb-3">{t('workouts.photos')} {photos.length > 0 && `(${photos.length})`}</p>
              
              {/* Photo Actions */}
              <div className="flex gap-2 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCamera(true)}
                  disabled={isCapturingPhoto}
                  className="flex-1"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Take Photo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectFromGallery()}
                  disabled={isCapturingPhoto}
                  className="flex-1"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Upload Photo
                </Button>
              </div>
              
              {/* Photo Gallery */}
              {photos.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative shrink-0">
                      <img
                        src={photo.thumbnail}
                        alt="Workout"
                        className="w-20 h-20 rounded-xl object-cover"
                      />
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Add photos to remember your workout
                </p>
              )}
            </CardContent>
          </Card>

          {/* Rating */}
          <Card className="bg-card/50 mb-4">
            <CardContent className="py-4">
              <p className="text-sm font-medium mb-3">{t('workouts.howDidItFeel')}</p>
              <div className="flex gap-2">
                {['😫', '😔', '😐', '😊', '🤩'].map((emoji, i) => (
                  <button
                    key={i}
                    onClick={() => setRating(i + 1)}
                    className={cn(
                      "flex-1 h-12 rounded-xl border-2 text-xl transition-all",
                      rating === i + 1
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Notes + Actions */}
          <Card className="bg-card/50">
            <CardContent className="py-4">
              <p className="text-sm font-medium mb-2">{t('workouts.notes')}</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('workouts.notesPlaceholder')}
                className="w-full h-24 p-3 rounded-xl bg-muted resize-none border-none focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              />
            </CardContent>
            <CardContent className="pt-0">
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleDiscard} className="flex-1">
                  {t('workouts.discard')}
                </Button>
                <Button onClick={handleSave} className="flex-1 bg-emerald-500 hover:bg-emerald-600">
                  {t('workouts.save')}
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Camera Modal */}
        <CameraModal
          isOpen={showCamera}
          onClose={() => setShowCamera(false)}
          onCapture={(dataUrl) => {
            addPhoto(dataUrl);
          }}
        />
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TRACKING SCREEN
  // ═══════════════════════════════════════════════════════════════

  if (isTracking) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Big Map - Full width, takes available space */}
        <div className="shrink-0">
          <LiveTrackingMap
            route={routeData}
            currentPosition={currentPosition}
            height="45vh"
            showControls={true}
            showFollowingControls={true}
            isTracking={isTracking}
            isPaused={isPaused}
            totalDistance={session?.totalDistance || metrics?.distance || 0}
            totalDuration={session?.totalDuration || metrics?.duration || elapsedTime || 0}
            elevationGain={session?.elevationGain || metrics?.elevationGain || 0}
            fusionEngineRef={fusionEngineRef}
            onPause={pauseTracking}
            onResume={resumeTracking}
            onStop={handleStop}
            onFullscreenChange={setMapFullscreen}
          />
        </div>

        {/* Metrics Overlay */}
        <div className="relative -mt-16 z-10 px-4">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl border border-border/30 p-4"
          >
            {/* Activity header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    activity ? getActivityBgClass(activity.id) : "bg-gray-500"
                  )}
                >
                  {activity?.icon}
                </div>
                <div>
                  <p className="font-medium">{activity?.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDuration(elapsedTime)}</span>
                    {isPaused && <Badge variant="outline" className="text-amber-500 border-amber-500/50">Paused</Badge>}
                  </div>
                </div>
              </div>
              <motion.div
                animate={isPaused ? {} : { scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: isPaused ? 0 : Infinity }}
                className={cn("w-3 h-3 rounded-full", isPaused ? "bg-amber-500" : "bg-red-500")}
              />
            </div>

            {/* Main Metrics */}
            <MetricsDisplay
              metrics={metrics}
              elapsedTime={elapsedTime}
              heartRate={heartRate}
              activityType={selectedActivity}
            />
          </motion.div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Heart Rate */}
          <HeartRateWidget
            heartRate={heartRate}
            isConnected={hrConnected}
            isConnecting={hrConnecting}
            device={hrDevice}
            onConnect={connectHR}
            onDisconnect={disconnectHR}
            stats={hrStats}
          />

          {/* Photos */}
          <Card className="bg-card/50">
            <CardContent className="py-4">
              <PhotoGallery
                photos={photos}
                isCapturing={isCapturingPhoto}
                onCapture={() => captureFromCamera({ includeLocation: true })}
                onRemove={removePhoto}
              />
            </CardContent>
          </Card>

          {/* Laps */}
          {session && session.laps.length > 0 && (
            <Card className="bg-card/50">
              <CardContent className="py-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-muted-foreground" />
                  Laps ({session.laps.length})
                </p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {session.laps.map((lap, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <Badge variant="outline" className="text-xs">Lap {lap.lapNumber}</Badge>
                      <span className="text-sm tabular-nums">{formatDuration(lap.duration)}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {lap.distance > 0 && `${(lap.distance / 1000).toFixed(2)}km`}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Control Buttons - Fixed at bottom */}
        <div className="shrink-0 p-4 bg-background border-t border-border">
          <div className="flex gap-3">
            {/* Lap */}
            <Button
              variant="outline"
              size="lg"
              onClick={addLap}
              disabled={isPaused || isLocked}
              className="w-16 h-16 rounded-2xl"
            >
              <Flag className="w-6 h-6" />
            </Button>

            {/* Pause/Resume */}
            <Button
              size="lg"
              onClick={isPaused ? resumeTracking : pauseTracking}
              disabled={isLocked}
              className="flex-1 h-16 rounded-2xl text-lg"
              style={{
                backgroundColor: isPaused ? activity?.color : '#f59e0b',
              }}
            >
              {isPaused ? (
                <>
                  <Play className="w-6 h-6 mr-2" fill="currentColor" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-6 h-6 mr-2" />
                  Pause
                </>
              )}
            </Button>

            {/* Stop */}
            <Button
              size="lg"
              onClick={handleStop}
              disabled={isLocked}
              className="w-16 h-16 rounded-2xl bg-red-500 hover:bg-red-600 disabled:opacity-50"
            >
              <Square className="w-6 h-6" fill="currentColor" />
            </Button>
          </div>

          {/* Lock toggle */}
          <button
            onClick={() => setIsLocked(!isLocked)}
            className="w-full py-2 flex items-center justify-center gap-2 text-xs text-muted-foreground"
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {isLocked ? t('workouts.controlsLocked') : t('workouts.tapToLock')}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // START SCREEN
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="text-center pt-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
            {getTimeIcon()}
            <span className="text-sm capitalize">{getTimeOfDay()}</span>
          </div>
          <h1 className="text-2xl font-bold">{getGreeting(profile?.name || 'there')}</h1>
          <p className="text-muted-foreground mt-1">{t('workouts.readyToTrack')}</p>
        </div>

        {/* Activity Selector */}
        <div>
          <p className="text-sm font-medium mb-3">{t('workouts.chooseActivity')}</p>
          <ActivitySelector
            selected={selectedActivity}
            onSelect={setSelectedActivity}
          />
        </div>

        {/* Heart Rate Pairing */}
        <HeartRateWidget
          heartRate={null}
          isConnected={hrConnected}
          isConnecting={hrConnecting}
          device={hrDevice}
          onConnect={connectHR}
          onDisconnect={disconnectHR}
          stats={hrStats}
        />

        {/* GPS Status */}
        {gpsError && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-500">{t('workouts.gpsError')}</p>
              <p className="text-xs text-muted-foreground">{gpsError}</p>
            </div>
          </div>
        )}

        {/* Start Button */}
        <div className="pt-4">
          <motion.button
            whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
            onClick={handleStart}
            disabled={!!gpsError}
            className="w-full h-16 rounded-2xl text-white font-semibold text-lg flex items-center justify-center gap-3 shadow-xl disabled:opacity-50"
            style={{
              backgroundColor: activity?.color,
              boxShadow: `0 8px 32px ${activity?.color}40`,
            }}
          >
            <Play className="w-6 h-6" fill="currentColor" />
            {t('workouts.start')} {getActivityName(selectedActivity)}
          </motion.button>

          <p className="text-center text-xs text-muted-foreground mt-3">
            {t('workouts.autoPauseGps')}
          </p>
        </div>

        {/* Features hint */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          {[
            { icon: Bluetooth, label: t('workouts.bleHeartRate'), desc: hrConnected ? t('workouts.connected') : t('workouts.optional') },
            { icon: Camera, label: t('workouts.photoAttach'), desc: t('workouts.duringWorkout') },
            { icon: Navigation, label: t('workouts.routeFollowing'), desc: t('workouts.liveMap') },
            { icon: WifiOff, label: t('workouts.offlineReady'), desc: t('workouts.cachedMaps') },
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/30">
              <feature.icon className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground">{feature.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Workout History */}
        <WorkoutHistorySection />
      </div>
    </div>
  );
}

export default WorkoutsPage;
