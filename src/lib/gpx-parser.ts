// ═══════════════════════════════════════════════════════════════
// GPX Parser - Parse GPX files and extract workout data
// ═══════════════════════════════════════════════════════════════

export interface GPXPoint {
  lat: number;
  lon: number;
  elevation?: number;
  time?: Date;
  heartRate?: number;
  cadence?: number;
  speed?: number;
  distance?: number; // Cumulative distance in meters
}

export interface GPXTrack {
  name?: string;
  type?: string;
  points: GPXPoint[];
}

export interface GPXMetadata {
  name?: string;
  description?: string;
  author?: string;
  time?: Date;
}

export interface ParsedGPX {
  metadata: GPXMetadata;
  tracks: GPXTrack[];
  routes: GPXTrack[];
  waypoints: GPXPoint[];
  // Computed stats
  totalDistance: number; // meters
  totalDuration: number; // seconds
  totalElevationGain: number; // meters
  totalElevationLoss: number; // meters
  avgSpeed?: number; // m/s
  avgPace?: number; // min/km
  avgHeartRate?: number;
  avgCadence?: number;
  startTime?: Date;
  endTime?: Date;
}

export interface GPXImportResult {
  success: boolean;
  data?: ParsedGPX;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// Main Parser Function
// ═══════════════════════════════════════════════════════════════

export function parseGPX(gpxContent: string): GPXImportResult {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxContent, 'application/xml');

    // Check for parsing errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return {
        success: false,
        error: 'Invalid GPX file format: XML parsing error',
      };
    }

    // Get the root GPX element
    const gpx = doc.querySelector('gpx');
    if (!gpx) {
      return {
        success: false,
        error: 'Invalid GPX file: missing GPX root element',
      };
    }

    // Parse metadata
    const metadata = parseMetadata(doc);

    // Parse tracks
    const tracks = parseTracks(doc);

    // Parse routes
    const routes = parseRoutes(doc);

    // Parse waypoints
    const waypoints = parseWaypoints(doc);

    // Compute statistics
    const stats = computeStatistics(tracks);

    const result: ParsedGPX = {
      metadata,
      tracks,
      routes,
      waypoints,
      ...stats,
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('GPX parsing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function parseMetadata(doc: Document): GPXMetadata {
  const metadataEl = doc.querySelector('metadata');
  
  return {
    name: getTextContent(doc, 'gpx > name') || 
          getTextContent(doc, 'metadata > name'),
    description: getTextContent(doc, 'metadata > desc'),
    author: getTextContent(doc, 'metadata > author > name'),
    time: parseTime(getTextContent(doc, 'metadata > time')),
  };
}

function parseTracks(doc: Document): GPXTrack[] {
  const trackEls = doc.querySelectorAll('trk');
  const tracks: GPXTrack[] = [];

  trackEls.forEach((trk) => {
    const track: GPXTrack = {
      name: getTextContent(trk, 'name'),
      type: getTextContent(trk, 'type'),
      points: [],
    };

    // Get all track segments
    const segments = trk.querySelectorAll('trkseg');
    segments.forEach((seg) => {
      const points = parseTrackPoints(seg);
      track.points.push(...points);
    });

    tracks.push(track);
  });

  return tracks;
}

function parseTrackPoints(segment: Element): GPXPoint[] {
  const pointEls = segment.querySelectorAll('trkpt');
  const points: GPXPoint[] = [];
  let cumulativeDistance = 0;
  let prevPoint: GPXPoint | null = null;

  pointEls.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');

    const point: GPXPoint = {
      lat,
      lon,
      elevation: parseElevation(getTextContent(pt, 'ele')),
      time: parseTime(getTextContent(pt, 'time')),
      heartRate: parseHeartRate(pt),
      cadence: parseCadence(pt),
      speed: parseSpeed(pt),
    };

    // Calculate cumulative distance
    if (prevPoint) {
      const dist = haversineDistance(
        prevPoint.lat, prevPoint.lon,
        point.lat, point.lon
      );
      cumulativeDistance += dist;
    }
    point.distance = cumulativeDistance;

    points.push(point);
    prevPoint = point;
  });

  return points;
}

function parseRoutes(doc: Document): GPXTrack[] {
  const routeEls = doc.querySelectorAll('rte');
  const routes: GPXTrack[] = [];

  routeEls.forEach((rte) => {
    const route: GPXTrack = {
      name: getTextContent(rte, 'name'),
      points: [],
    };

    const pointEls = rte.querySelectorAll('rtept');
    pointEls.forEach((pt) => {
      route.points.push({
        lat: parseFloat(pt.getAttribute('lat') || '0'),
        lon: parseFloat(pt.getAttribute('lon') || '0'),
        elevation: parseElevation(getTextContent(pt, 'ele')),
      });
    });

    routes.push(route);
  });

  return routes;
}

function parseWaypoints(doc: Document): GPXPoint[] {
  const wptEls = doc.querySelectorAll('wpt');
  const waypoints: GPXPoint[] = [];

  wptEls.forEach((wpt) => {
    waypoints.push({
      lat: parseFloat(wpt.getAttribute('lat') || '0'),
      lon: parseFloat(wpt.getAttribute('lon') || '0'),
      elevation: parseElevation(getTextContent(wpt, 'ele')),
      time: parseTime(getTextContent(wpt, 'time')),
    });
  });

  return waypoints;
}

// ═══════════════════════════════════════════════════════════════
// Statistics Computation
// ═══════════════════════════════════════════════════════════════

function computeStatistics(tracks: GPXTrack[]): Partial<ParsedGPX> {
  const allPoints = tracks.flatMap((t) => t.points);

  if (allPoints.length === 0) {
    return {
      totalDistance: 0,
      totalDuration: 0,
      totalElevationGain: 0,
      totalElevationLoss: 0,
    };
  }

  // Distance (from last point's cumulative distance)
  const totalDistance = allPoints[allPoints.length - 1]?.distance || 0;

  // Time
  const times = allPoints
    .map((p) => p.time)
    .filter((t): t is Date => t !== undefined)
    .sort((a, b) => a.getTime() - b.getTime());

  const startTime = times[0];
  const endTime = times[times.length - 1];
  const totalDuration = startTime && endTime
    ? (endTime.getTime() - startTime.getTime()) / 1000
    : 0;

  // Elevation
  let totalElevationGain = 0;
  let totalElevationLoss = 0;
  let prevElevation: number | null = null;

  for (const point of allPoints) {
    if (point.elevation !== undefined) {
      if (prevElevation !== null) {
        const diff = point.elevation - prevElevation;
        if (diff > 0) {
          totalElevationGain += diff;
        } else if (diff < 0) {
          totalElevationLoss += Math.abs(diff);
        }
      }
      prevElevation = point.elevation;
    }
  }

  // Speed & Pace
  let avgSpeed: number | undefined;
  let avgPace: number | undefined;

  if (totalDistance > 0 && totalDuration > 0) {
    avgSpeed = totalDistance / totalDuration; // m/s
    avgPace = (totalDuration / 60) / (totalDistance / 1000); // min/km
  }

  // Heart Rate
  const heartRates = allPoints
    .map((p) => p.heartRate)
    .filter((hr): hr is number => hr !== undefined && hr > 0);

  const avgHeartRate = heartRates.length > 0
    ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
    : undefined;

  // Cadence
  const cadences = allPoints
    .map((p) => p.cadence)
    .filter((c): c is number => c !== undefined && c > 0);

  const avgCadence = cadences.length > 0
    ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length)
    : undefined;

  return {
    totalDistance,
    totalDuration,
    totalElevationGain,
    totalElevationLoss,
    avgSpeed,
    avgPace,
    avgHeartRate,
    avgCadence,
    startTime,
    endTime,
  };
}

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

function getTextContent(parent: Element | Document, selector: string): string | undefined {
  const el = parent.querySelector(selector);
  return el?.textContent?.trim() || undefined;
}

function parseTime(timeStr?: string): Date | undefined {
  if (!timeStr) return undefined;
  const date = new Date(timeStr);
  return isNaN(date.getTime()) ? undefined : date;
}

function parseElevation(eleStr?: string): number | undefined {
  if (!eleStr) return undefined;
  const ele = parseFloat(eleStr);
  return isNaN(ele) ? undefined : ele;
}

function parseHeartRate(pt: Element): number | undefined {
  // Try standard GPX extensions
  const hr = pt.querySelector('hr')?.textContent ||
             pt.querySelector('gpxtpx\\:hr')?.textContent ||
             pt.querySelector('ns3\\:hr')?.textContent;
  if (hr) {
    const value = parseInt(hr);
    return isNaN(value) ? undefined : value;
  }
  return undefined;
}

function parseCadence(pt: Element): number | undefined {
  const cad = pt.querySelector('cad')?.textContent ||
              pt.querySelector('gpxtpx\\:cad')?.textContent ||
              pt.querySelector('ns3\\:cad')?.textContent;
  if (cad) {
    const value = parseInt(cad);
    return isNaN(value) ? undefined : value;
  }
  return undefined;
}

function parseSpeed(pt: Element): number | undefined {
  const speed = pt.querySelector('speed')?.textContent ||
                pt.querySelector('gpxtpx\\:speed')?.textContent;
  if (speed) {
    const value = parseFloat(speed);
    return isNaN(value) ? undefined : value;
  }
  return undefined;
}

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in meters
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// ═══════════════════════════════════════════════════════════════
// Convert Parsed GPX to Workout Format
// ═══════════════════════════════════════════════════════════════

export interface WorkoutImportData {
  name?: string;
  activityType: string;
  workoutType: string;
  startedAt: Date;
  completedAt?: Date;
  durationMinutes?: number;
  distanceMeters?: number;
  routeData?: Array<{ lat: number; lon: number; elevation?: number; time?: string }>;
  elevationGain?: number;
  elevationLoss?: number;
  avgPace?: number;
  avgSpeed?: number;
  avgHeartRate?: number;
  avgCadence?: number;
  caloriesBurned?: number;
  source: string;
}

export function gpxToWorkout(gpx: ParsedGPX): WorkoutImportData {
  // Determine activity type from GPX type or default to 'other'
  const activityType = detectActivityType(gpx);
  const workoutType = getWorkoutTypeFromActivity(activityType);

  // Convert route points to simple format
  const routeData = gpx.tracks.flatMap((track) =>
    track.points.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      elevation: p.elevation,
      time: p.time?.toISOString(),
    }))
  );

  // Estimate calories (rough estimation based on distance and time)
  let caloriesBurned: number | undefined;
  if (gpx.totalDistance > 0 && gpx.totalDuration > 0) {
    // Rough estimation: ~60 calories per km for running, varies by activity
    const caloriesPerKm = activityType === 'run' ? 60 :
                          activityType === 'cycle' ? 35 :
                          activityType === 'swim' ? 50 :
                          activityType === 'walk' ? 45 : 40;
    caloriesBurned = Math.round((gpx.totalDistance / 1000) * caloriesPerKm);
  }

  return {
    name: gpx.metadata.name || `${getActivityName(activityType)} - ${formatDate(gpx.startTime)}`,
    activityType,
    workoutType,
    startedAt: gpx.startTime || new Date(),
    completedAt: gpx.endTime,
    durationMinutes: gpx.totalDuration ? Math.round(gpx.totalDuration / 60) : undefined,
    distanceMeters: gpx.totalDistance,
    routeData: routeData.length > 0 ? routeData : undefined,
    elevationGain: gpx.totalElevationGain || undefined,
    elevationLoss: gpx.totalElevationLoss || undefined,
    avgPace: gpx.avgPace,
    avgSpeed: gpx.avgSpeed,
    avgHeartRate: gpx.avgHeartRate,
    avgCadence: gpx.avgCadence,
    caloriesBurned,
    source: 'gpx_import',
  };
}

function detectActivityType(gpx: ParsedGPX): string {
  // Check track type
  for (const track of gpx.tracks) {
    if (track.type) {
      const type = track.type.toLowerCase();
      if (type.includes('run') || type.includes('running')) return 'run';
      if (type.includes('cycle') || type.includes('cycling') || type.includes('bike')) return 'cycle';
      if (type.includes('swim') || type.includes('swimming')) return 'swim';
      if (type.includes('walk') || type.includes('walking')) return 'walk';
      if (type.includes('hike') || type.includes('hiking')) return 'hike';
      if (type.includes('row') || type.includes('rowing')) return 'row';
    }
  }

  // Infer from speed if available
  if (gpx.avgSpeed) {
    const speedKmh = gpx.avgSpeed * 3.6; // Convert m/s to km/h
    if (speedKmh > 25) return 'cycle';
    if (speedKmh > 8) return 'run';
    if (speedKmh > 4) return 'walk';
  }

  // Infer from pace
  if (gpx.avgPace) {
    if (gpx.avgPace < 5) return 'run';
    if (gpx.avgPace < 10) return 'walk';
  }

  return 'other';
}

function getWorkoutTypeFromActivity(activityType: string): string {
  const cardioTypes = ['run', 'cycle', 'swim', 'walk', 'hike', 'row'];
  if (cardioTypes.includes(activityType)) return 'cardio';
  return 'mixed';
}

function getActivityName(activityType: string): string {
  const names: Record<string, string> = {
    run: 'Running',
    cycle: 'Cycling',
    swim: 'Swimming',
    walk: 'Walking',
    hike: 'Hiking',
    row: 'Rowing',
    other: 'Workout',
  };
  return names[activityType] || 'Workout';
}

function formatDate(date?: Date): string {
  if (!date) return 'Unknown Date';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Assign to variable before exporting to satisfy ESLint rule
const gpxParser = {
  parseGPX,
  gpxToWorkout,
};

export default gpxParser;
