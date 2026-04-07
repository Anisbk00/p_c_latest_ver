/**
 * Location Pipeline - Production-Grade GPS Processing
 * 
 * Architecture: RAW GPS → OUTLIER FILTER → KALMAN FILTER → PREDICTION → OUTPUT
 * 
 * Features:
 * - Adaptive Kalman Filter with accuracy-based measurement noise
 * - Outlier rejection for GPS spikes and impossible movements
 * - Position prediction (handles GPS latency up to 500ms)
 * - Confidence scoring based on GPS quality and prediction time
 * - Velocity decay for realistic stopping behavior
 * 
 * This module is PURE - no UI, no side effects, no external dependencies.
 * 
 * @module core/location/locationPipeline
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RawLocation {
  lat: number;
  lng: number;
  accuracy?: number;       // GPS accuracy in meters (lower is better)
  speed?: number;          // Speed in m/s (from GPS)
  heading?: number;        // Heading in degrees (0-360, from GPS)
  altitude?: number;       // Altitude in meters
  timestamp: number;       // Unix timestamp in milliseconds
}

export interface SmoothedLocation {
  lat: number;
  lng: number;
  velocityLat: number;     // Degrees per second
  velocityLng: number;     // Degrees per second
  speed: number;           // Calculated speed in m/s
  heading: number;         // Smoothed heading in degrees
  altitude: number;
  confidence: number;      // 0-1, based on accuracy and prediction time
  timestamp: number;
  isPredicted: boolean;    // True if this is a predicted position
  accuracy: number;        // Estimated accuracy in meters
}

export interface PipelineConfig {
  // Kalman filter parameters
  processNoise: number;          // How much we trust motion model (default: 0.5)
  minMeasurementNoise: number;   // Minimum GPS noise in meters (default: 5)
  
  // Outlier rejection thresholds
  maxSpeedMs: number;            // Maximum realistic speed m/s (default: 50 = 180km/h)
  maxAccelerationMs2: number;    // Maximum acceleration m/s² (default: 15)
  maxPositionJumpM: number;      // Maximum sudden position change in meters (default: 50)
  maxJumpTimeMs: number;         // Time window for jump detection (default: 2000)
  minGpsAccuracy: number;        // Reject GPS if accuracy > this (default: 100m)
  
  // Prediction settings
  predictionHorizonMs: number;   // How far ahead to predict (default: 500)
  maxPredictionTimeMs: number;   // Stop predicting after this time (default: 2000)
  
  // Velocity decay (for realistic stopping)
  velocityDecayRate: number;     // Decay rate per second when stationary (default: 0.9)
  stationarySpeedThreshold: number; // Speed below which we decay velocity (default: 0.5)
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  processNoise: 0.5,
  minMeasurementNoise: 5,
  maxSpeedMs: 50,
  maxAccelerationMs2: 15,
  maxPositionJumpM: 50,
  maxJumpTimeMs: 2000,
  minGpsAccuracy: 100,
  predictionHorizonMs: 500,
  maxPredictionTimeMs: 2000,
  velocityDecayRate: 0.9,
  stationarySpeedThreshold: 0.5,
};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS = 6371000; // meters
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ═══════════════════════════════════════════════════════════════
// KALMAN FILTER - Adaptive 2D Position + Velocity
// ═══════════════════════════════════════════════════════════════

class AdaptiveKalmanFilter {
  // State vector: [lat, lng, vLat, vLng]
  private state: Float64Array = new Float64Array(4);
  
  // State covariance (4x4, stored as flat array for performance)
  private P: Float64Array = new Float64Array(16);
  
  // Process noise covariance
  private Q: Float64Array;
  
  // Measurement noise (adaptive based on GPS accuracy)
  private R: Float64Array = new Float64Array(4);
  
  // Last update time
  private lastTime: number = 0;
  
  // Is filter initialized?
  private initialized: boolean = false;
  
  // Configuration reference
  private config: PipelineConfig;
  
  constructor(config: PipelineConfig) {
    this.config = config;
    
    // Initialize state covariance with high uncertainty
    this.P.fill(0);
    this.P[0] = 100;  // lat variance
    this.P[5] = 100;  // lng variance
    this.P[10] = 10;  // vLat variance
    this.P[15] = 10;  // vLng variance
    
    // Process noise (motion model uncertainty)
    this.Q = new Float64Array(16);
    this.Q.fill(0);
    this.Q[0] = config.processNoise * 0.1;
    this.Q[5] = config.processNoise * 0.1;
    this.Q[10] = config.processNoise * 0.5;
    this.Q[15] = config.processNoise * 0.5;
    
    // Measurement noise (will be updated based on GPS accuracy)
    this.R.fill(0);
    this.R[0] = config.minMeasurementNoise ** 2;
    this.R[3] = config.minMeasurementNoise ** 2;
  }
  
  /**
   * Initialize filter with first GPS reading
   */
  initialize(lat: number, lng: number, timestamp: number): void {
    this.state[0] = lat;
    this.state[1] = lng;
    this.state[2] = 0; // No initial velocity
    this.state[3] = 0;
    this.lastTime = timestamp;
    this.initialized = true;
    
    // Reset covariance to moderate uncertainty
    this.P[0] = 10;
    this.P[5] = 10;
    this.P[10] = 5;
    this.P[15] = 5;
  }
  
  /**
   * Predict step - advance state using constant velocity model
   */
  predict(dt: number): void {
    if (dt <= 0 || !this.initialized) return;
    
    const dt2 = dt * dt;
    const dt3 = dt2 * dt / 2;
    
    // State transition: x = F * x (constant velocity model)
    // lat' = lat + vLat * dt
    // lng' = lng + vLng * dt
    this.state[0] += this.state[2] * dt;
    this.state[1] += this.state[3] * dt;
    // Velocity unchanged in prediction (constant velocity assumption)
    
    // Update covariance: P = F * P * F' + Q
    // Simplified: increase uncertainty over time
    this.P[0] += this.P[2] * dt + this.P[8] * dt + this.Q[0] * dt;
    this.P[5] += this.P[6] * dt + this.P[9] * dt + this.Q[5] * dt;
    this.P[10] += this.Q[10] * dt;
    this.P[15] += this.Q[15] * dt;
    
    // Cross-covariance terms
    this.P[1] += dt * (this.P[3] + this.P[9]);
    this.P[4] += dt * (this.P[6] + this.P[12]);
    this.P[2] += dt * this.P[10];
    this.P[7] += dt * this.P[11];
    this.P[8] += dt * this.P[10];
    this.P[13] += dt * this.P[15];
    this.P[3] *= 0.99;  // Slow decay
    this.P[6] *= 0.99;
    this.P[9] *= 0.99;
    this.P[12] *= 0.99;
    this.P[11] += this.Q[10] * dt * 0.1;
    this.P[14] += this.Q[15] * dt * 0.1;
  }
  
  /**
   * Update step - correct state with GPS measurement
   */
  update(lat: number, lng: number, accuracy: number): void {
    if (!this.initialized) {
      this.initialize(lat, lng, Date.now());
      return;
    }
    
    // Adaptive measurement noise based on GPS accuracy
    const r = Math.max(accuracy, this.config.minMeasurementNoise) ** 2;
    
    // Convert meters to degrees for latitude
    const metersToDegLat = 1 / (EARTH_RADIUS * DEG_TO_RAD);
    // Convert meters to degrees for longitude (adjusted for latitude)
    const metersToDegLng = 1 / (EARTH_RADIUS * DEG_TO_RAD * Math.cos(this.state[0] * DEG_TO_RAD));
    
    this.R[0] = r * metersToDegLat * metersToDegLat;
    this.R[3] = r * metersToDegLng * metersToDegLng;
    
    // Innovation (measurement residual)
    const y0 = lat - this.state[0];
    const y1 = lng - this.state[1];
    
    // Innovation covariance: S = H * P * H' + R
    // H = [[1, 0, 0, 0], [0, 1, 0, 0]] (we observe position, not velocity)
    const S00 = this.P[0] + this.R[0];
    const S11 = this.P[5] + this.R[3];
    
    // Kalman gain: K = P * H' * S^-1
    const K0 = this.P[0] / S00;
    const K1 = this.P[5] / S11;
    const K2 = this.P[2] / S00;
    const K3 = this.P[7] / S11;
    
    // Update state: x = x + K * y
    this.state[0] += K0 * y0;
    this.state[1] += K1 * y1;
    this.state[2] += K2 * y0;  // Also update velocity
    this.state[3] += K3 * y1;
    
    // Update covariance: P = (I - K * H) * P
    this.P[0] *= (1 - K0);
    this.P[5] *= (1 - K1);
    this.P[10] *= 0.95;  // Slight velocity uncertainty reduction
    this.P[15] *= 0.95;
    
    // Ensure minimum uncertainty
    this.P[0] = Math.max(this.P[0], 0.000001);
    this.P[5] = Math.max(this.P[5], 0.000001);
  }
  
  /**
   * Get current state estimate
   */
  getState(): { lat: number; lng: number; vLat: number; vLng: number } {
    return {
      lat: this.state[0],
      lng: this.state[1],
      vLat: this.state[2],
      vLng: this.state[3],
    };
  }
  
  /**
   * Get position uncertainty in meters
   */
  getUncertaintyMeters(): number {
    const lat = this.state[0];
    const degToMetersLat = EARTH_RADIUS * DEG_TO_RAD;
    const degToMetersLng = EARTH_RADIUS * DEG_TO_RAD * Math.cos(lat * DEG_TO_RAD);
    
    const varLat = this.P[0] * degToMetersLat * degToMetersLat;
    const varLng = this.P[5] * degToMetersLng * degToMetersLng;
    
    return Math.sqrt(varLat + varLng);
  }
  
  /**
   * Check if filter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get last update timestamp
   */
  getLastTime(): number {
    return this.lastTime;
  }
  
  /**
   * Set last update time (for external time sync)
   */
  setLastTime(time: number): void {
    this.lastTime = time;
  }
  
  /**
   * Apply velocity decay (for realistic stopping)
   */
  decayVelocity(rate: number): void {
    this.state[2] *= rate;
    this.state[3] *= rate;
  }
}

// ═══════════════════════════════════════════════════════════════
// LOCATION PIPELINE
// ═══════════════════════════════════════════════════════════════

export class LocationPipeline {
  private kalman: AdaptiveKalmanFilter;
  private config: PipelineConfig;
  
  // Last valid reading
  private lastValidReading: RawLocation | null = null;
  
  // Last rejected reading (for debugging)
  private lastRejectionReason: string | null = null;
  
  // Current smoothed state
  private currentSmoothed: SmoothedLocation | null = null;
  
  // Smoothed heading (separate filter for stability)
  private smoothedHeading: number = 0;
  private headingInitialized: boolean = false;
  
  // Smoothed altitude
  private smoothedAltitude: number = 0;
  private altitudeInitialized: boolean = false;
  
  // Statistics
  private stats = {
    totalReadings: 0,
    rejectedReadings: 0,
    outlierCount: 0,
  };
  
  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.kalman = new AdaptiveKalmanFilter(this.config);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // OUTLIER REJECTION
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Check if a GPS reading is an outlier
   * Returns rejection reason or null if valid
   */
  private checkOutlier(reading: RawLocation): string | null {
    this.stats.totalReadings++;
    
    // Check accuracy
    if (reading.accuracy && reading.accuracy > this.config.minGpsAccuracy) {
      this.stats.rejectedReadings++;
      return `accuracy_too_low: ${reading.accuracy}m`;
    }
    
    // First reading - always accept
    if (!this.lastValidReading) {
      return null;
    }
    
    const dt = (reading.timestamp - this.lastValidReading.timestamp) / 1000;
    
    // Time check
    if (dt <= 0) {
      this.stats.rejectedReadings++;
      return 'invalid_timestamp';
    }
    
    // Calculate distance
    const distance = this.haversineDistance(
      this.lastValidReading.lat, this.lastValidReading.lng,
      reading.lat, reading.lng
    );
    
    // Check for impossible position jump
    if (distance > this.config.maxPositionJumpM && dt * 1000 < this.config.maxJumpTimeMs) {
      this.stats.outlierCount++;
      this.stats.rejectedReadings++;
      return `position_jump: ${distance.toFixed(1)}m in ${(dt * 1000).toFixed(0)}ms`;
    }
    
    // Check for impossible speed
    const impliedSpeed = distance / dt;
    if (impliedSpeed > this.config.maxSpeedMs) {
      this.stats.outlierCount++;
      this.stats.rejectedReadings++;
      return `speed_too_high: ${(impliedSpeed * 3.6).toFixed(1)}km/h`;
    }
    
    // Check for impossible acceleration
    if (this.lastValidReading.speed !== null && reading.speed !== null) {
      const speedChange = Math.abs(reading.speed - this.lastValidReading.speed);
      const impliedAccel = speedChange / dt;
      if (impliedAccel > this.config.maxAccelerationMs2) {
        this.stats.outlierCount++;
        this.stats.rejectedReadings++;
        return `acceleration_too_high: ${impliedAccel.toFixed(1)}m/s²`;
      }
    }
    
    return null;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // MAIN UPDATE METHOD
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Process a raw GPS reading through the pipeline
   * Returns smoothed location or null if rejected
   */
  update(input: RawLocation): SmoothedLocation | null {
    // Step 1: Outlier rejection
    const rejectionReason = this.checkOutlier(input);
    
    if (rejectionReason) {
      this.lastRejectionReason = rejectionReason;
      
      // If we have a current state, return prediction instead
      if (this.currentSmoothed) {
        return this.predict(input.timestamp);
      }
      
      return null;
    }
    
    this.lastRejectionReason = null;
    
    // Step 2: Calculate time delta
    const lastTime = this.kalman.getLastTime();
    const dt = lastTime > 0 ? (input.timestamp - lastTime) / 1000 : 0;
    
    // Step 3: Predict forward
    if (dt > 0 && this.kalman.isInitialized()) {
      this.kalman.predict(dt);
    }
    
    // Step 4: Update with GPS measurement
    this.kalman.update(input.lat, input.lng, input.accuracy || this.config.minMeasurementNoise);
    this.kalman.setLastTime(input.timestamp);
    
    // Step 5: Get filtered state
    const state = this.kalman.getState();
    
    // Step 6: Calculate derived values
    
    // Speed from velocity
    const vLatMeters = state.vLat * EARTH_RADIUS * DEG_TO_RAD;
    const vLngMeters = state.vLng * EARTH_RADIUS * DEG_TO_RAD * Math.cos(state.lat * DEG_TO_RAD);
    const calculatedSpeed = Math.sqrt(vLatMeters ** 2 + vLngMeters ** 2);
    
    // Use GPS speed if available and reasonable, otherwise calculated
    const speed = (input.speed !== null && input.speed >= 0) 
      ? input.speed * 0.7 + calculatedSpeed * 0.3  // Blend GPS and calculated
      : calculatedSpeed;
    
    // Heading (smoothed)
    let heading = 0;
    if (speed > this.config.stationarySpeedThreshold) {
      if (input.heading !== null && input.heading >= 0 && input.heading < 360) {
        heading = input.heading;
      } else {
        // Calculate from velocity
        heading = Math.atan2(vLngMeters, vLatMeters) * RAD_TO_DEG;
        heading = (heading + 360) % 360;
      }
      
      if (this.headingInitialized) {
        this.smoothedHeading = this.smoothAngle(this.smoothedHeading, heading, 0.3);
      } else {
        this.smoothedHeading = heading;
        this.headingInitialized = true;
      }
    }
    
    // Altitude (smoothed)
    if (input.altitude !== null) {
      if (this.altitudeInitialized) {
        this.smoothedAltitude = this.smoothedAltitude * 0.8 + input.altitude * 0.2;
      } else {
        this.smoothedAltitude = input.altitude;
        this.altitudeInitialized = true;
      }
    }
    
    // Confidence
    const uncertainty = this.kalman.getUncertaintyMeters();
    const accuracyFactor = Math.max(0, 1 - (input.accuracy || 50) / 100);
    const uncertaintyFactor = Math.max(0, 1 - uncertainty / 50);
    const confidence = accuracyFactor * 0.5 + uncertaintyFactor * 0.5;
    
    // Step 7: Build smoothed output
    this.currentSmoothed = {
      lat: state.lat,
      lng: state.lng,
      velocityLat: state.vLat,
      velocityLng: state.vLng,
      speed,
      heading: this.smoothedHeading,
      altitude: this.smoothedAltitude,
      confidence: Math.max(0.1, Math.min(1, confidence)),
      timestamp: input.timestamp,
      isPredicted: false,
      accuracy: Math.max(input.accuracy || 50, uncertainty),
    };
    
    this.lastValidReading = input;
    
    return this.currentSmoothed;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PREDICTION
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Predict position forward in time
   * Used for rendering ahead of GPS latency
   */
  predict(timestamp: number): SmoothedLocation | null {
    if (!this.currentSmoothed) return null;
    
    const dt = (timestamp - this.currentSmoothed.timestamp) / 1000;
    
    // Don't predict too far ahead
    if (dt <= 0) return this.currentSmoothed;
    if (dt * 1000 > this.config.maxPredictionTimeMs) {
      // Return last known state with low confidence
      return {
        ...this.currentSmoothed,
        confidence: this.currentSmoothed.confidence * 0.3,
        isPredicted: true,
      };
    }
    
    // Predict position using velocity
    const predictedLat = this.currentSmoothed.lat + this.currentSmoothed.velocityLat * dt;
    const predictedLng = this.currentSmoothed.lng + this.currentSmoothed.velocityLng * dt;
    
    // Decay confidence with prediction time
    const timeFactor = Math.max(0, 1 - dt / (this.config.maxPredictionTimeMs / 1000));
    const confidence = this.currentSmoothed.confidence * timeFactor * 0.8;
    
    // Apply velocity decay if stationary
    let speed = this.currentSmoothed.speed;
    if (speed < this.config.stationarySpeedThreshold) {
      speed *= Math.pow(this.config.velocityDecayRate, dt);
    }
    
    return {
      lat: predictedLat,
      lng: predictedLng,
      velocityLat: this.currentSmoothed.velocityLat,
      velocityLng: this.currentSmoothed.velocityLng,
      speed,
      heading: this.currentSmoothed.heading,
      altitude: this.currentSmoothed.altitude,
      confidence: Math.max(0.05, confidence),
      timestamp,
      isPredicted: true,
      accuracy: this.currentSmoothed.accuracy * (1 + dt), // Accuracy degrades with time
    };
  }
  
  /**
   * Get predicted state for current time (convenience method)
   */
  getPredictedNow(): SmoothedLocation | null {
    return this.predict(Date.now());
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ACCESSORS
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Get current smoothed state (not predicted)
   */
  getCurrentSmoothed(): SmoothedLocation | null {
    return this.currentSmoothed;
  }
  
  /**
   * Check if pipeline has a valid state
   */
  hasValidState(): boolean {
    return this.currentSmoothed !== null;
  }
  
  /**
   * Get rejection statistics
   */
  getStats(): { totalReadings: number; rejectedReadings: number; outlierRate: number } {
    return {
      totalReadings: this.stats.totalReadings,
      rejectedReadings: this.stats.rejectedReadings,
      outlierRate: this.stats.totalReadings > 0 
        ? this.stats.outlierCount / this.stats.totalReadings 
        : 0,
    };
  }
  
  /**
   * Get last rejection reason (for debugging)
   */
  getLastRejectionReason(): string | null {
    return this.lastRejectionReason;
  }
  
  /**
   * Reset pipeline state
   */
  reset(): void {
    this.kalman = new AdaptiveKalmanFilter(this.config);
    this.lastValidReading = null;
    this.currentSmoothed = null;
    this.smoothedHeading = 0;
    this.headingInitialized = false;
    this.smoothedAltitude = 0;
    this.altitudeInitialized = false;
    this.lastRejectionReason = null;
    this.stats = {
      totalReadings: 0,
      rejectedReadings: 0,
      outlierCount: 0,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Calculate haversine distance between two points
   */
  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLng = (lng2 - lng1) * DEG_TO_RAD;
    
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
              Math.sin(dLng / 2) ** 2;
    
    return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  
  /**
   * Smooth angle transition (handles 359° → 1° correctly)
   */
  private smoothAngle(current: number, target: number, factor: number): number {
    let diff = target - current;
    
    // Handle wraparound
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    return (current + diff * factor + 360) % 360;
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Create a location pipeline with default configuration
 */
export function createLocationPipeline(config?: Partial<PipelineConfig>): LocationPipeline {
  return new LocationPipeline(config);
}
