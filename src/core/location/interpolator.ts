/**
 * Location Interpolator - 60fps Smooth Position Rendering
 * 
 * Responsibilities:
 * - Smooth transition between position updates at 60fps
 * - Heading normalization (no 359° → 1° jumps)
 * - Velocity decay for realistic stopping behavior
 * - Thread-safe, can be called from any animation loop
 * 
 * This module is PURE - no UI, no external dependencies.
 * Separation of concerns: Pipeline handles filtering, Interpolator handles rendering.
 * 
 * @module core/location/interpolator
 */

// Import pipeline types for integration helper
import type { PipelineConfig } from './locationPipeline';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface InterpolatedPosition {
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  altitude: number;
  confidence: number;
  accuracy: number;
  interpolationFactor: number; // 0 = at target, 1 = far from target
}

export interface InterpolatorConfig {
  // Interpolation smoothing (lower = smoother but slower)
  positionSmoothing: number;   // Default: 0.12
  headingSmoothing: number;    // Default: 0.15
  speedSmoothing: number;      // Default: 0.1
  
  // Velocity decay (for realistic stopping)
  velocityDecayEnabled: boolean;     // Default: true
  velocityDecayRate: number;         // Default: 0.95 per second
  stopSpeedThreshold: number;        // Default: 0.3 m/s
  
  // Maximum jump handling
  maxInterpolationDistance: number;  // Default: 100 meters
  teleportThreshold: number;         // Default: 50 meters
}

export const DEFAULT_INTERPOLATOR_CONFIG: InterpolatorConfig = {
  positionSmoothing: 0.12,
  headingSmoothing: 0.15,
  speedSmoothing: 0.1,
  velocityDecayEnabled: true,
  velocityDecayRate: 0.95,
  stopSpeedThreshold: 0.3,
  maxInterpolationDistance: 100,
  teleportThreshold: 50,
};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ═══════════════════════════════════════════════════════════════
// LOCATION INTERPOLATOR
// ═══════════════════════════════════════════════════════════════

export class LocationInterpolator {
  private config: InterpolatorConfig;
  
  // Current interpolated state
  private current: InterpolatedPosition | null = null;
  
  // Target state (from pipeline)
  private target: InterpolatedPosition | null = null;
  
  // Last update time (for velocity decay)
  private lastUpdateTime: number = 0;
  
  // Teleport handling
  private isTeleporting: boolean = false;
  
  constructor(config: Partial<InterpolatorConfig> = {}) {
    this.config = { ...DEFAULT_INTERPOLATOR_CONFIG, ...config };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SET TARGET
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Set target position from smoothed pipeline output
   * Call this whenever the pipeline produces a new smoothed state
   */
  setTarget(position: {
    lat: number;
    lng: number;
    heading: number;
    speed: number;
    altitude: number;
    confidence: number;
    accuracy: number;
  }): void {
    const newTarget: InterpolatedPosition = {
      lat: position.lat,
      lng: position.lng,
      heading: position.heading,
      speed: position.speed,
      altitude: position.altitude,
      confidence: position.confidence,
      accuracy: position.accuracy,
      interpolationFactor: 0,
    };
    
    // Check for teleport (large position jump)
    if (this.current) {
      const distance = this.haversineDistance(
        this.current.lat, this.current.lng,
        position.lat, position.lng
      );
      
      if (distance > this.config.teleportThreshold) {
        // Teleport to new position instead of interpolating
        this.isTeleporting = true;
        this.current = { ...newTarget };
        this.target = newTarget;
        this.lastUpdateTime = Date.now();
        return;
      }
    }
    
    this.isTeleporting = false;
    this.target = newTarget;
    
    // Initialize current if not set
    if (!this.current) {
      this.current = { ...newTarget };
      this.lastUpdateTime = Date.now();
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INTERPOLATE (60fps call)
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Get interpolated position at current time
   * Call this at 60fps from your render loop
   */
  interpolate(): InterpolatedPosition | null {
    if (!this.current) return null;
    
    const now = Date.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
    // If we have a target, interpolate towards it
    if (this.target && !this.isTeleporting) {
      // Calculate distance to target
      const distanceToTarget = this.haversineDistance(
        this.current.lat, this.current.lng,
        this.target.lat, this.target.lng
      );
      
      // Calculate interpolation factor (0 = at target, 1 = far from target)
      const factor = Math.min(
        distanceToTarget / this.config.maxInterpolationDistance,
        1
      );
      
      // Position interpolation with exponential smoothing
      const smoothing = this.config.positionSmoothing;
      this.current.lat += (this.target.lat - this.current.lat) * smoothing;
      this.current.lng += (this.target.lng - this.current.lng) * smoothing;
      
      // Heading interpolation (handles wraparound)
      this.current.heading = this.interpolateAngle(
        this.current.heading,
        this.target.heading,
        this.config.headingSmoothing
      );
      
      // Speed interpolation
      this.current.speed += (this.target.speed - this.current.speed) * this.config.speedSmoothing;
      
      // Altitude interpolation
      this.current.altitude += (this.target.altitude - this.current.altitude) * 0.1;
      
      // Confidence and accuracy
      this.current.confidence = this.target.confidence;
      this.current.accuracy = this.target.accuracy;
      
      this.current.interpolationFactor = factor;
    }
    
    // Apply velocity decay if enabled and moving slowly
    if (this.config.velocityDecayEnabled && this.current.speed < this.config.stopSpeedThreshold) {
      const decay = Math.pow(this.config.velocityDecayRate, dt * 60); // Normalize to 60fps
      this.current.speed *= decay;
      
      // If very slow, snap to zero
      if (this.current.speed < 0.05) {
        this.current.speed = 0;
      }
    }
    
    return this.current;
  }
  
  /**
   * Quick interpolate with custom factor (for variable frame rates)
   */
  interpolateWithFactor(factor: number): InterpolatedPosition | null {
    if (!this.current || !this.target) return this.current;
    
    // Position
    this.current.lat += (this.target.lat - this.current.lat) * factor * this.config.positionSmoothing;
    this.current.lng += (this.target.lng - this.current.lng) * factor * this.config.positionSmoothing;
    
    // Heading
    this.current.heading = this.interpolateAngle(
      this.current.heading,
      this.target.heading,
      factor * this.config.headingSmoothing
    );
    
    // Speed
    this.current.speed += (this.target.speed - this.current.speed) * factor * this.config.speedSmoothing;
    
    return this.current;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Interpolate between angles (handles 359° → 1° correctly)
   */
  private interpolateAngle(current: number, target: number, factor: number): number {
    let diff = target - current;
    
    // Handle wraparound at 0°/360°
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    const result = current + diff * factor;
    
    // Normalize to 0-360
    return ((result % 360) + 360) % 360;
  }
  
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
  
  // ═══════════════════════════════════════════════════════════════
  // ACCESSORS
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Check if interpolator has a valid state
   */
  hasValidState(): boolean {
    return this.current !== null;
  }
  
  /**
   * Check if interpolator has a target
   */
  hasTarget(): boolean {
    return this.target !== null;
  }
  
  /**
   * Get current position without interpolation
   */
  getCurrent(): InterpolatedPosition | null {
    return this.current;
  }
  
  /**
   * Get target position
   */
  getTarget(): InterpolatedPosition | null {
    return this.target;
  }
  
  /**
   * Force jump to target position (teleport)
   */
  teleportToTarget(): void {
    if (this.target) {
      this.current = { ...this.target };
      this.isTeleporting = true;
    }
  }
  
  /**
   * Reset interpolator state
   */
  reset(): void {
    this.current = null;
    this.target = null;
    this.lastUpdateTime = 0;
    this.isTeleporting = false;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<InterpolatorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Create a location interpolator with default configuration
 */
export function createLocationInterpolator(config?: Partial<InterpolatorConfig>): LocationInterpolator {
  return new LocationInterpolator(config);
}

// ═══════════════════════════════════════════════════════════════
// INTEGRATION HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Combined pipeline + interpolator for easy integration
 * Note: For full functionality, create pipeline separately and pass to setTarget()
 */
export class SmoothLocationTracker {
  private pipeline: InstanceType<typeof import('./locationPipeline').LocationPipeline> | null = null;
  private interpolator: LocationInterpolator;
  private pipelineConfig: PipelineConfig;
  
  constructor(
    pipelineConfig?: Partial<PipelineConfig>,
    interpolatorConfig?: Partial<InterpolatorConfig>
  ) {
    this.pipelineConfig = { ...DEFAULT_INTERPOLATOR_CONFIG, ...pipelineConfig } as PipelineConfig;
    this.interpolator = createLocationInterpolator(interpolatorConfig);
  }
  
  /**
   * Initialize pipeline (call once before first update)
   */
  initPipeline(): void {
    if (!this.pipeline) {
      // Use dynamic import to load pipeline lazily
      import('./locationPipeline').then(({ createLocationPipeline }) => {
        this.pipeline = createLocationPipeline(this.pipelineConfig);
      });
    }
  }
  
  /**
   * Process a raw GPS reading
   * Returns true if processed successfully
   */
  update(raw: { lat: number; lng: number; accuracy?: number; speed?: number; heading?: number; altitude?: number; timestamp: number }): boolean {
    if (!this.pipeline) {
      // Pipeline not ready
      return false;
    }
    const smoothed = this.pipeline.update(raw);
    if (smoothed) {
      this.interpolator.setTarget(smoothed);
      return true;
    }
    return false;
  }
  
  /**
   * Set target directly (for external pipeline integration)
   */
  setTarget(smoothed: {
    lat: number;
    lng: number;
    heading: number;
    speed: number;
    altitude: number;
    confidence: number;
    accuracy: number;
  }): void {
    this.interpolator.setTarget(smoothed);
  }
  
  /**
   * Get interpolated position for rendering (call at 60fps)
   */
  getPosition(): InterpolatedPosition | null {
    return this.interpolator.interpolate();
  }
  
  /**
   * Get pipeline stats
   */
  getStats(): { totalReadings: number; rejectedReadings: number; outlierRate: number } | null {
    return this.pipeline?.getStats() || null;
  }
  
  /**
   * Reset both pipeline and interpolator
   */
  reset(): void {
    this.pipeline?.reset();
    this.interpolator.reset();
  }
  
  /**
   * Check if tracker has valid state
   */
  hasValidState(): boolean {
    return (this.pipeline?.hasValidState() ?? false) && this.interpolator.hasValidState();
  }
}

/**
 * Create a combined smooth location tracker
 */
export function createSmoothLocationTracker(
  pipelineConfig?: Partial<PipelineConfig>,
  interpolatorConfig?: Partial<InterpolatorConfig>
): SmoothLocationTracker {
  return new SmoothLocationTracker(pipelineConfig, interpolatorConfig);
}
