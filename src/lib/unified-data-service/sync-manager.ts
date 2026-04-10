/**
 * Sync Manager
 * 
 * Manages the synchronization queue and handles background sync.
 * Implements retry logic with exponential backoff and conflict resolution.
 * 
 * @module lib/unified-data-service/sync-manager
 */

import type { 
  TableName, 
  SyncQueueItem, 
  SyncMetadata, 
  SyncStatus,
  DataOperation 
} from './types';
import { generateId, getDeviceId, timestamp, isOnline, canRetry } from './types';
import { ConflictResolver, resolveConflict } from './conflict-resolver';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const DB_NAME = 'progress-companion-sync';
const DB_VERSION = 2;
const STORE_NAME = 'sync-queue';
const META_STORE = 'sync-metadata';

const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 1000;
const MAX_SYNC_BATCH = 10;
// HIGH PRIORITY FIX: Timeout for items stuck in 'syncing' state (5 minutes)
const SYNCING_TIMEOUT_MS = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// Database Initialization
// ═══════════════════════════════════════════════════════════════

let dbInstance: IDBDatabase | null = null;

async function initDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return {} as IDBDatabase;
  }
  
  if (dbInstance) {
    return dbInstance;
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(new Error('Failed to open sync database'));
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('tableName', 'tableName', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('priority', 'priority', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'tableName' });
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// Payload Hash for Duplicate Detection
// ═══════════════════════════════════════════════════════════════

/**
 * P1 FIX: Generate a simple hash from payload for duplicate detection.
 * Uses a fast non-cryptographic hash (djb2) - suitable for dedup, not security.
 */
function hashPayload(payload: unknown): string {
  const str = JSON.stringify(payload);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16);
}

// ═══════════════════════════════════════════════════════════════
// Sync Manager Class
// ═══════════════════════════════════════════════════════════════

export class SyncManager {
  private isSyncing = false;
  private syncPromise: Promise<void> | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  
  /**
   * Add an operation to the sync queue
   * HIGH PRIORITY FIX: Check for duplicates before adding
   * P1 FIX: Also check payload hash to detect same content
   */
  async enqueue<T>(
    operation: DataOperation,
    tableName: TableName,
    recordId: string,
    payload: T,
    options?: { priority?: number; originalPayload?: T }
  ): Promise<SyncQueueItem<T>> {
    const db = await initDatabase();
    const now = timestamp();
    const payloadHash = hashPayload(payload);
    
    // HIGH PRIORITY FIX: Check for existing item with same recordId + operation + tableName
    // This prevents duplicate sync items for the same operation
    const existingItem = await this.findExistingItem(tableName, recordId, operation);
    
    if (existingItem) {
      // P1 FIX: Check if payload is identical (via hash) - skip update if same content
      const existingHash = hashPayload(existingItem.payload);
      if (existingHash === payloadHash && existingItem.status === 'pending') {
        console.log('[SyncManager] Duplicate payload detected, skipping enqueue:', { 
          tableName, 
          recordId, 
          operation,
          hash: payloadHash 
        });
        return existingItem as SyncQueueItem<T>;
      }
      
      // Update existing item with new payload
      console.log('[SyncManager] Found existing sync item, updating:', { 
        tableName, 
        recordId, 
        operation,
        existingId: existingItem.id 
      });
      
      const updatedItem: SyncQueueItem<T> = {
        ...existingItem,
        payload,
        originalPayload: options?.originalPayload,
        priority: Math.max(existingItem.priority, options?.priority ?? 0),
        updatedAt: now,
        status: 'pending', // Reset to pending since we're updating
        syncError: null, // Clear previous error
      };
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(updatedItem);
        
        request.onsuccess = () => {
          this.notifyListeners();
          resolve(updatedItem);
        };
        request.onerror = () => reject(new Error('Failed to update sync item'));
      });
    }
    
    // No existing item, create new one
    const item: SyncQueueItem<T> = {
      id: generateId(),
      operation,
      tableName,
      recordId,
      payload,
      originalPayload: options?.originalPayload,
      status: 'pending',
      syncAttempts: 0,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      lastSyncAttempt: null,
      syncError: null,
      priority: options?.priority ?? 0,
      deviceId: getDeviceId(),
      clientTimestamp: now,
      createdAt: now,
      updatedAt: now,
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(item);
      
      request.onsuccess = () => {
        this.notifyListeners();
        resolve(item);
      };
      request.onerror = () => reject(new Error('Failed to enqueue sync item'));
    });
  }
  
  /**
   * HIGH PRIORITY FIX: Find existing sync item to prevent duplicates
   */
  private async findExistingItem(
    tableName: TableName,
    recordId: string,
    operation: DataOperation
  ): Promise<SyncQueueItem | null> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result as SyncQueueItem[];
        const existing = items.find(item => 
          item.tableName === tableName &&
          item.recordId === recordId &&
          item.operation === operation &&
          (item.status === 'pending' || item.status === 'syncing' || item.status === 'failed')
        );
        resolve(existing || null);
      };
      request.onerror = () => reject(new Error('Failed to find existing item'));
    });
  }
  
  /**
   * Get all pending sync items
   */
  async getPending(): Promise<SyncQueueItem[]> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result as SyncQueueItem[];
        const pending = items
          .filter(item => item.status === 'pending' || item.status === 'failed')
          .filter(item => {
            const { allowed } = canRetry(
              item.lastSyncAttempt,
              item.syncAttempts,
              item.maxAttempts,
              BASE_RETRY_DELAY
            );
            return allowed;
          })
          .sort((a, b) => b.priority - a.priority || 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        resolve(pending);
      };
      request.onerror = () => reject(new Error('Failed to get pending items'));
    });
  }
  
  /**
   * Mark an item as syncing
   * HARDENED: Added state transition validation (STATE-001 FIX)
   */
  async markSyncing(id: string): Promise<void> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result as SyncQueueItem | undefined;
        if (!item) {
          reject(new Error('Item not found'));
          return;
        }
        
        // STATE-001 FIX: Validate state transition
        // Only allow transition from 'pending' state
        // Items in 'syncing' state may be stuck (handled by timeout recovery)
        // Items in 'synced' or 'failed' state should not be re-synced directly
        if (item.status === 'synced') {
          // Already synced, no need to re-sync
          resolve();
          return;
        }
        
        if (item.status === 'failed') {
          // Failed items should be reset to pending before retrying
          console.warn(`[SyncManager] Attempted to sync failed item ${id}. Reset to pending first.`);
          reject(new Error('Item is in failed state. Reset to pending before retrying.'));
          return;
        }
        
        // Check if item is stuck in syncing state (timeout recovery)
        if (item.status === 'syncing' && item.lastSyncAttempt) {
          const timeSinceLastAttempt = Date.now() - new Date(item.lastSyncAttempt).getTime();
          if (timeSinceLastAttempt < SYNCING_TIMEOUT_MS) {
            // Item is actively being synced by another process
            console.warn(`[SyncManager] Item ${id} is already being synced.`);
            reject(new Error('Item is already being synced'));
            return;
          }
          // Item is stuck, allow re-sync but log warning
          console.warn(`[SyncManager] Item ${id} was stuck in syncing state. Recovering.`);
        }
        
        item.status = 'syncing';
        item.lastSyncAttempt = timestamp();
        item.updatedAt = timestamp();
        
        store.put(item);
        resolve();
      };
      
      getRequest.onerror = () => reject(new Error('Failed to mark syncing'));
    });
  }
  
  /**
   * Mark an item as synced (successful)
   */
  async markSynced(id: string): Promise<void> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result as SyncQueueItem | undefined;
        if (!item) {
          resolve(); // Already removed
          return;
        }
        
        item.status = 'synced';
        item.updatedAt = timestamp();
        
        store.put(item);
        this.notifyListeners();
        resolve();
      };
      
      getRequest.onerror = () => reject(new Error('Failed to mark synced'));
    });
  }
  
  /**
   * Mark an item as failed
   */
  async markFailed(id: string, error: string): Promise<void> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result as SyncQueueItem | undefined;
        if (!item) {
          resolve();
          return;
        }
        
        item.status = item.syncAttempts >= item.maxAttempts ? 'failed' : 'pending';
        item.syncAttempts++;
        item.syncError = error;
        item.updatedAt = timestamp();
        
        store.put(item);
        this.notifyListeners();
        resolve();
      };
      
      getRequest.onerror = () => reject(new Error('Failed to mark failed'));
    });
  }
  
  /**
   * Mark an item as conflict
   */
  async markConflict<T>(
    id: string, 
    serverData: T,
    resolution: ReturnType<typeof resolveConflict>
  ): Promise<void> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result as SyncQueueItem<T> | undefined;
        if (!item) {
          resolve();
          return;
        }
        
        item.status = 'conflict';
        item.conflictData = serverData;
        item.resolution = resolution;
        item.updatedAt = timestamp();
        
        store.put(item);
        this.notifyListeners();
        resolve();
      };
      
      getRequest.onerror = () => reject(new Error('Failed to mark conflict'));
    });
  }
  
  /**
   * Remove an item from the queue
   */
  async remove(id: string): Promise<void> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => {
        this.notifyListeners();
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to remove item'));
    });
  }
  
  /**
   * Get sync statistics
   */
  async getStats(): Promise<{
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
    conflict: number;
    total: number;
  }> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result as SyncQueueItem[];
        
        const stats = {
          pending: 0,
          syncing: 0,
          synced: 0,
          failed: 0,
          conflict: 0,
          total: items.length,
        };
        
        for (const item of items) {
          stats[item.status as keyof typeof stats]++;
        }
        
        resolve(stats);
      };
      
      request.onerror = () => reject(new Error('Failed to get stats'));
    });
  }
  
  /**
   * Get sync metadata for a table
   */
  async getMetadata(tableName: TableName): Promise<SyncMetadata | null> {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([META_STORE], 'readonly');
      const store = transaction.objectStore(META_STORE);
      const request = store.get(tableName);
      
      request.onsuccess = () => resolve(request.result as SyncMetadata | null);
      request.onerror = () => reject(new Error('Failed to get metadata'));
    });
  }
  
  /**
   * Update sync metadata for a table
   */
  async updateMetadata(tableName: TableName, updates: Partial<SyncMetadata>): Promise<void> {
    const db = await initDatabase();
    
    return new Promise(async (resolve, reject) => {
      const transaction = db.transaction([META_STORE], 'readwrite');
      const store = transaction.objectStore(META_STORE);
      
      const existing = await this.getMetadata(tableName);
      
      const metadata: SyncMetadata = {
        tableName,
        lastSyncAt: null,
        lastSyncCursor: null,
        totalRecords: 0,
        lastRecordId: null,
        pendingConflicts: 0,
        resolvedConflicts: 0,
        ...existing,
        ...updates,
      };
      
      const request = store.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to update metadata'));
    });
  }
  
  /**
   * Subscribe to sync status changes
   */
  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  /**
   * Notify all listeners of status change
   */
  private async notifyListeners(): Promise<void> {
    const stats = await this.getStats();
    const status: SyncStatus = 'pending'; // Simplified for now
    
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    }
  }
  
  /**
   * Clear all synced items older than specified days
   */
  async cleanupOldSynced(daysToKeep = 7): Promise<number> {
    const db = await initDatabase();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      let removed = 0;
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const item = cursor.value as SyncQueueItem;
          if (item.status === 'synced' && new Date(item.updatedAt) < cutoff) {
            cursor.delete();
            removed++;
          }
          cursor.continue();
        } else {
          resolve(removed);
        }
      };
      
      request.onerror = () => reject(new Error('Failed to cleanup'));
    });
  }
  
  /**
   * HIGH PRIORITY FIX: Reset items stuck in 'syncing' state
   * Items that have been in 'syncing' state for more than SYNCING_TIMEOUT_MS
   * are considered stuck and should be reset to 'pending' for retry
   */
  async resetStuckSyncingItems(): Promise<number> {
    const db = await initDatabase();
    const now = Date.now();
    const timeoutCutoff = new Date(now - SYNCING_TIMEOUT_MS);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      let reset = 0;
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const item = cursor.value as SyncQueueItem;
          
          // Check if item is stuck in syncing state
          if (item.status === 'syncing') {
            const lastAttempt = item.lastSyncAttempt ? new Date(item.lastSyncAttempt) : new Date(item.updatedAt);
            
            if (lastAttempt < timeoutCutoff) {
              console.log('[SyncManager] Resetting stuck syncing item:', {
                id: item.id,
                tableName: item.tableName,
                recordId: item.recordId,
                stuckFor: Math.round((now - lastAttempt.getTime()) / 1000 / 60) + ' minutes'
              });
              
              // Reset to pending for retry
              item.status = 'pending';
              item.syncAttempts = (item.syncAttempts || 0) + 1;
              item.syncError = 'Sync timeout - item was stuck in syncing state';
              item.updatedAt = timestamp();
              
              cursor.update(item);
              reset++;
            }
          }
          cursor.continue();
        } else {
          if (reset > 0) {
            console.log('[SyncManager] Reset', reset, 'stuck syncing items');
            this.notifyListeners();
          }
          resolve(reset);
        }
      };
      
      request.onerror = () => reject(new Error('Failed to reset stuck items'));
    });
  }
}

// Export singleton instance
export const syncManager = new SyncManager();
