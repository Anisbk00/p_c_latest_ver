/**
 * Body Composition Analyzer using Groq Vision
 * 
 * Analyzes progress photos to estimate body fat percentage, muscle mass,
 * and other body composition metrics with confidence scores and provenance.
 * 
 * @module lib/body-composition-analyzer
 */

import { logger } from '@/lib/logger';
import { analyzePhoto, MODEL_NAME } from '@/lib/ai/gemini-service';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface BodyCompositionResult {
  bodyFatMin: number;
  bodyFatMax: number;
  muscleMassEstimate?: number;
  weightEstimate?: number;
  confidence: number;
  analysisSource: 'vlm' | 'fallback';
  modelVersion: string;
  analysisTimestamp: Date;
  recommendations?: string[];
  warnings?: string[];
}

export interface BodyCompositionInput {
  imageBase64: string;
  imageUrl?: string;
  userId: string;
  capturedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// VLM Analysis using Groq
// ═══════════════════════════════════════════════════════════════

const MODEL_VERSION = MODEL_NAME;
const MIN_CONFIDENCE = 0.3;
const MAX_CONFIDENCE = 0.95;

/**
 * Analyze a progress photo for body composition using Groq Vision
 * 
 * @param input - Image data and metadata
 * @returns Body composition analysis with confidence scores
 */
export async function analyzeBodyComposition(
  input: BodyCompositionInput
): Promise<BodyCompositionResult> {
  const startTime = Date.now();
  
  try {
    // Prepare the image for analysis
    const imageData = input.imageBase64 
      ? `data:image/jpeg;base64,${input.imageBase64}`
      : input.imageUrl;
    
    if (!imageData) {
      throw new Error('No image data provided for analysis');
    }
    
    logger.info('Starting Groq body composition analysis', { 
      userId: input.userId,
      hasBase64: !!input.imageBase64,
      hasUrl: !!input.imageUrl 
    });
    
    // Use the Groq vision analysis
    const result = await analyzePhoto(imageData, 'body-composition');
    
    if (!result.success) {
      logger.warn('Groq analysis failed, using fallback', { 
        userId: input.userId,
        error: result.error
      });
      return getFallbackResult(result.error || 'Groq analysis failed');
    }
    
    const analysis = result.analysis;
    
    logger.info('Groq response received', { 
      userId: input.userId,
      durationMs: Date.now() - startTime 
    });
    
    // Extract values from the analysis
    const bodyFatEstimate = analysis.bodyFatEstimate as Record<string, unknown> | undefined;
    const muscleMassEstimate = analysis.muscleMassEstimate as Record<string, unknown> | undefined;
    const weightEstimate = analysis.weightEstimate as Record<string, unknown> | undefined;
    
    // Validate and clamp values
    const bodyFatValue = bodyFatEstimate?.value ? Number(bodyFatEstimate.value) : null;
    const confidence = analysis.overallConfidence 
      ? Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, Number(analysis.overallConfidence) / 100))
      : 0.5;
    
    // If we have a single body fat value, create a range
    let bodyFatMin = 12;
    let bodyFatMax = 22;
    
    if (bodyFatValue) {
      bodyFatMin = Math.max(5, Math.min(50, bodyFatValue - 3));
      bodyFatMax = Math.max(bodyFatMin, Math.min(50, bodyFatValue + 3));
    }
    
    const finalResult: BodyCompositionResult = {
      bodyFatMin,
      bodyFatMax,
      muscleMassEstimate: muscleMassEstimate?.value ? Number(muscleMassEstimate.value) : undefined,
      weightEstimate: weightEstimate?.value ? Number(weightEstimate.value) : undefined,
      confidence,
      analysisSource: 'vlm',
      modelVersion: MODEL_VERSION,
      analysisTimestamp: new Date(),
      recommendations: Array.isArray(analysis.recommendations) 
        ? analysis.recommendations as string[] 
        : [],
      warnings: [analysis.analysisNotes as string].filter(Boolean) as string[],
    };
    
    logger.info('Body composition analysis complete', {
      userId: input.userId,
      bodyFatRange: `${bodyFatMin}-${bodyFatMax}%`,
      confidence,
      durationMs: Date.now() - startTime
    });
    
    return finalResult;
    
  } catch (error) {
    logger.error('Groq analysis failed, using fallback', error instanceof Error ? error : new Error(String(error)));
    return getFallbackResult(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Get fallback result when analysis fails
 */
function getFallbackResult(reason: string): BodyCompositionResult {
  return {
    bodyFatMin: 12,
    bodyFatMax: 22,
    confidence: 0.25,
    analysisSource: 'fallback',
    modelVersion: 'fallback-v1',
    analysisTimestamp: new Date(),
    warnings: [
      'Groq analysis unavailable - using fallback estimate',
      'Results are not personalized',
      reason,
    ],
    recommendations: [
      'Ensure good lighting for accurate analysis',
      'Take photos in consistent poses',
      'Wear form-fitting clothing',
    ],
  };
}

/**
 * Validate image quality before analysis
 * Returns warnings if image may produce poor results
 */
export function validateImageQuality(imageBase64: string): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // Check if image data is present
  if (!imageBase64 || imageBase64.length < 1000) {
    return {
      isValid: false,
      warnings: ['Image data is too small or missing'],
    };
  }
  
  // Estimate image size (base64 is ~33% larger than binary)
  const estimatedSizeBytes = (imageBase64.length * 3) / 4;
  
  if (estimatedSizeBytes < 50000) {
    warnings.push('Image resolution may be too low for accurate analysis');
  }
  
  if (estimatedSizeBytes > 8000000) {
    warnings.push('Image is very large - consider compressing for faster analysis');
  }
  
  return {
    isValid: true,
    warnings,
  };
}
