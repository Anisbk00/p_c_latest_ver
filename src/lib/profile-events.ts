/**
 * Profile Events Module
 * 
 * Cross-page state propagation for Profile changes.
 * Emit events to trigger re-renders on Home/Analytics/Foods.
 * 
 * @module lib/profile-events
 */

import { EventEmitter } from 'events';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ProfileEventType = 
  | 'weight_updated'
  | 'goal_changed'
  | 'photo_uploaded'
  | 'settings_updated'
  | 'profile_updated'
  | 'measurement_added'
  | 'food_logged'
  | 'nutrition_updated'
  | 'workout_logged'
  | 'workout_updated'
  | 'workout_deleted'
  | 'xp_earned'
  | 'level_up';

export interface ProfileEvent {
  type: ProfileEventType;
  payload: {
    userId: string;
    timestamp: Date;
    data: Record<string, unknown>;
    source: 'profile_api' | 'context_event' | 'setup_modal';
    provenance?: {
      modelVersion?: string;
      confidence?: number;
    };
  };
}

// ═══════════════════════════════════════════════════════════════
// Global Event Emitter
// ═══════════════════════════════════════════════════════════════

const profileEventEmitter = new EventEmitter();

// Increase max listeners for high-frequency updates
profileEventEmitter.setMaxListeners(50);

// ═══════════════════════════════════════════════════════════════
// Event Emission
// ═══════════════════════════════════════════════════════════════

/**
 * Emit a profile event to all listeners (e.g., app context)
 * 
 * @example
 * ```ts
 * emitProfileEvent('weight_updated', user.id, { value: 82.4, unit: 'kg' });
 * ```
 */
export function emitProfileEvent(
  type: ProfileEventType,
  userId: string,
  data: Record<string, unknown>,
  options?: {
    provenance?: {
      modelVersion?: string;
      confidence?: number;
    };
  }
): void {
  const event: ProfileEvent = {
    type,
    payload: {
      userId,
      timestamp: new Date(),
      data,
      source: 'profile_api',
      provenance: options?.provenance,
    },
  };
  
  profileEventEmitter.emit(type, event);
  profileEventEmitter.emit('profile_updated', event); // Broadcast to all listeners
  
  logger.info(`Profile event emitted: ${type}`, { userId, eventType: type });
}

// ═══════════════════════════════════════════════════════════════
// Event Subscription
// ═══════════════════════════════════════════════════════════════

/**
 * Subscribe to profile events
 * 
 * @example
 * ```ts
 * const unsubscribe = onProfileEvent((event) => {
 *   if (event.type === 'weight_updated') {
 *     refetchTargets();
 *   }
 * });
 * 
 * // Later: cleanup
 * unsubscribe();
 * ```
 */
export function onProfileEvent(
  callback: (event: ProfileEvent) => void
): () => void {
  // Subscribe to all profile event types
  const eventTypes: ProfileEventType[] = [
    'weight_updated',
    'goal_changed',
    'photo_uploaded',
    'settings_updated',
    'profile_updated',
    'measurement_added',
    'food_logged',
    'nutrition_updated',
    'workout_logged',
    'workout_updated',
    'workout_deleted',
    'xp_earned',
    'level_up',
  ];
  
  eventTypes.forEach(eventType => {
    profileEventEmitter.on(eventType, callback);
  });
  
  // Return cleanup function
  return () => {
    eventTypes.forEach(eventType => {
      profileEventEmitter.off(eventType, callback);
    });
  };
}

/**
 * Subscribe to a specific profile event type
 */
export function onSpecificProfileEvent(
  type: ProfileEventType,
  callback: (event: ProfileEvent) => void
): () => void {
  profileEventEmitter.on(type, callback);
  
  return () => {
    profileEventEmitter.off(type, callback);
  };
}

// ═══════════════════════════════════════════════════════════════
// Human State Engine Integration
// ═══════════════════════════════════════════════════════════════

/**
 * Trigger HumanStateEngine recalculation after profile change
 * 
 * This should be called after significant profile changes to update
 * AI insights and recommendations across the app.
 */
export async function triggerHumanStateRecalculation(
  userId: string,
  changeType: 'weight' | 'goal' | 'activity_level' | 'profile' | 'nutrition' | 'workout'
): Promise<void> {
  try {
    logger.info('Triggering HumanStateEngine recalculation', { 
      userId, 
      changeType 
    });
    
    // Emit event for context listeners
    const eventType = changeType === 'nutrition' ? 'nutrition_updated' : 
                      changeType === 'workout' ? 'workout_logged' : 
                      'profile_updated';
    emitProfileEvent(eventType, userId, { 
      changeType,
      requiresRecalculation: true 
    });
    
    // In a full implementation, this would:
    // 1. Fetch latest user state
    // 2. Run through HumanStateEngine
    // 3. Update AI insights
    // 4. Update recommendations
    
    // For now, just emit the event
    // The app context will handle the rest
    
  } catch (error) {
    logger.error('Failed to trigger HumanStateEngine recalculation', error instanceof Error ? error : new Error(String(error)));
  }
}
