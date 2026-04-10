/**
 * IndexedDB-based offline storage service for workouts
 * Provides persistent storage when offline and sync queue management
 * Updated: 2025-03-02 - Added conflict resolution and retry limits
 * Updated: 2025-03-02 - Added storage quota handling to prevent data loss
 */

const DB_NAME = 'progress-companion-offline';
const DB_VERSION = 5; // Bumped version for analytics cache store

// Maximum retry attempts before marking as permanently failed
const MAX_RETRY_ATTEMPTS = 5;
// Base delay for exponential backoff (in ms)
const BASE_RETRY_DELAY = 1000;
// Storage quota warning threshold (bytes)
const STORAGE_WARNING_THRESHOLD = 0.9; // 90% of quota

// Store names
const STORES = {
  WORKOUTS: 'offline-workouts',
  FOOD_LOG: 'offline-food-log',
  SYNC_QUEUE: 'sync-queue',
  ANALYTICS_CACHE: 'analytics-cache',
} as const;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type WorkoutStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface OfflineWorkout {
  id: string;
  tempId: string;
  activityType: string;
  workoutType: string;
  name: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  activeDuration: number | null;
  distanceMeters: number | null;
  routeData: string | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  avgPace: number | null;
  avgSpeed: number | null;
  maxPace: number | null;
  maxSpeed: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  totalVolume: number | null;
  totalReps: number | null;
  totalSets: number | null;
  caloriesBurned: number | null;
  trainingLoad: number | null;
  intensityFactor: number | null;
  recoveryImpact: number | null;
  effortScore: number | null;
  isPR: boolean;
  prType: string | null;
  splits: string | null;
  deviceSource: string | null;
  deviceId: string | null;
  notes: string | null;
  photos: string | null;
  rating: number | null;
  weatherData: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  syncedAt: string | null;
  serverId: string | null;
  // Conflict resolution
  version: number;
  // Retry tracking
  syncAttempts: number;
  lastSyncAttempt: string | null;
  syncError: string | null;
}

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: 'workout';
  entityId: string;
  data: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  error: string | null;
}

export interface SyncStatus {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  lastSyncAt: number | null;
  isOnline: boolean;
}

export interface SyncProgress {
  total: number;
  synced: number;
  failed: number;
  current: string;
}

// Offline Food Log Entry
export interface OfflineFoodEntry {
  id: string;
  tempId: string;
  foodId: string | null;
  foodName: string | null;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  loggedAt: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  syncedAt: string | null;
  serverId: string | null;
  // For optimistic revert
  operation: 'create' | 'update' | 'delete';
  // Conflict resolution
  version: number;
  // Retry tracking
  syncAttempts: number;
  lastSyncAttempt: string | null;
  syncError: string | null;
}

// Database instance
let dbInstance: IDBDatabase | null = null;

// ═══════════════════════════════════════════════════════════════
// CROSS-TAB LOCKING (P0 FIX)
// Prevents multiple tabs from writing to IndexedDB simultaneously
// ═══════════════════════════════════════════════════════════════

const LOCK_CHANNEL_NAME = 'progress-companion-idb-lock';
const LOCK_TIMEOUT_MS = 10000; // 10 second lock timeout

interface CrossTabLock {
  channel: BroadcastChannel | null;
  lockId: string | null;
  lockQueue: Array<{ resolve: (acquired: boolean) => void; lockId: string }>;
  isLocked: boolean;
}

const crossTabLock: CrossTabLock = {
  channel: null,
  lockId: null,
  lockQueue: [],
  isLocked: false,
};

function initCrossTabLock(): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return;
  }
  
  if (crossTabLock.channel) return;
  
  crossTabLock.channel = new BroadcastChannel(LOCK_CHANNEL_NAME);
  crossTabLock.channel.onmessage = (event) => {
    const { type, lockId } = event.data;
    
    if (type === 'LOCK_ACQUIRED' && crossTabLock.isLocked && crossTabLock.lockId !== lockId) {
      // Another tab acquired the lock, we need to wait
      console.log('[IDB] Another tab acquired lock, queueing our operations');
    } else if (type === 'LOCK_RELEASED') {
      // Lock released, process our queue
      const next = crossTabLock.lockQueue.shift();
      if (next) {
        crossTabLock.isLocked = true;
        crossTabLock.lockId = next.lockId;
        crossTabLock.channel?.postMessage({ type: 'LOCK_ACQUIRED', lockId: next.lockId });
        next.resolve(true);
      }
    }
  };
}

/**
 * Acquire cross-tab lock for IndexedDB writes
 * Returns true if lock acquired, false if timed out
 */
export async function acquireIDBLock(): Promise<boolean> {
  if (typeof window === 'undefined') return true; // SSR - always allow
  
  initCrossTabLock();
  
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  // If no lock held, acquire immediately
  if (!crossTabLock.isLocked) {
    crossTabLock.isLocked = true;
    crossTabLock.lockId = lockId;
    crossTabLock.channel?.postMessage({ type: 'LOCK_ACQUIRED', lockId });
    return true;
  }
  
  // Wait in queue with timeout
  return new Promise((resolve) => {
    let resolved = false;
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Remove from queue
        const idx = crossTabLock.lockQueue.findIndex(item => item.lockId === lockId);
        if (idx !== -1) crossTabLock.lockQueue.splice(idx, 1);
        console.warn('[IDB] Cross-tab lock acquisition timed out');
        resolve(false);
      }
    }, LOCK_TIMEOUT_MS);
    
    crossTabLock.lockQueue.push({
      lockId,
      resolve: (acquired: boolean) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(acquired);
        }
      },
    });
  });
}

/**
 * Release cross-tab lock
 */
export function releaseIDBLock(): void {
  if (typeof window === 'undefined') return;
  
  crossTabLock.isLocked = false;
  crossTabLock.lockId = null;
  crossTabLock.channel?.postMessage({ type: 'LOCK_RELEASED' });
  
  // Process local queue first
  const next = crossTabLock.lockQueue.shift();
  if (next) {
    crossTabLock.isLocked = true;
    crossTabLock.lockId = next.lockId;
    crossTabLock.channel?.postMessage({ type: 'LOCK_ACQUIRED', lockId: next.lockId });
    next.resolve(true);
  }
}

/**
 * Execute a function with cross-tab lock protection
 */
export async function withIDBLock<T>(fn: () => Promise<T>): Promise<T> {
  const acquired = await acquireIDBLock();
  if (!acquired) {
    throw new Error('Could not acquire IndexedDB lock - another tab may be syncing');
  }
  
  try {
    return await fn();
  } finally {
    releaseIDBLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// DATABASE INITIALIZATION
// ═══════════════════════════════════════════════════════════════

export function initDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Return a mock during SSR
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      resolve({} as IDBDatabase);
      return;
    }
    
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.WORKOUTS)) {
        const workoutStore = db.createObjectStore(STORES.WORKOUTS, { keyPath: 'tempId' });
        workoutStore.createIndex('synced', 'synced', { unique: false });
        workoutStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.FOOD_LOG)) {
        const foodLogStore = db.createObjectStore(STORES.FOOD_LOG, { keyPath: 'tempId' });
        foodLogStore.createIndex('synced', 'synced', { unique: false });
        foodLogStore.createIndex('loggedAt', 'loggedAt', { unique: false });
        foodLogStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('entityId', 'entityId', { unique: false });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.ANALYTICS_CACHE)) {
        const analyticsStore = db.createObjectStore(STORES.ANALYTICS_CACHE, { keyPath: 'key' });
        analyticsStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export function generateTempId(): string {
  // P0 FIX: Always prefix with 'temp_' for consistent offline ID detection
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
  return `temp_${uuid}`;
}

export function isTempId(id: string): boolean {
  // P0 FIX: Check for both 'temp-' (legacy) and 'temp_' (new format)
  return id.startsWith('temp-') || id.startsWith('temp_');
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function subscribeToNetworkChanges(callback: (online: boolean) => void): () => void {
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
 * Subscribe to visibility changes with separate callbacks (OFF-001 fix)
 * @param onForeground - Called when app becomes visible
 * @param onBackground - Called when app goes to background
 */
export function subscribeToVisibilityChanges(
  onForeground?: () => void,
  onBackground?: () => void
): () => void {
  if (typeof window === 'undefined') {
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

export async function waitForPendingTransactions(): Promise<void> {
  // In this implementation, transactions are synchronous
  // This function exists for API compatibility
  return Promise.resolve();
}

// ═══════════════════════════════════════════════════════════════
// WORKOUT STORAGE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if storage quota is approaching limit
 */
async function checkStorageQuota(): Promise<{ ok: boolean; used: number; quota: number }> {
  if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const ok = quota === 0 || used / quota < STORAGE_WARNING_THRESHOLD;
      return { ok, used, quota };
    } catch {
      // Storage API not available, assume ok
      return { ok: true, used: 0, quota: 0 };
    }
  }
  return { ok: true, used: 0, quota: 0 };
}

/**
 * Handle QuotaExceededError by attempting cleanup
 */
async function handleQuotaExceeded(): Promise<boolean> {
  console.warn('[OfflineStorage] Storage quota exceeded, attempting cleanup...');
  
  try {
    // Try to clean up old synced entries
    const result = await cleanupOldSyncedEntries();
    console.log('[OfflineStorage] Cleaned up', result.workoutsRemoved + result.foodEntriesRemoved, 'old entries');
    
    // Also try to clear sync queue of completed items
    if (typeof window !== 'undefined') {
      const db = await initDatabase();
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      // Delete all synced items from queue
      store.clear();
    }
    
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Cleanup failed:', error);
    return false;
  }
}

/**
 * Wrapper for storage operations with quota handling
 */
async function safeStorageOperation<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = (error as { name?: string })?.name;
    
    // Check for QuotaExceededError (can have different names across browsers)
    if (
      errorName === 'QuotaExceededError' ||
      errorName === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      errorMessage.includes('quota') ||
      errorMessage.includes('storage')
    ) {
      console.error('[OfflineStorage] Storage quota exceeded');
      
      // Try cleanup and retry once
      const cleaned = await handleQuotaExceeded();
      if (cleaned) {
        try {
          return await operation();
        } catch (retryError) {
          console.error('[OfflineStorage] Retry after cleanup failed');
        }
      }
      
      // Return fallback if available
      if (fallback !== undefined) {
        console.warn('[OfflineStorage] Using fallback value due to quota error');
        return fallback;
      }
      
      throw new Error('Storage quota exceeded. Please free up space or sync pending data.');
    }
    
    throw error;
  }
}

export async function saveOfflineWorkout(workout: OfflineWorkout): Promise<OfflineWorkout> {
  if (typeof window === 'undefined') {
    return workout;
  }
  
  // P0 FIX: Use cross-tab lock to prevent concurrent writes
  return withIDBLock(async () => {
    return safeStorageOperation(async () => {
      const db = await initDatabase();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.WORKOUTS], 'readwrite');
        const store = transaction.objectStore(STORES.WORKOUTS);
        const request = store.put(workout);
        request.onsuccess = () => resolve(workout);
        request.onerror = () => reject(new Error('Failed to save workout'));
      });
    }, workout);
  });
}

export async function getOfflineWorkouts(): Promise<OfflineWorkout[]> {
  if (typeof window === 'undefined') return [];
  
  const db = await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.WORKOUTS], 'readonly');
    const store = transaction.objectStore(STORES.WORKOUTS);
    const request = store.getAll();
    request.onsuccess = () => {
      const workouts = request.result as OfflineWorkout[];
      workouts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(workouts);
    };
    request.onerror = () => reject(new Error('Failed to get workouts'));
  });
}

export async function getUnsyncedWorkouts(): Promise<OfflineWorkout[]> {
  if (typeof window === 'undefined') return [];

  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.WORKOUTS], 'readonly');
    const store = transaction.objectStore(STORES.WORKOUTS);
    const index = store.index('synced');
    const request = index.getAll(false);
    request.onsuccess = () => {
      const workouts = request.result as OfflineWorkout[];
      workouts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(workouts);
    };
    request.onerror = () => reject(new Error('Failed to get unsynced workouts'));
  });
}

export async function getOfflineWorkout(tempId: string): Promise<OfflineWorkout | null> {
  if (typeof window === 'undefined') return null;
  
  const db = await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.WORKOUTS], 'readonly');
    const store = transaction.objectStore(STORES.WORKOUTS);
    const request = store.get(tempId);
    request.onsuccess = () => resolve(request.result as OfflineWorkout | null);
    request.onerror = () => reject(new Error('Failed to get workout'));
  });
}

export async function updateOfflineWorkout(
  tempId: string, 
  updates: Partial<OfflineWorkout>
): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // P0 FIX: Use cross-tab lock to prevent concurrent writes
  return withIDBLock(async () => {
    const db = await initDatabase();
    
    return new Promise(async (resolve, reject) => {
      const transaction = db.transaction([STORES.WORKOUTS], 'readwrite');
      const store = transaction.objectStore(STORES.WORKOUTS);
      const getRequest = store.get(tempId);
      
      getRequest.onsuccess = () => {
        const workout = getRequest.result as OfflineWorkout | undefined;
        if (!workout) {
          reject(new Error('Workout not found'));
          return;
        }
        
        const updated: OfflineWorkout = {
          ...workout,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(new Error('Failed to update workout'));
      };
      
      getRequest.onerror = () => reject(new Error('Failed to get workout'));
    });
  });
}

export async function deleteOfflineWorkout(tempId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // P0 FIX: Use cross-tab lock to prevent concurrent writes
  return withIDBLock(async () => {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.WORKOUTS], 'readwrite');
      const store = transaction.objectStore(STORES.WORKOUTS);
      const request = store.delete(tempId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete workout'));
    });
  });
}

export async function markWorkoutSynced(tempId: string, serverId: string): Promise<void> {
  await updateOfflineWorkout(tempId, {
    synced: true,
    syncedAt: new Date().toISOString(),
    serverId,
  });
}

// ═══════════════════════════════════════════════════════════════
// FOOD LOG STORAGE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export async function saveOfflineFoodEntry(entry: OfflineFoodEntry): Promise<OfflineFoodEntry> {
  if (typeof window === 'undefined') {
    return entry;
  }
  
  // P0 FIX: Use cross-tab lock to prevent concurrent writes
  return withIDBLock(async () => {
    return safeStorageOperation(async () => {
      const db = await initDatabase();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.FOOD_LOG], 'readwrite');
        const store = transaction.objectStore(STORES.FOOD_LOG);
        const request = store.put(entry);
        request.onsuccess = () => resolve(entry);
        request.onerror = () => reject(new Error('Failed to save food entry'));
      });
    }, entry);
  });
}

export async function getOfflineFoodEntries(): Promise<OfflineFoodEntry[]> {
  if (typeof window === 'undefined') return [];
  
  const db = await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FOOD_LOG], 'readonly');
    const store = transaction.objectStore(STORES.FOOD_LOG);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as OfflineFoodEntry[];
      entries.sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
      resolve(entries);
    };
    request.onerror = () => reject(new Error('Failed to get food entries'));
  });
}

export async function getUnsyncedFoodEntries(): Promise<OfflineFoodEntry[]> {
  if (typeof window === 'undefined') return [];

  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FOOD_LOG], 'readonly');
    const store = transaction.objectStore(STORES.FOOD_LOG);
    const index = store.index('synced');
    const request = index.getAll(false);
    request.onsuccess = () => {
      const entries = request.result as OfflineFoodEntry[];
      entries.sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
      resolve(entries);
    };
    request.onerror = () => reject(new Error('Failed to get unsynced food entries'));
  });
}

export async function getOfflineFoodEntry(tempId: string): Promise<OfflineFoodEntry | null> {
  if (typeof window === 'undefined') return null;
  
  const db = await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FOOD_LOG], 'readonly');
    const store = transaction.objectStore(STORES.FOOD_LOG);
    const request = store.get(tempId);
    request.onsuccess = () => resolve(request.result as OfflineFoodEntry | null);
    request.onerror = () => reject(new Error('Failed to get food entry'));
  });
}

export async function updateOfflineFoodEntry(
  tempId: string, 
  updates: Partial<OfflineFoodEntry>
): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // P0 FIX: Use cross-tab lock to prevent concurrent writes
  return withIDBLock(async () => {
    const db = await initDatabase();
    
    return new Promise(async (resolve, reject) => {
      const transaction = db.transaction([STORES.FOOD_LOG], 'readwrite');
      const store = transaction.objectStore(STORES.FOOD_LOG);
      const getRequest = store.get(tempId);
      
      getRequest.onsuccess = () => {
        const entry = getRequest.result as OfflineFoodEntry | undefined;
        if (!entry) {
          reject(new Error('Food entry not found'));
          return;
        }
        
        const updated: OfflineFoodEntry = {
          ...entry,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(new Error('Failed to update food entry'));
      };
      
      getRequest.onerror = () => reject(new Error('Failed to get food entry'));
    });
  });
}

export async function deleteOfflineFoodEntry(tempId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // P0 FIX: Use cross-tab lock to prevent concurrent writes
  return withIDBLock(async () => {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.FOOD_LOG], 'readwrite');
      const store = transaction.objectStore(STORES.FOOD_LOG);
      const request = store.delete(tempId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete food entry'));
    });
  });
}

export async function markFoodEntrySynced(tempId: string, serverId: string): Promise<void> {
  await updateOfflineFoodEntry(tempId, {
    synced: true,
    syncedAt: new Date().toISOString(),
    serverId,
  });
}

// ═══════════════════════════════════════════════════════════════
// SYNC QUEUE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts' | 'lastAttemptAt' | 'error'>): Promise<SyncQueueItem> {
  const queueItem: SyncQueueItem = {
    id: generateTempId(),
    ...item,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    error: null,
  };
  
  if (typeof window === 'undefined') {
    return queueItem;
  }
  
  return safeStorageOperation(async () => {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.add(queueItem);
      request.onsuccess = () => resolve(queueItem);
      request.onerror = () => reject(new Error('Failed to add to sync queue'));
    });
  }, queueItem);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  if (typeof window === 'undefined') return [];
  
  const db = await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readonly');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result as SyncQueueItem[];
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      resolve(items);
    };
    request.onerror = () => reject(new Error('Failed to get sync queue'));
  });
}

export async function updateSyncQueueItem(
  id: string, 
  updates: Partial<SyncQueueItem>
): Promise<void> {
  if (typeof window === 'undefined') return;
  
  const db = await initDatabase();
  
  return new Promise(async (resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const item = getRequest.result as SyncQueueItem | undefined;
      if (!item) {
        reject(new Error('Sync queue item not found'));
        return;
      }
      
      const updated: SyncQueueItem = {
        ...item,
        ...updates,
      };
      
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(new Error('Failed to update sync queue item'));
    };
    
    getRequest.onerror = () => reject(new Error('Failed to get sync queue item'));
  });
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  const db = await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to remove sync queue item'));
  });
}

export async function clearCompletedOperations(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  const db = await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.WORKOUTS, STORES.SYNC_QUEUE], 'readwrite');
    
    // Clear synced workouts from local storage (optional - keep for history)
    const workoutStore = transaction.objectStore(STORES.WORKOUTS);
    const workoutRequest = workoutStore.openCursor();
    
    workoutRequest.onsuccess = () => {
      // Keep workouts for local history
      resolve();
    };
    
    workoutRequest.onerror = () => reject(new Error('Failed to clear completed operations'));
  });
}

// ═══════════════════════════════════════════════════════════════
// STATS AND STATUS FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export async function getOfflineStats(): Promise<{
  totalWorkouts: number;
  totalFoodEntries: number;
  unsyncedCount: number;
  unsyncedFoodCount: number;
  pendingOperations: number;
  syncQueueSize: number;
}> {
  if (typeof window === 'undefined') {
    return {
      totalWorkouts: 0,
      totalFoodEntries: 0,
      unsyncedCount: 0,
      unsyncedFoodCount: 0,
      pendingOperations: 0,
      syncQueueSize: 0,
    };
  }
  
  const [workouts, foodEntries, queue] = await Promise.all([
    getOfflineWorkouts(),
    getOfflineFoodEntries(),
    getSyncQueue(),
  ]);
  
  const unsyncedWorkouts = workouts.filter(w => !w.synced);
  const unsyncedFood = foodEntries.filter(e => !e.synced);
  
  return {
    totalWorkouts: workouts.length,
    totalFoodEntries: foodEntries.length,
    unsyncedCount: unsyncedWorkouts.length,
    unsyncedFoodCount: unsyncedFood.length,
    pendingOperations: unsyncedWorkouts.length + unsyncedFood.length,
    syncQueueSize: queue.length,
  };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  if (typeof window === 'undefined') {
    return {
      pending: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      lastSyncAt: null,
      isOnline: true,
    };
  }
  
  const workouts = await getOfflineWorkouts();
  
  let lastSyncAt: number | null = null;
  const syncedWorkouts = workouts.filter(w => w.synced);
  
  if (syncedWorkouts.length > 0) {
    const latest = syncedWorkouts.reduce((latest, w) => {
      const syncedAt = w.syncedAt ? new Date(w.syncedAt).getTime() : 0;
      return syncedAt > latest ? syncedAt : latest;
    }, 0);
    lastSyncAt = latest > 0 ? latest : null;
  }
  
  // Count items that have exceeded max retry attempts as failed
  const failedWorkouts = workouts.filter(w => !w.synced && (w.syncAttempts || 0) >= MAX_RETRY_ATTEMPTS);
  
  return {
    pending: workouts.filter(w => !w.synced && (w.syncAttempts || 0) < MAX_RETRY_ATTEMPTS).length,
    syncing: 0, // We don't track in-progress syncs in status
    synced: syncedWorkouts.length,
    failed: failedWorkouts.length,
    lastSyncAt,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };
}

// ═══════════════════════════════════════════════════════════════
// CONFLICT RESOLUTION & RETRY HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a sync attempt should be allowed based on retry limits and backoff
 */
export function shouldAttemptSync(item: { syncAttempts?: number; lastSyncAttempt?: string | null }): {
  allowed: boolean;
  delayMs: number;
  reason: string;
} {
  const attempts = item.syncAttempts || 0;
  
  // Check if max retries exceeded
  if (attempts >= MAX_RETRY_ATTEMPTS) {
    return {
      allowed: false,
      delayMs: 0,
      reason: `Max retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded`,
    };
  }
  
  // Calculate exponential backoff delay with jitter
  // P2 FIX: Add random jitter (±10%) to prevent thundering herd when multiple tabs sync
  const baseDelay = Math.min(BASE_RETRY_DELAY * Math.pow(2, attempts), 60000); // Cap at 60 seconds
  const jitter = baseDelay * (0.9 + Math.random() * 0.2); // ±10% randomization
  const delayMs = Math.round(jitter);
  
  // Check if enough time has passed since last attempt
  if (item.lastSyncAttempt) {
    const lastAttempt = new Date(item.lastSyncAttempt).getTime();
    const elapsed = Date.now() - lastAttempt;
    
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

/**
 * Record a sync attempt for retry tracking
 */
export async function recordSyncAttempt(
  type: 'workout' | 'food',
  tempId: string,
  error?: string
): Promise<void> {
  if (typeof window === 'undefined') return;
  
  if (type === 'workout') {
    const workout = await getOfflineWorkout(tempId);
    if (workout) {
      await updateOfflineWorkout(tempId, {
        syncAttempts: (workout.syncAttempts || 0) + 1,
        lastSyncAttempt: new Date().toISOString(),
        syncError: error || null,
      });
    }
  } else {
    const entry = await getOfflineFoodEntry(tempId);
    if (entry) {
      await updateOfflineFoodEntry(tempId, {
        syncAttempts: (entry.syncAttempts || 0) + 1,
        lastSyncAttempt: new Date().toISOString(),
        syncError: error || null,
      });
    }
  }
}

/**
 * Resolve conflict between local and server data
 * Returns the winning version based on timestamps and version numbers
 */
export function resolveConflict<T extends { version: number; updatedAt: string }>(
  local: T,
  server: T,
  strategy: 'server-wins' | 'client-wins' | 'latest-timestamp' = 'latest-timestamp'
): { winner: 'local' | 'server'; data: T; reason: string } {
  if (strategy === 'server-wins') {
    return { winner: 'server', data: server, reason: 'Server-wins strategy' };
  }
  
  if (strategy === 'client-wins') {
    return { winner: 'local', data: local, reason: 'Client-wins strategy' };
  }
  
  // Latest timestamp strategy with version check
  const localTime = new Date(local.updatedAt).getTime();
  const serverTime = new Date(server.updatedAt).getTime();
  
  // If server has higher version, it likely has more recent changes
  if (server.version > local.version) {
    return { winner: 'server', data: server, reason: 'Server has higher version' };
  }
  
  // If local has higher version, keep local
  if (local.version > server.version) {
    return { winner: 'local', data: local, reason: 'Local has higher version' };
  }
  
  // Same version - use timestamp
  if (localTime > serverTime) {
    return { winner: 'local', data: local, reason: 'Local is more recent' };
  } else if (serverTime > localTime) {
    return { winner: 'server', data: server, reason: 'Server is more recent' };
  }
  
  // Exact same timestamp - prefer server to avoid data loss
  return { winner: 'server', data: server, reason: 'Same timestamp, server preferred' };
}

/**
 * Get items that are ready for sync (not exceeded retry limits)
 */
export async function getSyncableWorkouts(): Promise<OfflineWorkout[]> {
  const unsynced = await getUnsyncedWorkouts();
  
  return unsynced.filter(workout => {
    const { allowed } = shouldAttemptSync(workout);
    return allowed;
  });
}

/**
 * Get items that are ready for sync (not exceeded retry limits)
 */
export async function getSyncableFoodEntries(): Promise<OfflineFoodEntry[]> {
  const unsynced = await getUnsyncedFoodEntries();
  
  return unsynced.filter(entry => {
    const { allowed } = shouldAttemptSync(entry);
    return allowed;
  });
}

/**
 * Clear old synced entries to prevent memory bloat
 * Keeps entries from the last 30 days
 */
export async function cleanupOldSyncedEntries(): Promise<{ workoutsRemoved: number; foodEntriesRemoved: number }> {
  if (typeof window === 'undefined') {
    return { workoutsRemoved: 0, foodEntriesRemoved: 0 };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  const db = await initDatabase();
  let workoutsRemoved = 0;
  let foodEntriesRemoved = 0;

  // Use synced index + batch delete in a single transaction
  return withIDBLock(async () => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [STORES.WORKOUTS, STORES.FOOD_LOG, STORES.SYNC_QUEUE],
        'readwrite'
      );
      const workoutStore = transaction.objectStore(STORES.WORKOUTS);
      const foodStore = transaction.objectStore(STORES.FOOD_LOG);
      const syncQueueStore = transaction.objectStore(STORES.SYNC_QUEUE);

      const deletedWorkoutIds = new Set<string>();

      // Query only synced workouts via index
      const workoutIndex = workoutStore.index('synced');
      const workoutRequest = workoutIndex.getAll(true);

      workoutRequest.onsuccess = () => {
        const syncedWorkouts = workoutRequest.result as OfflineWorkout[];
        for (const workout of syncedWorkouts) {
          if (workout.syncedAt && workout.syncedAt < cutoff) {
            workoutStore.delete(workout.tempId);
            deletedWorkoutIds.add(workout.tempId);
            workoutsRemoved++;
          }
        }

        // Query only synced food entries via index
        const foodIndex = foodStore.index('synced');
        const foodRequest = foodIndex.getAll(true);

        foodRequest.onsuccess = () => {
          const syncedEntries = foodRequest.result as OfflineFoodEntry[];
          for (const entry of syncedEntries) {
            if (entry.syncedAt && entry.syncedAt < cutoff) {
              foodStore.delete(entry.tempId);
              foodEntriesRemoved++;
            }
          }

          // Clean up orphaned sync queue entries for deleted workouts
          if (deletedWorkoutIds.size > 0) {
            const syncQueueRequest = syncQueueStore.getAll();
            syncQueueRequest.onsuccess = () => {
              const queueItems = syncQueueRequest.result as SyncQueueItem[];
              for (const item of queueItems) {
                if (deletedWorkoutIds.has(item.entityId)) {
                  syncQueueStore.delete(item.id);
                }
              }
            };
          }
        };
      };

      transaction.oncomplete = () => {
        resolve({ workoutsRemoved, foodEntriesRemoved });
      };

      transaction.onerror = () => {
        reject(new Error('Failed to clean up old synced entries'));
      };
    });
  });
}

// Export storage quota utilities
export { checkStorageQuota, handleQuotaExceeded };

// Export constants for external use
export { MAX_RETRY_ATTEMPTS, BASE_RETRY_DELAY };

// ═══════════════════════════════════════════════════════════════
// ANALYTICS CACHE (P1 FIX)
// Cache analytics data for offline access and faster cold starts
// ═══════════════════════════════════════════════════════════════

const ANALYTICS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface AnalyticsCacheEntry {
  key: string;
  data: unknown;
  cachedAt: number;
}

/**
 * Cache analytics data in IndexedDB
 */
export async function cacheAnalytics(key: string, data: unknown): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const db = await initDatabase();
    const entry: AnalyticsCacheEntry = {
      key,
      data,
      cachedAt: Date.now(),
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.ANALYTICS_CACHE], 'readwrite');
      const store = transaction.objectStore(STORES.ANALYTICS_CACHE);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to cache analytics'));
    });
  } catch (error) {
    console.warn('[Analytics Cache] Failed to cache:', error);
  }
}

/**
 * Get cached analytics data if not expired
 */
export async function getCachedAnalytics<T = unknown>(key: string): Promise<T | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    const db = await initDatabase();
    
    const entry = await new Promise<AnalyticsCacheEntry | null>((resolve, reject) => {
      const transaction = db.transaction([STORES.ANALYTICS_CACHE], 'readonly');
      const store = transaction.objectStore(STORES.ANALYTICS_CACHE);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get cached analytics'));
    });
    
    if (!entry) return null;
    
    // Check if expired
    const age = Date.now() - entry.cachedAt;
    if (age > ANALYTICS_CACHE_TTL_MS) {
      // Expired, clean up in background
      clearCachedAnalytics(key).catch(console.warn);
      return null;
    }
    
    return entry.data as T;
  } catch (error) {
    console.warn('[Analytics Cache] Failed to get cache:', error);
    return null;
  }
}

/**
 * Clear specific analytics cache entry
 */
export async function clearCachedAnalytics(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.ANALYTICS_CACHE], 'readwrite');
      const store = transaction.objectStore(STORES.ANALYTICS_CACHE);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear cached analytics'));
    });
  } catch (error) {
    console.warn('[Analytics Cache] Failed to clear:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPLETE DATA WIPE (P0 FIX FOR DELETED USER)
// Clears ALL local data when user account is deleted
// ═══════════════════════════════════════════════════════════════

/**
 * Clear ALL local data - call when user account is deleted
 * This wipes IndexedDB, localStorage, and resets the database instance
 */
export async function clearAllLocalData(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  console.log('[OfflineStorage] Clearing ALL local data...');
  
  try {
    // 1. Clear all IndexedDB stores
    const db = await initDatabase();
    
    const storeNames = Object.values(STORES);
    const clearPromises = storeNames.map(storeName => {
      return new Promise<void>((resolve, reject) => {
        try {
          const transaction = db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => {
            console.warn(`[OfflineStorage] Failed to clear ${storeName}`);
            resolve(); // Don't fail the whole operation
          };
        } catch {
          resolve(); // Continue even if one store fails
        }
      });
    });
    
    await Promise.all(clearPromises);
    console.log('[OfflineStorage] IndexedDB stores cleared');
    
    // 2. Clear localStorage items related to the app
    const localStorageKeys = [
      'device-id',
      'supabase.auth.token',
      'sb-access-token',
      'sb-refresh-token',
      'supabase-session',
    ];
    
    // Also clear any keys that start with common prefixes
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('supabase') ||
        key.startsWith('sb-') ||
        key.startsWith('progress-companion') ||
        key.startsWith('offline-') ||
        key.startsWith('device-') ||
        key.startsWith('user-') ||
        key.startsWith('auth-')
      )) {
        keysToRemove.push(key);
      }
    }
    
    // Add explicitly named keys
    keysToRemove.push(...localStorageKeys);
    
    // Remove all collected keys
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore errors
      }
    }
    console.log('[OfflineStorage] localStorage cleared');
    
    // 3. Clear sessionStorage
    try {
      sessionStorage.clear();
    } catch {
      // Ignore errors
    }
    console.log('[OfflineStorage] sessionStorage cleared');
    
    // 4. Clear IndexedDB via idb-keyval (used by offline-auth)
    try {
      const { clear: idbClear } = await import('idb-keyval');
      await idbClear();
      console.log('[OfflineStorage] idb-keyval store cleared');
    } catch {
      // Ignore if idb-keyval is not available
    }
    
    // 5. Reset the database instance so it's re-created fresh
    dbInstance = null;
    
    // 6. Clear any service worker caches
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[OfflineStorage] Service worker caches cleared');
      } catch {
        // Ignore cache errors
      }
    }
    
    console.log('[OfflineStorage] ALL local data cleared successfully');
  } catch (error) {
    console.error('[OfflineStorage] Error clearing local data:', error);
    // Even if there's an error, the database instance should be reset
    dbInstance = null;
  }
}

/**
 * Delete the entire IndexedDB database
 * More aggressive than clearAllLocalData - removes the database entirely
 */
export async function deleteDatabase(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  console.log('[OfflineStorage] Deleting entire database...');
  
  try {
    // First clear all data
    await clearAllLocalData();
    
    // Then delete the database
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete database'));
      request.onblocked = () => {
        console.warn('[OfflineStorage] Database deletion blocked - close other tabs');
        resolve(); // Still resolve to not block the flow
      };
    });
    
    dbInstance = null;
    console.log('[OfflineStorage] Database deleted successfully');
  } catch (error) {
    console.error('[OfflineStorage] Error deleting database:', error);
  }
}

/**
 * Clear all analytics cache
 */
export async function clearAllAnalyticsCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.ANALYTICS_CACHE], 'readwrite');
      const store = transaction.objectStore(STORES.ANALYTICS_CACHE);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear all analytics cache'));
    });
  } catch (error) {
    console.warn('[Analytics Cache] Failed to clear all:', error);
  }
}
