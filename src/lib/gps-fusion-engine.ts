/**
 * GPS Fusion Engine - Production-Grade Location System
 * 
 * Implements the real architecture used by Uber, Google Maps, etc:
 * [Sensors] → [Fusion Engine] → [State Estimator] → [Prediction] → [Interpolation]
 * 
 * Features:
 * - Extended Kalman Filter (EKF) for GPS + IMU fusion
 * - Outlier rejection for GPS spikes
 * - Position prediction (handles GPS latency)
 * - 60fps interpolation for smooth rendering
 * - Trajectory smoothing
 * 
 * @module lib/gps-fusion-engine
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GPSReading {
  lat: number;
  lon: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  timestamp: number;
}

export interface IMUReading {
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
  rotationAlpha: number; // z-axis (compass)
  rotationBeta: number;  // x-axis
  rotationGamma: number; // y-axis
  timestamp: number;
}

export interface FusedState {
  // Position (meters from start, converted to lat/lon for output)
  x: number;
  y: number;
  lat: number;
  lon: number;
  
  // Velocity (m/s)
  vx: number;
  vy: number;
  speed: number;
  
  // Acceleration (m/s²)
  ax: number;
  ay: number;
  
  // Heading (degrees, 0 = North)
  heading: number;
  
  // Altitude
  altitude: number;
  
  // Confidence (0-1)
  confidence: number;
  
  // Timestamp
  timestamp: number;
  
  // Is this a predicted state?
  isPredicted: boolean;
}

export interface TrajectoryPoint {
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  altitude: number;
  timestamp: number;
  distance: number;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

// Earth radius in meters
const EARTH_RADIUS = 6371000;

// Conversion factors
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Filter parameters
const GPS_NOISE_METERS = 5; // Typical GPS noise
const IMU_NOISE = 0.1;      // IMU noise factor
const PROCESS_NOISE = 0.5;  // System uncertainty

// Outlier rejection thresholds
const MAX_SPEED_MS = 50;           // 180 km/h max realistic speed
const MAX_ACCELERATION_MS2 = 15;   // Max realistic acceleration
const MAX_POSITION_JUMP_M = 30;    // Max allowed jump in meters
const MIN_GPS_ACCURACY = 100;      // Reject if accuracy > 100m

// Prediction settings
const PREDICTION_HORIZON_MS = 500;  // Predict 500ms ahead
const INTERPOLATION_FPS = 60;

// ═══════════════════════════════════════════════════════════════
// MATH UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Convert lat/lon to local meters (x, y) from reference point
 */
function latLonToMeters(
  lat: number, 
  lon: number, 
  refLat: number, 
  refLon: number
): { x: number; y: number } {
  const dLat = (lat - refLat) * DEG_TO_RAD;
  const dLon = (lon - refLon) * DEG_TO_RAD;
  
  const x = dLon * EARTH_RADIUS * Math.cos(refLat * DEG_TO_RAD);
  const y = dLat * EARTH_RADIUS;
  
  return { x, y };
}

/**
 * Convert local meters back to lat/lon
 */
function metersToLatLon(
  x: number, 
  y: number, 
  refLat: number, 
  refLon: number
): { lat: number; lon: number } {
  const lat = refLat + (y / EARTH_RADIUS) * RAD_TO_DEG;
  const lon = refLon + (x / (EARTH_RADIUS * Math.cos(refLat * DEG_TO_RAD))) * RAD_TO_DEG;
  
  return { lat, lon };
}

/**
 * Haversine distance between two points
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
            Math.sin(dLon / 2) ** 2;
  
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate bearing between two points
 */
function calculateBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * RAD_TO_DEG;
  return (bearing + 360) % 360;
}

/**
 * Smooth angle transition (handles 359° → 1° correctly)
 */
function smoothAngle(current: number, target: number, factor: number): number {
  let diff = target - current;
  
  // Handle wraparound
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  return (current + diff * factor + 360) % 360;
}

// ═══════════════════════════════════════════════════════════════
// KALMAN FILTER (Simplified 2D for performance)
// ═══════════════════════════════════════════════════════════════

class KalmanFilter2D {
  // State: [x, y, vx, vy]
  private x: number[] = [0, 0, 0, 0];
  
  // Covariance matrix (4x4)
  private P: number[][] = [
    [100, 0, 0, 0],
    [0, 100, 0, 0],
    [0, 0, 10, 0],
    [0, 0, 0, 10],
  ];
  
  // Process noise
  private Q: number[][] = [
    [0.1, 0, 0, 0],
    [0, 0.1, 0, 0],
    [0, 0, 0.5, 0],
    [0, 0, 0, 0.5],
  ];
  
  // Measurement noise (GPS)
  private R: number[][] = [
    [GPS_NOISE_METERS ** 2, 0],
    [0, GPS_NOISE_METERS ** 2],
  ];
  
  private lastUpdateTime: number = 0;
  
  /**
   * Predict step - advance state using motion model
   */
  predict(dt: number, ax: number = 0, ay: number = 0): void {
    if (dt <= 0) return;
    
    // State transition: x = x + v*dt + 0.5*a*dt²
    const x = this.x;
    x[0] = x[0] + x[2] * dt + 0.5 * ax * dt * dt;  // x position
    x[1] = x[1] + x[3] * dt + 0.5 * ay * dt * dt;  // y position
    x[2] = x[2] + ax * dt;                          // x velocity
    x[3] = x[3] + ay * dt;                          // y velocity
    
    // Update covariance: P = F*P*F' + Q (full 4x4)
    // F = [1, 0, dt, 0;  0, 1, 0, dt;  0, 0, 1, 0;  0, 0, 0, 1]
    // We need cross-covariance propagation so that velocity is corrected by GPS observations.
    // Before this update, P[0][2], P[2][0], P[1][3], P[3][1] were zero or stale.
    this.P[0][0] += 2 * this.P[0][2] * dt + this.P[2][2] * dt * dt + this.Q[0][0] * dt;
    this.P[1][1] += 2 * this.P[1][3] * dt + this.P[3][3] * dt * dt + this.Q[1][1] * dt;
    // Cross-covariance: after F*P*F', P_pos_vel = P_pos_vel + P_vel_vel * dt
    this.P[0][2] += this.P[2][2] * dt;
    this.P[2][0] = this.P[0][2];
    this.P[1][3] += this.P[3][3] * dt;
    this.P[3][1] = this.P[1][3];
    this.P[2][2] += this.Q[2][2] * dt;
    this.P[3][3] += this.Q[3][3] * dt;
  }
  
  /**
   * Update step - correct state with GPS measurement
   */
  update(measuredX: number, measuredY: number, accuracy: number): void {
    // Adjust measurement noise based on GPS accuracy
    const r = Math.max(accuracy, GPS_NOISE_METERS) ** 2;
    this.R[0][0] = r;
    this.R[1][1] = r;
    
    // Innovation (measurement residual)
    const y0 = measuredX - this.x[0];
    const y1 = measuredY - this.x[1];
    
    // Innovation covariance: S = H*P*H' + R
    const S00 = this.P[0][0] + this.R[0][0];
    const S11 = this.P[1][1] + this.R[1][1];
    
    // Kalman gain: K = P*H' * S^-1
    const K00 = this.P[0][0] / S00;
    const K10 = this.P[1][0] / S00;
    const K20 = this.P[2][0] / S00;
    const K30 = this.P[3][0] / S00;
    const K01 = this.P[0][1] / S11;
    const K11 = this.P[1][1] / S11;
    const K21 = this.P[2][1] / S11;
    const K31 = this.P[3][1] / S11;
    
    // Update state: x = x + K*y
    this.x[0] += K00 * y0 + K01 * y1;
    this.x[1] += K10 * y0 + K11 * y1;
    this.x[2] += K20 * y0 + K21 * y1;
    this.x[3] += K30 * y0 + K31 * y1;
    
    // Update covariance: P = (I - K*H)*P
    const I_KH00 = 1 - K00;
    const I_KH11 = 1 - K11;
    
    this.P[0][0] = this.P[0][0] * I_KH00;
    this.P[0][1] = this.P[0][1] * I_KH00;
    this.P[1][0] = this.P[1][0] - K10 * K00 * this.P[0][0];
    this.P[1][1] = this.P[1][1] * I_KH11;
    // Cross-covariance: velocity-position must also be updated
    this.P[2][0] = this.P[2][0] - K20 * K00 * this.P[0][0];
    this.P[0][2] = this.P[2][0];
    this.P[2][1] = this.P[2][1] - K21 * K11 * this.P[1][1];
    this.P[1][2] = this.P[2][1];
    this.P[3][0] = this.P[3][0] - K30 * K00 * this.P[0][0];
    this.P[0][3] = this.P[3][0];
    this.P[3][1] = this.P[3][1] - K31 * K11 * this.P[1][1];
    this.P[1][3] = this.P[3][1];
    this.P[2][2] = this.P[2][2] - K20 * K00 * this.P[0][2] - K21 * K11 * this.P[1][2];
    this.P[3][3] = this.P[3][3] - K30 * K00 * this.P[0][3] - K31 * K11 * this.P[1][3];
  }
  
  /**
   * Get current state estimate
   */
  getState(): { x: number; y: number; vx: number; vy: number } {
    return {
      x: this.x[0],
      y: this.x[1],
      vx: this.x[2],
      vy: this.x[3],
    };
  }
  
  /**
   * Set state directly (for initialization)
   */
  setState(x: number, y: number, vx: number = 0, vy: number = 0): void {
    this.x = [x, y, vx, vy];
    // Reset covariance
    this.P = [
      [10, 0, 0, 0],
      [0, 10, 0, 0],
      [0, 0, 5, 0],
      [0, 0, 0, 5],
    ];
  }
  
  /**
   * Get position uncertainty
   */
  getUncertainty(): number {
    return Math.sqrt(this.P[0][0] + this.P[1][1]);
  }
}

// ═══════════════════════════════════════════════════════════════
// GPS FUSION ENGINE
// ═══════════════════════════════════════════════════════════════

export class GPSFusionEngine {
  private kalman: KalmanFilter2D;
  
  // Reference point (first GPS reading)
  private refLat: number = 0;
  private refLon: number = 0;
  private hasReference: boolean = false;
  
  // Current fused state
  private currentState: FusedState | null = null;
  
  // History for smoothing
  private stateHistory: FusedState[] = [];
  private maxHistoryLength: number = 100;
  
  // Last readings
  private lastGPS: GPSReading | null = null;
  private lastIMU: IMUReading | null = null;
  
  // Heading filter (separate for smoothness)
  private filteredHeading: number = 0;
  private headingInitialized: boolean = false;
  
  // Altitude filter
  private filteredAltitude: number = 0;
  
  // Statistics
  private outlierCount: number = 0;
  private totalGPSReadings: number = 0;
  
  // Interpolation
  private interpolationState: FusedState | null = null;
  private animationFrameId: number | null = null;
  private onStateUpdate: ((state: FusedState) => void) | null = null;
  
  // Total distance
  private totalDistance: number = 0;
  
  constructor() {
    this.kalman = new KalmanFilter2D();
  }
  
  // ═══════════════════════════════════════════════════════════════
  // OUTLIER REJECTION
  // ═══════════════════════════════════════════════════════════════
  
  private isOutlier(gps: GPSReading): boolean {
    this.totalGPSReadings++;
    
    // Reject very low accuracy
    if (gps.accuracy > MIN_GPS_ACCURACY) {
      this.outlierCount++;
      return true;
    }
    
    if (!this.lastGPS) {
      return false;
    }
    
    const dt = (gps.timestamp - this.lastGPS.timestamp) / 1000;
    if (dt <= 0) return true;
    
    // Calculate distance
    const distance = haversineDistance(
      this.lastGPS.lat, this.lastGPS.lon,
      gps.lat, gps.lon
    );
    
    // Check for impossible jump
    if (distance > MAX_POSITION_JUMP_M && dt < 2) {
      this.outlierCount++;
      return true;
    }
    
    // Check for impossible speed
    const impliedSpeed = distance / dt;
    if (impliedSpeed > MAX_SPEED_MS) {
      this.outlierCount++;
      return true;
    }
    
    // Check for impossible acceleration
    if (this.lastGPS.speed !== null && gps.speed !== null) {
      const speedChange = Math.abs(gps.speed - this.lastGPS.speed);
      const impliedAcceleration = speedChange / dt;
      if (impliedAcceleration > MAX_ACCELERATION_MS2) {
        this.outlierCount++;
        return true;
      }
    }
    
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // GPS PROCESSING
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Process a new GPS reading
   */
  processGPS(gps: GPSReading): FusedState | null {
    // Reject outliers
    if (this.isOutlier(gps)) {
      // Still run prediction to keep state updated
      if (this.currentState) {
        const dt = (gps.timestamp - this.currentState.timestamp) / 1000;
        this.predict(dt, gps.timestamp);
      }
      return this.currentState;
    }
    
    // Initialize reference point
    if (!this.hasReference) {
      this.refLat = gps.lat;
      this.refLon = gps.lon;
      this.hasReference = true;
      this.filteredAltitude = gps.altitude || 0;
      
      // Initialize Kalman at origin
      this.kalman.setState(0, 0);
    }
    
    // Convert to local coordinates
    const { x, y } = latLonToMeters(gps.lat, gps.lon, this.refLat, this.refLon);
    
    // Time since last update
    const dt = this.lastGPS 
      ? (gps.timestamp - this.lastGPS.timestamp) / 1000 
      : 0;
    
    // Predict forward
    if (dt > 0 && this.lastIMU) {
      this.kalman.predict(dt, this.lastIMU.accelerationX, this.lastIMU.accelerationY);
    } else if (dt > 0) {
      this.kalman.predict(dt);
    }
    
    // Update with GPS measurement
    this.kalman.update(x, y, gps.accuracy);
    
    // Get filtered state
    const state = this.kalman.getState();
    
    // Convert back to lat/lon
    const { lat, lon } = metersToLatLon(state.x, state.y, this.refLat, this.refLon);
    
    // Calculate speed
    const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2);
    
    // Update heading (smoothed)
    let heading = this.filteredHeading;
    if (speed > 0.5) { // Only update heading if moving
      if (gps.heading !== null && gps.heading >= 0) {
        heading = gps.heading;
      } else {
        // Calculate from velocity
        heading = Math.atan2(state.vx, state.vy) * RAD_TO_DEG;
        heading = (heading + 360) % 360;
      }
      
      if (this.headingInitialized) {
        this.filteredHeading = smoothAngle(this.filteredHeading, heading, 0.3);
      } else {
        this.filteredHeading = heading;
        this.headingInitialized = true;
      }
    }
    
    // Update altitude (smoothed)
    if (gps.altitude !== null) {
      this.filteredAltitude = this.filteredAltitude * 0.8 + gps.altitude * 0.2;
    }
    
    // Calculate distance increment
    if (this.currentState) {
      const distIncrement = haversineDistance(
        this.currentState.lat, this.currentState.lon,
        lat, lon
      );
      if (distIncrement > 0.5 && distIncrement < 50) { // Filter small noise and jumps
        this.totalDistance += distIncrement;
      }
    }
    
    // Build fused state
    const fusedState: FusedState = {
      x: state.x,
      y: state.y,
      lat,
      lon,
      vx: state.vx,
      vy: state.vy,
      speed,
      ax: 0,
      ay: 0,
      heading: this.filteredHeading,
      altitude: this.filteredAltitude,
      confidence: Math.max(0, 1 - this.kalman.getUncertainty() / 50),
      timestamp: gps.timestamp,
      isPredicted: false,
    };
    
    // Store in history
    this.stateHistory.push(fusedState);
    if (this.stateHistory.length > this.maxHistoryLength) {
      this.stateHistory.shift();
    }
    
    this.currentState = fusedState;
    this.lastGPS = gps;
    
    return fusedState;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // IMU PROCESSING
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Process IMU reading (accelerometer + gyroscope)
   */
  processIMU(imu: IMUReading): void {
    this.lastIMU = imu;
    
    // Use rotation for heading when stationary
    if (this.currentState && this.currentState.speed < 0.5) {
      // Compass heading from device
      if (imu.rotationAlpha !== null) {
        const compassHeading = (360 - imu.rotationAlpha) % 360;
        this.filteredHeading = smoothAngle(this.filteredHeading, compassHeading, 0.1);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PREDICTION ENGINE
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Predict state forward in time (handles GPS latency)
   */
  predict(dt: number, timestamp: number): FusedState | null {
    if (!this.currentState) return null;
    
    const state = this.currentState;
    
    // Use current velocity and acceleration
    const ax = this.lastIMU?.accelerationX || 0;
    const ay = this.lastIMU?.accelerationY || 0;
    
    // Predict position: x = x0 + v*t + 0.5*a*t²
    const newX = state.x + state.vx * dt + 0.5 * ax * dt * dt;
    const newY = state.y + state.vy * dt + 0.5 * ay * dt * dt;
    
    // Predict velocity: v = v0 + a*t
    const newVx = state.vx + ax * dt;
    const newVy = state.vy + ay * dt;
    
    // Convert to lat/lon
    const { lat, lon } = metersToLatLon(newX, newY, this.refLat, this.refLon);
    
    const predictedState: FusedState = {
      x: newX,
      y: newY,
      lat,
      lon,
      vx: newVx,
      vy: newVy,
      speed: Math.sqrt(newVx ** 2 + newVy ** 2),
      ax,
      ay,
      heading: state.heading, // Heading doesn't change much
      altitude: state.altitude,
      confidence: state.confidence * 0.95, // Decrease confidence over time
      timestamp,
      isPredicted: true,
    };
    
    return predictedState;
  }
  
  /**
   * Get predicted state for current time
   */
  getPredictedState(): FusedState | null {
    if (!this.currentState) return null;
    
    const now = Date.now();
    const dt = (now - this.currentState.timestamp) / 1000;
    
    // Only predict up to 1 second ahead
    if (dt > 1) {
      return this.currentState;
    }
    
    return this.predict(dt, now);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INTERPOLATION ENGINE (60fps smooth rendering)
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Get smoothly interpolated state (PULL-BASED - no callbacks)
   * Call this at 60fps from your render loop
   * 
   * This implements Uber-like smooth tracking:
   * - Uses exponential smoothing with adaptive factor
   * - Higher factor when moving fast (snappier)
   * - Lower factor when stationary (more stable)
   */
  getInterpolatedState(): FusedState | null {
    const predicted = this.getPredictedState();
    if (!predicted) return null;
    
    // Adaptive smoothing factor based on speed
    // When moving fast: be more responsive (0.2)
    // When stationary: be more stable (0.08)
    const baseFactor = 0.15;
    const speedFactor = Math.min(predicted.speed / 10, 0.15); // Max 0.15 additional
    const factor = baseFactor + speedFactor; // Range: 0.15 - 0.3
    
    // Smooth interpolation from current interpolation state
    if (this.interpolationState) {
      this.interpolationState = {
        ...predicted,
        lat: this.interpolationState.lat + (predicted.lat - this.interpolationState.lat) * factor,
        lon: this.interpolationState.lon + (predicted.lon - this.interpolationState.lon) * factor,
        speed: this.interpolationState.speed + (predicted.speed - this.interpolationState.speed) * factor,
        heading: smoothAngle(this.interpolationState.heading, predicted.heading, factor * 1.5), // Faster heading response
        altitude: this.interpolationState.altitude + (predicted.altitude - this.interpolationState.altitude) * factor,
        confidence: predicted.confidence,
      };
    } else {
      this.interpolationState = { ...predicted };
    }
    
    return this.interpolationState;
  }
  
  /**
   * Get raw current state (not interpolated)
   */
  getCurrentState(): FusedState | null {
    return this.currentState;
  }
  
  /**
   * Start interpolation loop for smooth rendering (PUSH-BASED - with callback)
   * @deprecated Use getInterpolatedState() in your own render loop instead
   */
  startInterpolation(onUpdate: (state: FusedState) => void): void {
    this.onStateUpdate = onUpdate;
    this.interpolationLoop();
  }
  
  /**
   * Stop interpolation loop
   */
  stopInterpolation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.onStateUpdate = null;
  }
  
  private interpolationLoop = (): void => {
    if (!this.onStateUpdate) return;
    
    const interpolated = this.getInterpolatedState();
    
    if (interpolated) {
      this.onStateUpdate(interpolated);
    }
    
    this.animationFrameId = requestAnimationFrame(this.interpolationLoop);
  };
  
  // ═══════════════════════════════════════════════════════════════
  // TRAJECTORY
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Get smoothed trajectory points
   */
  getTrajectory(): TrajectoryPoint[] {
    if (this.stateHistory.length < 2) {
      return this.stateHistory.map(s => ({
        lat: s.lat,
        lon: s.lon,
        speed: s.speed,
        heading: s.heading,
        altitude: s.altitude,
        timestamp: s.timestamp,
        distance: 0,
      }));
    }
    
    // Apply RTS smoothing (simplified: running average)
    const smoothed: TrajectoryPoint[] = [];
    let cumulativeDistance = 0;
    
    for (let i = 0; i < this.stateHistory.length; i++) {
      const current = this.stateHistory[i];
      
      // Calculate smoothed position (weighted average of neighbors)
      let smoothLat = current.lat;
      let smoothLon = current.lon;
      let weight = 1;
      
      // Look at neighbors
      for (let j = Math.max(0, i - 2); j <= Math.min(this.stateHistory.length - 1, i + 2); j++) {
        if (j !== i) {
          const neighbor = this.stateHistory[j];
          const w = 0.2;
          smoothLat += neighbor.lat * w;
          smoothLon += neighbor.lon * w;
          weight += w;
        }
      }
      
      smoothLat /= weight;
      smoothLon /= weight;
      
      // Calculate distance from previous point
      if (i > 0) {
        const prev = smoothed[i - 1];
        cumulativeDistance += haversineDistance(prev.lat, prev.lon, smoothLat, smoothLon);
      }
      
      smoothed.push({
        lat: smoothLat,
        lon: smoothLon,
        speed: current.speed,
        heading: current.heading,
        altitude: current.altitude,
        timestamp: current.timestamp,
        distance: cumulativeDistance,
      });
    }
    
    return smoothed;
  }
  
  /**
   * Get total distance traveled
   */
  getTotalDistance(): number {
    return this.totalDistance;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STATE ACCESS
  // ═══════════════════════════════════════════════════════════════
  
  getStatistics(): { outlierRate: number; totalReadings: number } {
    return {
      outlierRate: this.totalGPSReadings > 0 
        ? this.outlierCount / this.totalGPSReadings 
        : 0,
      totalReadings: this.totalGPSReadings,
    };
  }
  
  /**
   * Reset engine state
   */
  reset(): void {
    this.kalman = new KalmanFilter2D();
    this.hasReference = false;
    this.currentState = null;
    this.stateHistory = [];
    this.lastGPS = null;
    this.lastIMU = null;
    this.filteredHeading = 0;
    this.headingInitialized = false;
    this.filteredAltitude = 0;
    this.outlierCount = 0;
    this.totalGPSReadings = 0;
    this.interpolationState = null;
    this.totalDistance = 0;
    this.stopInterpolation();
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════

let fusionEngineInstance: GPSFusionEngine | null = null;

export function getGPSFusionEngine(): GPSFusionEngine {
  if (!fusionEngineInstance) {
    fusionEngineInstance = new GPSFusionEngine();
  }
  return fusionEngineInstance;
}

export function resetGPSFusionEngine(): void {
  if (fusionEngineInstance) {
    fusionEngineInstance.reset();
  }
  fusionEngineInstance = null;
}
