/**
 * Unified Data Service - Types
 * 
 * Core type definitions for the unified data layer.
 * 
 * @module lib/unified-data-service/types
 */

// ═══════════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════════

/**
 * Data operation types
 */
export type DataOperation = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Sync status for items in the queue
 */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

/**
 * Conflict resolution strategies
 */
export type ConflictStrategy = 'server-wins' | 'client-wins' | 'latest-timestamp' | 'merge';

/**
 * Conflict resolution result
 */
export interface ConflictResolution<T> {
  winner: 'local' | 'server';
  data: T;
  reason: string;
  strategy: ConflictStrategy;
}

/**
 * Sync queue item
 */
export interface SyncQueueItem<T = unknown> {
  id: string;
  operation: DataOperation;
  tableName: string;
  recordId: string;
  payload: T;
  originalPayload?: T;
  status: SyncStatus;
  syncAttempts: number;
  maxAttempts: number;
  lastSyncAttempt: string | null;
  syncError: string | null;
  conflictData?: T;
  resolution?: ConflictResolution<T>;
  priority: number;
  deviceId: string;
  clientTimestamp: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sync metadata for tracking sync state per table
 */
export interface SyncMetadata {
  tableName: string;
  lastSyncAt: string | null;
  lastSyncCursor: string | null;
  totalRecords: number;
  lastRecordId: string | null;
  pendingConflicts: number;
  resolvedConflicts: number;
}

/**
 * Read options
 */
export interface ReadOptions {
  useCache?: boolean;
  cacheMaxAge?: number; // in milliseconds
  forceRefresh?: boolean;
}

/**
 * Write options
 */
export interface WriteOptions {
  immediate?: boolean; // bypass queue, write directly
  priority?: number;
  conflictStrategy?: ConflictStrategy;
}

/**
 * Query options for reads
 */
export interface QueryOptions extends ReadOptions {
  startDate?: string;
  endDate?: string;
  dateField?: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
}

// ═══════════════════════════════════════════════════════════════
// Entity Types (Map to Supabase tables)
// ═══════════════════════════════════════════════════════════════

/**
 * Table names in Supabase
 */
export type TableName = 
  | 'profiles'
  | 'user_settings'
  | 'user_profiles'
  | 'body_metrics'
  | 'foods'
  | 'global_foods'
  | 'food_logs'
  | 'supplements'
  | 'supplement_logs'
  | 'workouts'
  | 'workout_laps'
  | 'workout_exercises'
  | 'routes'
  | 'sleep_logs'
  | 'goals'
  | 'notifications'
  | 'ai_insights'
  | 'user_files'
  | 'sync_queue'
  | 'sync_metadata';

/**
 * Entity with sync tracking fields
 */
export interface SyncableEntity {
  id: string;
  user_id: string;
  device_id?: string | null;
  client_timestamp?: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Subscribe to network changes
 */
export function subscribeToNetworkChanges(
  callback: (online: boolean) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Subscribe to visibility changes (app foreground/background)
 */
export function subscribeToVisibilityChanges(
  onForeground?: () => void,
  onBackground?: () => void
): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }
  
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      onForeground?.();
    } else {
      onBackground?.();
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * Generate a unique ID that is a valid UUID
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or create device ID for multi-device sync
 * P1 FIX: Added IndexedDB backup to survive localStorage clears
 */
let cachedDeviceId: string | null = null;
const DEVICE_ID_IDB_KEY = 'progress-companion-device-id';

// Simple IndexedDB helper for device ID persistence
async function getDeviceIdFromIDB(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('device-id-store', 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
      };
      
      request.onsuccess = () => {
        try {
          const db = request.result;
          const tx = db.transaction('config', 'readonly');
          const store = tx.objectStore('config');
          const getReq = store.get(DEVICE_ID_IDB_KEY);
          
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function setDeviceIdToIDB(deviceId: string): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
  
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('device-id-store', 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
      };
      
      request.onsuccess = () => {
        try {
          const db = request.result;
          const tx = db.transaction('config', 'readwrite');
          const store = tx.objectStore('config');
          store.put(deviceId, DEVICE_ID_IDB_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  
  if (typeof window === 'undefined') {
    return 'server';
  }
  
  // Try to get existing device ID from localStorage
  const stored = localStorage.getItem('device_id');
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  
  // Create new device ID
  const newDeviceId = `device-${generateId()}`;
  localStorage.setItem('device_id', newDeviceId);
  cachedDeviceId = newDeviceId;
  
  // P1 FIX: Also save to IndexedDB as backup (async, fire-and-forget)
  setDeviceIdToIDB(newDeviceId);
  
  return newDeviceId;
}

/**
 * Initialize device ID from IndexedDB if localStorage was cleared
 * Call this on app startup
 */
export async function initDeviceId(): Promise<string> {
  if (typeof window === 'undefined') return 'server';
  
  // Check localStorage first
  const localStored = localStorage.getItem('device_id');
  if (localStored) {
    cachedDeviceId = localStored;
    // Ensure IDB backup exists
    setDeviceIdToIDB(localStored);
    return localStored;
  }
  
  // localStorage was cleared - try to recover from IndexedDB
  const idbStored = await getDeviceIdFromIDB();
  if (idbStored) {
    // Restore to localStorage
    localStorage.setItem('device_id', idbStored);
    cachedDeviceId = idbStored;
    console.log('[DeviceID] Recovered from IndexedDB backup');
    return idbStored;
  }
  
  // No backup found - create new device ID
  const newDeviceId = `device-${generateId()}`;
  localStorage.setItem('device_id', newDeviceId);
  cachedDeviceId = newDeviceId;
  await setDeviceIdToIDB(newDeviceId);
  
  return newDeviceId;
}

/**
 * Get current timestamp in ISO format
 */
export function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Calculate exponential backoff delay with jitter
 * P2 FIX: Added ±10% jitter to prevent thundering herd
 */
export function calculateBackoff(attempts: number, baseDelay = 1000, maxDelay = 60000): number {
  const base = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);
  // Add ±10% jitter
  return Math.round(base * (0.9 + Math.random() * 0.2));
}

/**
 * Check if enough time has passed for retry
 */
export function canRetry(
  lastAttempt: string | null,
  attempts: number,
  maxAttempts = 5,
  baseDelay = 1000
): { allowed: boolean; delayMs: number; reason: string } {
  if (attempts >= maxAttempts) {
    return {
      allowed: false,
      delayMs: 0,
      reason: `Max retry attempts (${maxAttempts}) exceeded`,
    };
  }
  
  const delayMs = calculateBackoff(attempts, baseDelay);
  
  if (lastAttempt) {
    const elapsed = Date.now() - new Date(lastAttempt).getTime();
    if (elapsed < delayMs) {
      return {
        allowed: false,
        delayMs: delayMs - elapsed,
        reason: `Backoff: ${Math.ceil((delayMs - elapsed) / 1000)}s remaining`,
      };
    }
  }
  
  return {
    allowed: true,
    delayMs: 0,
    reason: 'Ready to sync',
  };
}
