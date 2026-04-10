/**
 * GPS Tracking Library
 * 
 * Provides accurate GPS tracking with offline persistence,
 * pace smoothing, distance calculation, and auto-pause detection.
 * 
 * @module lib/gps-tracking
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface GPSPoint {
  lat: number;
  lon: number;
  altitude?: number | null;
  timestamp: number;
  accuracy?: number | null; // meters
  speed?: number | null; // m/s
  heading?: number | null; // degrees
  heartRate?: number | null; // bpm
  cadence?: number | null; // steps per minute
  distance?: number; // cumulative distance in meters
}

export interface TrackingSession {
  id: string;
  activityType: string;
  startedAt: number;
  points: GPSPoint[];
  laps: LapData[];
  status: 'active' | 'paused' | 'stopped';
  isOffline: boolean;
  // Metrics
  totalDistance: number; // meters
  totalDuration: number; // seconds
  movingTime: number; // seconds
  elevationGain: number; // meters
  elevationLoss: number; // meters
  avgSpeed: number; // m/s
  avgPace: number; // min/km
  calories: number;
  avgHeartRate: number | null;
  avgCadence: number | null;
}

export interface LapData {
  lapNumber: number;
  startTime: number;
  endTime: number | null;
  distance: number; // meters
  duration: number; // seconds
  movingTime: number; // seconds
  avgPace: number | null; // min/km
  avgHeartRate: number | null;
  elevationGain: number;
  isAutoLap: boolean;
  trigger: 'manual' | 'auto' | 'distance';
}

export interface TrackingConfig {
  activityType: 'running' | 'cycling' | 'walking' | 'hiking' | 'swimming' | 'other';
  autoPause: boolean;
  autoPauseThreshold: number; // seconds without movement
  autoLap: boolean;
  autoLapDistance: number; // meters (default 1000 for 1km laps)
  gpsAccuracyFilter: boolean; // filter out low-accuracy points
  minAccuracy: number; // meters (default 20)
  smoothingWindow: number; // number of points for pace smoothing
  distanceSmoothing: boolean;
  // Battery modes
  lowPowerMode: boolean;
  gpsInterval: number; // ms between GPS updates
  backgroundGpsInterval: number; // ms when in background
}

export interface MetricsSnapshot {
  distance: number; // meters
  duration: number; // seconds
  movingTime: number; // seconds
  currentSpeed: number | null; // m/s
  avgSpeed: number; // m/s
  currentPace: number | null; // min/km
  avgPace: number; // min/km
  elevation: number | null; // meters
  elevationGain: number; // meters
  elevationLoss: number; // meters
  calories: number;
  heartRate: number | null;
  cadence: number | null;
  // Splits
  lastKmPace: number | null; // min/km for last km
  lastKmTime: number | null; // seconds for last km
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS_M = 6371000; // Earth's radius in meters
const DEFAULT_CONFIG: TrackingConfig = {
  activityType: 'running',
  autoPause: true,
  autoPauseThreshold: 5, // 5 seconds
  autoLap: false,
  autoLapDistance: 1000, // 1km
  gpsAccuracyFilter: true,
  minAccuracy: 20, // 20 meters
  smoothingWindow: 5,
  distanceSmoothing: true,
  lowPowerMode: false,
  gpsInterval: 1000, // 1 second
  backgroundGpsInterval: 5000, // 5 seconds
};

// MET values for calorie calculation (Metabolic Equivalent of Task)
const MET_VALUES: Record<string, number> = {
  running: 9.8,
  running_slow: 8.0,
  running_fast: 11.5,
  cycling: 7.5,
  cycling_slow: 4.0,
  cycling_fast: 10.0,
  walking: 3.5,
  walking_fast: 4.5,
  hiking: 6.0,
  swimming: 8.0,
  other: 5.0,
};

// ═══════════════════════════════════════════════════════════════
// Distance Calculation (Haversine Formula)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate distance between two GPS points using Haversine formula
 * Returns distance in meters
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Calculate distance with altitude adjustment (using Pythagorean theorem in 3D)
 * More accurate for routes with significant elevation changes
 */
export function distanceWithElevation(
  lat1: number,
  lon1: number,
  alt1: number | null | undefined,
  lat2: number,
  lon2: number,
  alt2: number | null | undefined
): number {
  const horizontalDistance = haversineDistance(lat1, lon1, lat2, lon2);
  
  // If no altitude data, just return horizontal distance
  if (alt1 == null || alt2 == null) {
    return horizontalDistance;
  }
  
  const elevationDiff = Math.abs(alt2 - alt1);
  
  // For small elevation differences, the correction is negligible
  // For significant climbs, this adds about 1m per 100m of horizontal per 10m climb
  return Math.sqrt(
    horizontalDistance * horizontalDistance + elevationDiff * elevationDiff
  );
}

// ═══════════════════════════════════════════════════════════════
// Pace & Speed Calculations
// ═══════════════════════════════════════════════════════════════

/**
 * Convert speed (m/s) to pace (min/km)
 */
export function speedToPace(speedMps: number): number {
  if (speedMps <= 0) return Infinity;
  return (1000 / speedMps) / 60; // min/km
}

/**
 * Convert pace (min/km) to speed (m/s)
 */
export function paceToSpeed(paceMinKm: number): number {
  if (paceMinKm <= 0 || !isFinite(paceMinKm)) return 0;
  return (1000 / paceMinKm) / 60; // m/s
}

/**
 * Format pace for display (MM:SS per km)
 */
export function formatPace(paceMinKm: number | null): string {
  if (paceMinKm == null || !isFinite(paceMinKm)) return '--:--';
  
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format speed for display (km/h or mph)
 */
export function formatSpeed(speedMps: number | null, unit: 'km/h' | 'mph' = 'km/h'): string {
  if (speedMps == null) return '--';
  
  const speed = unit === 'km/h' ? speedMps * 3.6 : speedMps * 2.237;
  return speed.toFixed(1);
}

/**
 * Smooth pace over a window of points to reduce GPS noise
 */
export function smoothPace(points: GPSPoint[], windowSize: number = 5): number | null {
  if (points.length < 2) return null;
  
  const recentPoints = points.slice(-windowSize);
  if (recentPoints.length < 2) return null;
  
  let totalDistance = 0;
  let totalTime = 0;
  
  for (let i = 1; i < recentPoints.length; i++) {
    const prev = recentPoints[i - 1];
    const curr = recentPoints[i];
    
    const dist = distanceWithElevation(
      prev.lat, prev.lon, prev.altitude,
      curr.lat, curr.lon, curr.altitude
    );
    const time = (curr.timestamp - prev.timestamp) / 1000; // seconds
    
    totalDistance += dist;
    totalTime += time;
  }
  
  if (totalDistance < 10 || totalTime < 1) return null; // Need at least 10m and 1s
  
  const avgSpeed = totalDistance / totalTime; // m/s
  return speedToPace(avgSpeed);
}

// ═══════════════════════════════════════════════════════════════
// Elevation Calculations
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate elevation gain and loss from a series of points
 * Uses a smoothing algorithm to filter out GPS noise
 */
export function calculateElevationChanges(
  points: GPSPoint[],
  smoothingThreshold: number = 2 // meters
): { gain: number; loss: number } {
  if (points.length < 2) return { gain: 0, loss: 0 };
  
  let gain = 0;
  let loss = 0;
  let lastElevation: number | null = null;
  
  for (const point of points) {
    if (point.altitude == null) continue;
    
    if (lastElevation === null) {
      lastElevation = point.altitude;
      continue;
    }
    
    const diff = point.altitude - lastElevation;
    
    // Only count changes larger than the threshold (filters GPS noise)
    if (Math.abs(diff) >= smoothingThreshold) {
      if (diff > 0) {
        gain += diff;
      } else {
        loss += Math.abs(diff);
      }
      lastElevation = point.altitude;
    }
  }
  
  return { gain, loss };
}

// ═══════════════════════════════════════════════════════════════
// Calorie Calculation
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate calories burned using MET formula
 * 
 * Formula: Calories = MET × Weight(kg) × Duration(hours)
 * 
 * With HR correction (if available): 
 * Calorie correction factor based on HR zones
 * 
 * @param activityType - Type of activity
 * @param durationSeconds - Duration in seconds
 * @param weightKg - User's weight in kg
 * @param avgHeartRate - Optional average heart rate for correction
 * @param maxHeartRate - Optional max heart rate for HR zone calculation
 */
export function calculateCalories(
  activityType: string,
  durationSeconds: number,
  weightKg: number,
  avgHeartRate?: number | null,
  maxHeartRate?: number | null,
  speed?: number | null
): number {
  // Get base MET value
  let met = MET_VALUES[activityType] || MET_VALUES.other;
  
  // Adjust MET based on speed if available
  if (speed != null) {
    const speedKmh = speed * 3.6;
    
    if (activityType === 'running') {
      if (speedKmh < 8) met = MET_VALUES.running_slow;
      else if (speedKmh > 12) met = MET_VALUES.running_fast;
    } else if (activityType === 'cycling') {
      if (speedKmh < 15) met = MET_VALUES.cycling_slow;
      else if (speedKmh > 25) met = MET_VALUES.cycling_fast;
    } else if (activityType === 'walking') {
      if (speedKmh > 5) met = MET_VALUES.walking_fast;
    }
  }
  
  // HR-based correction factor (if HR data available)
  if (avgHeartRate != null && maxHeartRate != null && maxHeartRate > 0) {
    const hrRatio = avgHeartRate / maxHeartRate;
    
    // HR zones correction
    // Zone 1 (50-60%): 0.8-0.9 × MET
    // Zone 2 (60-70%): 0.9-1.0 × MET
    // Zone 3 (70-80%): 1.0-1.1 × MET
    // Zone 4 (80-90%): 1.1-1.2 × MET
    // Zone 5 (90-100%): 1.2-1.3 × MET
    const hrCorrection = 0.7 + (hrRatio * 0.6);
    met *= Math.min(1.3, Math.max(0.8, hrCorrection));
  }
  
  const durationHours = durationSeconds / 3600;
  const calories = met * weightKg * durationHours;
  
  return Math.round(calories);
}

// ═══════════════════════════════════════════════════════════════
// Auto-Pause Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Detect if user has stopped moving (for auto-pause)
 */
export function shouldAutoPause(
  recentPoints: GPSPoint[],
  threshold: number = 5, // seconds
  minMovement: number = 2 // meters
): boolean {
  if (recentPoints.length < 2) return false;
  
  const now = Date.now();
  const thresholdMs = threshold * 1000;
  
  // Get points within the threshold time
  const recentTimePoints = recentPoints.filter(
    p => now - p.timestamp < thresholdMs
  );
  
  if (recentTimePoints.length < 2) return false;
  
  // Calculate total distance in the threshold window
  let totalDistance = 0;
  for (let i = 1; i < recentTimePoints.length; i++) {
    const prev = recentTimePoints[i - 1];
    const curr = recentTimePoints[i];
    totalDistance += haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
  }
  
  return totalDistance < minMovement;
}

/**
 * Calculate moving time (excludes paused time)
 */
export function calculateMovingTime(
  points: GPSPoint[],
  pauseThreshold: number = 2 // m/s threshold for "moving"
): number {
  if (points.length < 2) return 0;
  
  let movingTime = 0;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds
    
    // Check if moving (either by speed or distance)
    const distance = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
    const speed = distance / timeDiff;
    
    if (speed > pauseThreshold) {
      movingTime += timeDiff;
    }
  }
  
  return movingTime;
}

// ═══════════════════════════════════════════════════════════════
// GPX Export/Import
// ═══════════════════════════════════════════════════════════════

/**
 * Generate GPX content from tracking points
 */
export function generateGPX(
  points: GPSPoint[],
  name: string = 'Workout',
  activityType: string = 'running'
): string {
  const startTime = points[0]?.timestamp 
    ? new Date(points[0].timestamp).toISOString() 
    : new Date().toISOString();
  
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Progress Companion"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${startTime}</time>
    <type>${activityType}</type>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>${activityType}</type>
    <trkseg>
`;
  
  for (const point of points) {
    const time = new Date(point.timestamp).toISOString();
    gpx += `      <trkpt lat="${point.lat}" lon="${point.lon}">
        <time>${time}</time>`;
    
    if (point.altitude != null) {
      gpx += `
        <ele>${point.altitude.toFixed(1)}</ele>`;
    }
    
    // Add extensions for HR and cadence
    if (point.heartRate != null || point.cadence != null) {
      gpx += `
        <extensions>
          <gpxtpx:TrackPointExtension>`;
      if (point.heartRate != null) {
        gpx += `
            <gpxtpx:hr>${point.heartRate}</gpxtpx:hr>`;
      }
      if (point.cadence != null) {
        gpx += `
            <gpxtpx:cad>${point.cadence}</gpxtpx:cad>`;
      }
      gpx += `
          </gpxtpx:TrackPointExtension>
        </extensions>`;
    }
    
    gpx += `
      </trkpt>
`;
  }
  
  gpx += `    </trkseg>
  </trk>
</gpx>`;
  
  return gpx;
}

/**
 * Parse GPX content to tracking points
 */
export function parseGPX(gpxContent: string): {
  points: GPSPoint[];
  name: string;
  activityType: string;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxContent, 'application/xml');
  
  const points: GPSPoint[] = [];
  let name = 'Imported Route';
  let activityType = 'running';
  
  // Get metadata
  const nameEl = doc.querySelector('gpx > metadata > name');
  if (nameEl?.textContent) name = nameEl.textContent;
  
  const typeEl = doc.querySelector('gpx > metadata > type');
  if (typeEl?.textContent) activityType = typeEl.textContent;
  
  // Parse track points
  const trkpts = doc.querySelectorAll('trkpt');
  
  let cumulativeDistance = 0;
  let prevPoint: GPSPoint | null = null;
  
  trkpts.forEach((trkpt, index) => {
    const lat = parseFloat(trkpt.getAttribute('lat') || '0');
    const lon = parseFloat(trkpt.getAttribute('lon') || '0');
    
    // Parse time
    const timeEl = trkpt.querySelector('time');
    const timestamp = timeEl?.textContent 
      ? new Date(timeEl.textContent).getTime() 
      : Date.now() + index * 1000;
    
    // Parse elevation
    const eleEl = trkpt.querySelector('ele');
    const altitude = eleEl?.textContent ? parseFloat(eleEl.textContent) : null;
    
    // Parse extensions
    let heartRate: number | null = null;
    let cadence: number | null = null;
    
    const hrEl = trkpt.querySelector('hr, gpxtpx\\:hr');
    if (hrEl?.textContent) heartRate = parseInt(hrEl.textContent);
    
    const cadEl = trkpt.querySelector('cad, gpxtpx\\:cad');
    if (cadEl?.textContent) cadence = parseInt(cadEl.textContent);
    
    // Calculate cumulative distance
    if (prevPoint) {
      cumulativeDistance += distanceWithElevation(
        prevPoint.lat, prevPoint.lon, prevPoint.altitude,
        lat, lon, altitude
      );
    }
    
    const point: GPSPoint = {
      lat,
      lon,
      altitude,
      timestamp,
      heartRate,
      cadence,
      distance: cumulativeDistance,
    };
    
    points.push(point);
    prevPoint = point;
  });
  
  return { points, name, activityType };
}

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculate total distance from points
 */
export function calculateTotalDistance(points: GPSPoint[]): number {
  if (points.length < 2) return 0;
  
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    distance += distanceWithElevation(
      prev.lat, prev.lon, prev.altitude,
      curr.lat, curr.lon, curr.altitude
    );
  }
  
  return distance;
}

/**
 * Calculate average speed (m/s) from points
 */
export function calculateAverageSpeed(points: GPSPoint[], movingTimeOnly: boolean = true): number {
  if (points.length < 2) return 0;
  
  const distance = calculateTotalDistance(points);
  const duration = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
  const movingTime = movingTimeOnly ? calculateMovingTime(points) : duration;
  
  if (movingTime <= 0) return 0;
  
  return distance / movingTime;
}

/**
 * Calculate all metrics from a set of points
 */
export function calculateAllMetrics(
  points: GPSPoint[],
  weightKg: number = 70,
  maxHeartRate?: number,
  activityType: string = 'running'
): MetricsSnapshot {
  if (points.length < 1) {
    return {
      distance: 0,
      duration: 0,
      movingTime: 0,
      currentSpeed: null,
      avgSpeed: 0,
      currentPace: null,
      avgPace: 0,
      elevation: null,
      elevationGain: 0,
      elevationLoss: 0,
      calories: 0,
      heartRate: null,
      cadence: null,
      lastKmPace: null,
      lastKmTime: null,
    };
  }
  
  const distance = calculateTotalDistance(points);
  const duration = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
  const movingTime = calculateMovingTime(points);
  const avgSpeed = movingTime > 0 ? distance / movingTime : 0;
  const { gain: elevationGain, loss: elevationLoss } = calculateElevationChanges(points);
  
  // Current speed from last two points
  let currentSpeed: number | null = null;
  if (points.length >= 2) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const dist = haversineDistance(prev.lat, prev.lon, last.lat, last.lon);
    const time = (last.timestamp - prev.timestamp) / 1000;
    if (time > 0) currentSpeed = dist / time;
  }
  
  // Calculate calories (using actual activity type and avg speed for MET adjustment)
  const calories = calculateCalories(
    activityType,
    movingTime,
    weightKg,
    null, // avgHeartRate calculated below
    maxHeartRate,
    avgSpeed
  );
  
  // Average heart rate
  const hrPoints = points.filter(p => p.heartRate != null);
  const avgHeartRate = hrPoints.length > 0
    ? hrPoints.reduce((sum, p) => sum + (p.heartRate || 0), 0) / hrPoints.length
    : null;
  
  // Average cadence
  const cadPoints = points.filter(p => p.cadence != null);
  const avgCadence = cadPoints.length > 0
    ? cadPoints.reduce((sum, p) => sum + (p.cadence || 0), 0) / cadPoints.length
    : null;
  
  // Last km pace
  let lastKmPace: number | null = null;
  let lastKmTime: number | null = null;
  
  if (distance >= 1000) {
    // Find the points that make up the last km
    let distFromEnd = 0;
    let lastKmStartIdx = points.length - 1;
    
    for (let i = points.length - 1; i > 0; i--) {
      const curr = points[i];
      const prev = points[i - 1];
      distFromEnd += haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
      
      if (distFromEnd >= 1000) {
        lastKmStartIdx = i - 1;
        break;
      }
    }
    
    if (lastKmStartIdx > 0) {
      lastKmTime = (points[points.length - 1].timestamp - points[lastKmStartIdx].timestamp) / 1000;
      lastKmPace = speedToPace(1000 / lastKmTime);
    }
  }
  
  return {
    distance,
    duration,
    movingTime,
    currentSpeed,
    avgSpeed,
    currentPace: currentSpeed ? speedToPace(currentSpeed) : null,
    avgPace: avgSpeed > 0 ? speedToPace(avgSpeed) : 0,
    elevation: points[points.length - 1]?.altitude || null,
    elevationGain,
    elevationLoss,
    calories,
    heartRate: avgHeartRate ? Math.round(avgHeartRate) : null,
    cadence: avgCadence ? Math.round(avgCadence) : null,
    lastKmPace,
    lastKmTime,
  };
}

/**
 * Generate a unique ID for tracking sessions
 */
export function generateSessionId(): string {
  return `workout_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Format duration for display (HH:MM:SS)
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number, unit: 'km' | 'mi' = 'km'): string {
  if (unit === 'mi') {
    const miles = meters * 0.000621371;
    return miles.toFixed(2);
  }
  const km = meters / 1000;
  return km.toFixed(2);
}

export { DEFAULT_CONFIG };
