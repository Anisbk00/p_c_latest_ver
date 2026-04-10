/**
 * Core Location Module
 * 
 * Production-grade GPS tracking pipeline:
 * RAW GPS → FILTERED → PREDICTED → INTERPOLATED → RENDERED
 * 
 * Architecture:
 * - locationPipeline.ts: Pure Kalman filter + outlier rejection
 * - interpolator.ts: 60fps smooth rendering with heading normalization
 * 
 * @module core/location
 */

// Pipeline
export {
  LocationPipeline,
  createLocationPipeline,
  type RawLocation,
  type SmoothedLocation,
  type PipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
} from './locationPipeline';

// Interpolator
export {
  LocationInterpolator,
  SmoothLocationTracker,
  createLocationInterpolator,
  createSmoothLocationTracker,
  type InterpolatedPosition,
  type InterpolatorConfig,
  DEFAULT_INTERPOLATOR_CONFIG,
} from './interpolator';
