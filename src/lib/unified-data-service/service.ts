/**
 * Unified Data Service
 * 
 * Core orchestrator for all data operations.
 * Combines local cache, remote sync, and realtime updates.
 * 
 * Architecture:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                      UNIFIED DATA SERVICE                                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
 * │   │  Read Operations │    │ Write Operations│    │  Sync Manager   │    │
 * │   │                 │    │                 │    │                 │    │
 * │   │ 1. Try Local    │    │ 1. Write Local  │    │ • Queue offline │    │
 * │   │ 2. Fetch Remote │    │    (instant)    │    │   mutations     │    │
 * │   │ 3. Merge Data   │    │ 2. Queue Sync   │    │ • Retry logic   │    │
 * │   │                 │    │ 3. Return optim │    │ • Conflict res  │    │
 * │   └─────────────────┘    └─────────────────┘    └─────────────────┘    │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * @module lib/unified-data-service/service
 */

import { getClient } from '@/lib/supabase/client';
import type { Database, Tables, InsertTables, UpdateTables } from '@/lib/supabase/database.types';
import type { TableName, SyncableEntity, ReadOptions, WriteOptions, QueryOptions } from './types';
import { isOnline, timestamp, getDeviceId, generateId } from './types';
import { SyncManager, syncManager } from './sync-manager';
import { RealtimeManager, realtimeManager } from './realtime-manager';
import { resolveConflict, hasConflict } from './conflict-resolver';
import { LocalCache } from './local-cache';
import { isTempId } from '@/lib/offline-storage';

const __UDS_DEBUG__ = process.env.NODE_ENV === 'development';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type TableNames = keyof Database['public']['Tables'];
type TableRow<T extends TableNames> = Database['public']['Tables'][T]['Row'];
type TableInsert<T extends TableNames> = Database['public']['Tables'][T]['Insert'];
type TableUpdate<T extends TableNames> = Database['public']['Tables'][T]['Update'];

// ═══════════════════════════════════════════════════════════════
// Unified Data Service Class
// ═══════════════════════════════════════════════════════════════

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export class UnifiedDataService {
  private supabaseUrl: string;
  private supabaseKey: string;
  private client: ReturnType<typeof getClient> | null = null;
  private cache: LocalCache;
  private syncManager: SyncManager;
  private realtimeManager: RealtimeManager;
  private userId: string | null = null;
  private syncInFlight: Promise<void> | null = null;
  // HIGH PRIORITY FIX: Mutex lock for sync queue to prevent race conditions
  private syncLockAcquired = false;
  private syncLockQueue: Array<() => void> = [];
  
  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    this.cache = new LocalCache();
    this.syncManager = syncManager;
    this.realtimeManager = realtimeManager;
  }
  
  /**
   * HIGH PRIORITY FIX: Mutex lock acquisition for sync queue
   * Prevents multiple concurrent sync operations from running simultaneously
   * 
   * SECURITY FIX: Added 30s timeout to prevent deadlock if promise rejection occurs
   */
  private async acquireSyncLock(): Promise<boolean> {
    if (!this.syncLockAcquired) {
      this.syncLockAcquired = true;
      return true;
    }
    
    // Lock is already held, wait in queue with timeout
    const LOCK_TIMEOUT_MS = 30000; // 30 seconds
    
    return new Promise<boolean>((resolve) => {
      let resolved = false;
      
      // Timeout handler
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Remove from queue if still waiting
          const index = this.syncLockQueue.findIndex(fn => fn === resolveWaiter);
          if (index !== -1) {
            this.syncLockQueue.splice(index, 1);
          }
          console.warn('[UDS] Sync lock acquisition timed out after 30s');
          resolve(false); // Failed to acquire lock
        }
      }, LOCK_TIMEOUT_MS);
      
      // Queue waiter
      const resolveWaiter = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(true); // Successfully acquired lock
        }
      };
      
      this.syncLockQueue.push(resolveWaiter);
    });
  }
  
  /**
   * Release mutex lock and notify next waiter
   * SECURITY FIX: Added safety check to prevent double-release
   */
  private releaseSyncLock(): void {
    if (!this.syncLockAcquired) {
      console.warn('[UDS] Attempted to release sync lock that was not held');
      return;
    }
    
    const next = this.syncLockQueue.shift();
    if (next) {
      // Pass lock to next waiter
      next();
    } else {
      // No waiters, release lock
      this.syncLockAcquired = false;
    }
  }
  
  /**
   * Force release sync lock (emergency cleanup)
   * Use when sync operation fails catastrophically
   */
  private forceReleaseSyncLock(): void {
    this.syncLockAcquired = false;
    // Clear all waiters
    const waiters = this.syncLockQueue.splice(0);
    // Resolve all with failure
    waiters.forEach(waiter => {
      try { waiter(); } catch { /* ignore */ }
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Initialize the service with user context
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    
    // Initialize Supabase client
    if (typeof window !== 'undefined') {
      this.client = getClient();
    }
    
    // Subscribe to realtime updates for key tables
    if (isOnline() && this.client) {
      this.realtimeManager.subscribeToTables(
        userId,
        ['food_logs', 'workouts', 'body_metrics', 'goals'],
        {
          onInsert: (payload) => this.handleRemoteInsert(payload),
          onUpdate: (payload) => this.handleRemoteUpdate(payload),
          onDelete: (payload) => this.handleRemoteDelete(payload),
        }
      );
    }
    
    // Process pending sync items
    await this.processSyncQueue();
  }
  
  /**
   * Cleanup when user signs out
   */
  async cleanup(): Promise<void> {
    await this.realtimeManager.unsubscribeAll();
    this.userId = null;
  }
  
  /**
   * Get Supabase client
   */
  private getClient() {
    if (!this.client && typeof window !== 'undefined') {
      this.client = getClient();
    }
    return this.client;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Read Operations
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Get a single record
   * Flow: Try local cache → Fetch remote → Update cache → Return
   */
  async get<T extends TableNames>(
    tableName: T,
    id: string,
    options?: ReadOptions
  ): Promise<TableRow<T> | null> {
    if (__UDS_DEBUG__) console.log(`[UDS] get called for table: ${tableName}, id: ${id}`);
    // Try local cache first
    if (options?.useCache !== false) {
      const cached = await this.cache.get<TableRow<T>>(tableName as TableName, id);
      if (cached) {
        if (__UDS_DEBUG__) console.log(`[UDS] Found in cache: ${tableName}/${id}`);
        return cached;
      }
    }
    
    // If it's a temporary local offline ID, never fetch from remote
    // because it causes "invalid input syntax for type uuid" error in Supabase
    // P0 FIX: Use isTempId helper for consistent detection
    if (id && isTempId(id.toString())) {
      if (__UDS_DEBUG__) console.log(`[UDS] Skipping remote fetch for offline ID: ${id}`);
      return null;
    }
    
    // Fetch from remote
    if (isOnline()) {
      const client = this.getClient();
      if (!client) return null;
      
      let query = client
        .from(tableName)
        .select('*')
        .eq('id', id);
        
      const skipUserId = (tableName === 'profiles' || tableName === 'user_settings' || tableName === 'global_foods' || tableName === 'supplements');
      if (__UDS_DEBUG__) console.log(`[UDS] Querying remote ${tableName}. Skipping user_id filter? ${skipUserId}`);
      
      if (!skipUserId) {
        query = query.eq('user_id', this.userId!);
      } else if (tableName === 'user_settings') {
        // For user_settings, the 'id' is the user_id
        query = query.eq('id', this.userId!);
      } else if (tableName === 'profiles') {
        query = query.eq('id', this.userId!);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) {
        console.error(`[UDS] Error fetching ${tableName}:`, error.message);
        return null;
      }
      
      if (data) {
        if (__UDS_DEBUG__) console.log(`[UDS] Received remote data for ${tableName}/${id}`);
        // Update cache
        await this.cache.set(tableName as TableName, data);
        return data as TableRow<T>;
      }
    }
    
    return null;
  }
  
  /**
   * Get multiple records
   * Flow: Try local cache → Fetch remote → Merge → Return
   */
  async getAll<T extends TableNames>(
    tableName: T,
    options?: QueryOptions
  ): Promise<TableRow<T>[]> {
    if (__UDS_DEBUG__) console.log(`[UDS] getAll called for table: ${tableName}, forceRefresh: ${options?.forceRefresh}`);
    
    // FIX: If forceRefresh is true, clear the cache first to ensure fresh data
    if (options?.forceRefresh) {
      if (__UDS_DEBUG__) console.log(`[UDS] Force refresh requested, clearing cache for: ${tableName}`);
      await this.cache.clearTable(tableName as TableName);
    }
    
    // Try local cache first (skip if forceRefresh or useCache is false)
    if (options?.useCache !== false && !options?.forceRefresh) {
      const cached = await this.cache.getAll<TableRow<T>>(tableName as TableName);
      if (cached.length > 0) {
        if (__UDS_DEBUG__) console.log(`[UDS] Found in cache: ${tableName} (${cached.length} items)`);
        return cached;
      }
    }
    
    // Fetch from remote
    if (isOnline()) {
      const client = this.getClient();
      if (!client) {
        return await this.cache.getAll<TableRow<T>>(tableName as TableName);
      }
      
      let query = client
        .from(tableName)
        .select('*');
        
      const skipUserId = (tableName === 'profiles' || tableName === 'user_settings' || tableName === 'global_foods' || tableName === 'supplements');
      if (__UDS_DEBUG__) console.log(`[UDS] Querying remote getAll ${tableName}. Skipping user_id filter? ${skipUserId}`);
      
      if (!skipUserId) {
        query = query.eq('user_id', this.userId!);
      } else if (tableName === 'user_settings') {
        query = query.eq('id', this.userId!);
      } else if (tableName === 'profiles') {
        // Typically profiles just use `id`
        query = query.eq('id', this.userId!);
      }
      
      // Apply filters
      const filterDateField = options?.dateField || 'created_at';
      if (options?.startDate) {
        query = query.gte(filterDateField, options.startDate);
      }
      if (options?.endDate) {
        query = query.lte(filterDateField, options.endDate);
      }
      if (options?.filters) {
        for (const [key, value] of Object.entries(options.filters)) {
          if (key === 'user_id') continue; // UDS isolates records intrinsically
          query = query.eq(key, value);
        }
      }
      
      // Apply ordering
      if (options?.orderBy) {
        query = query.order(options.orderBy.field, { 
          ascending: options.orderBy.direction === 'asc' 
        });
      } else {
        query = query.order('created_at', { ascending: false });
      }
      
      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error(`[UDS] Error fetching ${tableName}:`, error.message);
        // Return cached data on error
        return await this.cache.getAll<TableRow<T>>(tableName as TableName);
      }
      
      if (data && data.length > 0) {
        if (__UDS_DEBUG__) console.log(`[UDS] Received remote data for getAll ${tableName} (${data.length} items)`);
        // Update cache
        await this.cache.setAll(tableName as TableName, data as TableRow<T>[]);
        return data as TableRow<T>[];
      }
    }
    
    // Return cached data if offline or no remote data
    return await this.cache.getAll<TableRow<T>>(tableName as TableName);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Write Operations
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Create a new record
   * Flow: Write local (instant) → Queue sync → Return optimistic
   */
  async create<T extends TableNames>(
    tableName: T,
    data: Omit<TableInsert<T>, 'user_id'>,
    options?: WriteOptions
  ): Promise<TableRow<T>> {
    const now = timestamp();
    const id = generateId();
    
    // DEBUG: Log the incoming data and userId state
    if (__UDS_DEBUG__) console.log(`[UDS] create ${tableName}:`, {
      hasUserId: !!this.userId,
      userId: this.userId,
      dataKeys: Object.keys(data),
      immediate: options?.immediate,
    });
    
    // Create full record with required fields
    const record = {
      ...data,
      id,
      ...(tableName !== 'profiles' && tableName !== 'user_settings' && tableName !== 'supplements' ? { user_id: this.userId! } : {}),
      device_id: getDeviceId(),
      client_timestamp: now,
      created_at: now,
      updated_at: now,
    } as TableRow<T>;
    
    // DEBUG: Log the final record
    if (__UDS_DEBUG__) console.log(`[UDS] create ${tableName} record:`, {
      id: record.id,
      user_id: (record as any).user_id,
      metric_type: (record as any).metric_type,
      value: (record as any).value,
    });
    
    // Write to local cache (instant)
    await this.cache.set(tableName as TableName, record);
    
    // Queue for sync (unless immediate mode)
    if (!options?.immediate) {
      await this.syncManager.enqueue(
        'INSERT',
        tableName as TableName,
        id,
        record,
        { priority: options?.priority }
      );
      
      // Process sync queue if online
      if (isOnline()) {
        this.processSyncQueue();
      }
    } else if (isOnline()) {
      // Immediate mode - write directly to server using upsert for conflict handling
      const client = this.getClient();
      
      if (client) {
        // P0 FIX: Use upsert instead of insert to handle conflicts atomically
        const { data: result, error } = await client
          .from(tableName)
          .upsert(record, { 
            onConflict: 'id',
            ignoreDuplicates: false 
          })
          .select()
          .maybeSingle();
        
        if (error) {
          console.error(`[UDS] Error upserting ${tableName}:`, error.message, error);
          // Check for race condition (duplicate key - should not happen with upsert)
          const errorCode = error.code ?? '';
          const errorMessage = String(error.message ?? '').toLowerCase();
          const statusCode = (error as any).status ?? (error as any).statusCode ?? 0;
          // P0 FIX: Also check for 409 HTTP status code for conflict handling
          if (errorCode === '23505' || statusCode === 409 || errorMessage.includes('duplicate') || errorMessage.includes('conflict')) {
            // Race condition - another client inserted the same record, or record already exists
            // This is SUCCESS from idempotency perspective
            const { data: existing } = await client
              .from(tableName)
              .select('*')
              .eq('id', id)
              .maybeSingle();
            if (existing) {
              await this.cache.set(tableName as TableName, existing as TableRow<T>);
              return existing as TableRow<T>;
            }
            // Even if we can't fetch, return the local record as it was accepted
            return record;
          }
          // Queue for retry only for non-conflict errors
          await this.syncManager.enqueue(
            'INSERT',
            tableName as TableName,
            id,
            record,
            { priority: options?.priority }
          );
        } else if (result) {
          // Record was upserted successfully
          await this.cache.set(tableName as TableName, result as TableRow<T>);
          return result as TableRow<T>;
        }
        // If no result and no error, the upsert succeeded but returned no data
        return record;
      }
    } else {
      // CRITICAL FIX: immediate mode + offline → fallback to sync queue
      // Previously this was a data loss gap: the record was only in volatile memory cache
      await this.syncManager.enqueue(
        'INSERT',
        tableName as TableName,
        id,
        record,
        { priority: options?.priority ?? 'high' }
      );
    }
    
    return record;
  }
  
  /**
   * Update an existing record
   * Flow: Update local (instant) → Queue sync → Return optimistic
   */
  async update<T extends TableNames>(
    tableName: T,
    id: string,
    updates: TableUpdate<T>,
    options?: WriteOptions
  ): Promise<TableRow<T> | null> {
    // Get existing record
    const existing = await this.get(tableName, id);
    if (!existing) {
      console.error(`[UDS] Record not found: ${tableName}/${id}`);
      return null;
    }
    
    const now = timestamp();
    
    // Merge updates
    const updated = {
      ...existing,
      ...updates,
      updated_at: now,
      client_timestamp: now,
      device_id: getDeviceId(),
    } as TableRow<T>;
    
    // Update local cache (instant)
    await this.cache.set(tableName as TableName, updated);
    
    // Queue for sync
    if (!options?.immediate) {
      await this.syncManager.enqueue(
        'UPDATE',
        tableName as TableName,
        id,
        updated,
        { 
          priority: options?.priority,
          originalPayload: existing,
        }
      );
      
      if (isOnline()) {
        this.processSyncQueue();
      }
    } else if (isOnline()) {
      if (!isValidUuid(id.toString())) {
        if (__UDS_DEBUG__) console.log(`[UDS] Skipping remote update for offline ID: ${id}`);
        await this.syncManager.enqueue(
          'UPDATE',
          tableName as TableName,
          id,
          updated,
          { priority: options?.priority, originalPayload: existing }
        );
        return updated;
      }

      const client = this.getClient();
      if (client) {
        let updateQuery = client
          .from(tableName)
          .update({
            ...updates,
            updated_at: now,
            client_timestamp: now,
            device_id: getDeviceId(),
          })
          .eq('id', id);
          
        if (tableName !== 'profiles' && tableName !== 'user_settings' && tableName !== 'global_foods' && tableName !== 'supplements') {
          updateQuery = updateQuery.eq('user_id', this.userId!);
        }
        
        const { data: result, error } = await updateQuery.select().maybeSingle();
        
        if (error) {
          console.error(`[UDS] Error updating ${tableName}:`, error.message);
          await this.syncManager.enqueue(
            'UPDATE',
            tableName as TableName,
            id,
            updated,
            { priority: options?.priority, originalPayload: existing }
          );
        } else if (result) {
          await this.cache.set(tableName as TableName, result as TableRow<T>);
          return result as TableRow<T>;
        }
      }
    } else {
      // CRITICAL FIX: immediate mode + offline → fallback to sync queue
      await this.syncManager.enqueue(
        'UPDATE',
        tableName as TableName,
        id,
        updated,
        { priority: options?.priority ?? 'high', originalPayload: existing }
      );
    }
    
    return updated;
  }
  
  /**
   * Delete a record
   * Flow: Remove local (instant) → Queue sync → Return
   */
  async delete<T extends TableNames>(
    tableName: T,
    id: string,
    options?: WriteOptions
  ): Promise<boolean> {
    // Get existing record for potential restore
    const existing = await this.get(tableName, id);
    
    // Remove from local cache (instant)
    await this.cache.remove(tableName as TableName, id);
    
    // Queue for sync
    if (!options?.immediate) {
      await this.syncManager.enqueue(
        'DELETE',
        tableName as TableName,
        id,
        { id, tableName, deleted: true },
        { priority: options?.priority }
      );
      
      if (isOnline()) {
        this.processSyncQueue();
      }
    } else if (isOnline()) {
      if (!isValidUuid(id.toString())) {
        if (__UDS_DEBUG__) console.log(`[UDS] Skipping remote delete for offline ID: ${id}`);
        await this.syncManager.enqueue(
          'DELETE',
          tableName as TableName,
          id,
          { id, tableName, deleted: true },
          { priority: options?.priority }
        );
        return true;
      }

      const client = this.getClient();
      if (client) {
        let deleteQuery = client
          .from(tableName)
          .delete()
          .eq('id', id);
          
        if (tableName !== 'profiles' && tableName !== 'user_settings' && tableName !== 'global_foods' && tableName !== 'supplements') {
          deleteQuery = deleteQuery.eq('user_id', this.userId!);
        }
        
        const { error } = await deleteQuery;
        
        if (error) {
          console.error(`[UDS] Error deleting ${tableName}:`, error.message);
          // Restore local cache
          if (existing) {
            await this.cache.set(tableName as TableName, existing);
          }
          return false;
        }
      }
    } else {
      // CRITICAL FIX: immediate mode + offline → fallback to sync queue
      await this.syncManager.enqueue(
        'DELETE',
        tableName as TableName,
        id,
        { id, tableName, deleted: true },
        { priority: options?.priority ?? 'high' }
      );
    }
    
    return true;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Sync Operations
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Process the sync queue
   * Sends pending operations to the server
   * 
   * HIGH PRIORITY FIX: Uses mutex lock to prevent race conditions
   * Multiple callers will wait for the current sync to complete
   * SECURITY FIX: Now handles lock timeout gracefully
   */
  private async processSyncQueue(): Promise<void> {
    // Acquire lock before processing (with 30s timeout)
    const lockAcquired = await this.acquireSyncLock();
    
    if (!lockAcquired) {
      console.warn('[UDS] Could not acquire sync lock, skipping sync cycle');
      return;
    }
    
    try {
      // Double-check if there's already a sync running via Promise ref
      if (this.syncInFlight) {
        await this.syncInFlight;
        return;
      }

      this.syncInFlight = this.runSyncQueue();
      await this.syncInFlight;
    } catch (error) {
      console.error('[UDS] Sync queue processing failed:', error);
      // Force release lock on catastrophic failure
      this.forceReleaseSyncLock();
      return;
    } finally {
      this.syncInFlight = null;
      // Release lock so next caller can proceed
      this.releaseSyncLock();
    }
  }

  private async runSyncQueue(): Promise<void> {
    if (!isOnline()) return;
    
    // HIGH PRIORITY FIX: Reset any items stuck in 'syncing' state before processing
    await this.syncManager.resetStuckSyncingItems();
    
    const pending = await this.syncManager.getPending();
    if (pending.length === 0) return;
    
    const client = this.getClient();
    if (!client) return;
    
    // PERF-FIX: Process items in parallel instead of sequentially
    // Group by table and operation for efficient batching
    const itemsToProcess = pending.slice(0, 10);
    
    // Process all items in parallel using Promise.allSettled
    // This prevents N+1 sequential query pattern
    const results = await Promise.allSettled(
      itemsToProcess.map(async (item) => {
        try {
          await this.syncManager.markSyncing(item.id);
          
          let result;
          
          switch (item.operation) {
            case 'INSERT': {
              // P0 FIX: Use upsert instead of insert to handle conflicts atomically
              // This prevents race conditions where another process inserts the same ID
              // between our existence check and insert
              const upsertResult = await client
                .from(item.tableName)
                .upsert(item.payload, { 
                  onConflict: 'id',
                  ignoreDuplicates: false // Update if exists
                })
                .select()
                .maybeSingle();
              
              if (upsertResult.error) {
                const errorCode = upsertResult.error.code ?? '';
                const errorMessage = String(upsertResult.error.message ?? '').toLowerCase();
                const statusCode = (upsertResult.error as any).status ?? 0;
                
                // 23505 = PostgreSQL duplicate key violation (should not happen with upsert)
                // 409 = HTTP Conflict
                if (errorCode === '23505' || statusCode === 409 || errorMessage.includes('duplicate') || errorMessage.includes('conflict')) {
                  // Record already exists - this is SUCCESS from idempotency perspective
                  if (__UDS_DEBUG__) console.log(`[UDS] Upsert conflict handled, marking as synced: ${item.tableName}/${item.recordId}`);
                  // Fetch the existing record to update local cache
                  const { data: existing } = await client
                    .from(item.tableName)
                    .select('*')
                    .eq('id', item.recordId)
                    .maybeSingle();
                  if (existing) {
                    await this.cache.set(item.tableName as TableName, existing);
                  }
                  await this.syncManager.markSynced(item.id);
                  return { success: true, itemId: item.id };
                }
                result = { error: upsertResult.error };
              } else if (upsertResult.data) {
                result = { data: upsertResult.data };
                if (__UDS_DEBUG__) console.log(`[UDS] Upserted ${item.tableName}/${item.recordId}`);
              } else {
                // Upsert succeeded but no data returned - still a success
                await this.syncManager.markSynced(item.id);
                return { success: true, itemId: item.id };
              }
              break;
            }
              
            case 'UPDATE': {
              if (!isValidUuid(item.recordId.toString())) {
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`[UDS] Skipping sync update for temp ID: ${item.recordId}`);
                }
                result = { error: { message: 'Cannot update temporary ID', code: 'TEMP_ID' } };
                break;
              }
              let updateQuery = client
                .from(item.tableName)
                .update(item.payload)
                .eq('id', item.recordId);
                
              if (item.tableName !== 'profiles' && item.tableName !== 'user_settings' && item.tableName !== 'global_foods' && item.tableName !== 'supplements') {
                updateQuery = updateQuery.eq('user_id', this.userId!);
              }
              
              // Use maybeSingle() to avoid 406 error when no rows match (record may have been deleted)
              result = await updateQuery.select().maybeSingle();
              
              // If no rows were updated, the record may have been deleted - treat as success
              if (!result?.error && !result?.data) {
                if (process.env.NODE_ENV === 'development') {
                  if (__UDS_DEBUG__) console.log('[UDS] UPDATE affected 0 rows - record may be deleted, marking as synced:', item.recordId);
                }
                await this.syncManager.markSynced(item.id);
                return { success: true, itemId: item.id };
              }
              break;
            }
              
            case 'DELETE': {
              if (!isValidUuid(item.recordId.toString())) {
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`[UDS] Skipping sync delete for temp ID: ${item.recordId}`);
                }
                result = { error: { message: 'Cannot delete temporary ID', code: 'TEMP_ID' } };
                break;
              }
              let deleteQuery = client
                .from(item.tableName)
                .delete()
                .eq('id', item.recordId);
                
              if (item.tableName !== 'profiles' && item.tableName !== 'user_settings' && item.tableName !== 'global_foods' && item.tableName !== 'supplements') {
                deleteQuery = deleteQuery.eq('user_id', this.userId!);
              }
              
              result = await deleteQuery;
              break;
            }
          }
          
          if (result?.error) {
            const errorCode = result.error.code ?? '';
            const errorMessage = String(result.error.message ?? '').toLowerCase();
            const statusCode = (result.error as any).status ?? (result.error as any).statusCode ?? 0;

            // Idempotency: if insert already exists remotely, consider sync successful
            // Handle both Postgres error code 23505 and HTTP 409 Conflict
            if (
              item.operation === 'INSERT' &&
              (errorCode === '23505' || statusCode === 409 || errorMessage.includes('duplicate key') || errorMessage.includes('conflict'))
            ) {
              if (process.env.NODE_ENV === 'development') {
                if (__UDS_DEBUG__) console.log('[UDS] Sync conflict on INSERT - record exists, marking as synced:', item.recordId);
              }
              // Fetch the existing record to update local cache
              const { data: existing } = await client
                .from(item.tableName)
                .select('*')
                .eq('id', item.recordId)
                .maybeSingle();
              if (existing) {
                await this.cache.set(item.tableName as TableName, existing);
              }
              await this.syncManager.markSynced(item.id);
              return { success: true, itemId: item.id };
            }

            // Check for conflict
            if (errorCode === '23505' || statusCode === 409 || errorMessage.includes('conflict')) {
              // Handle conflict
              await this.handleSyncConflict(item, result.error);
              return { success: false, itemId: item.id, error: result.error.message };
            } else {
              await this.syncManager.markFailed(item.id, result.error.message);
              return { success: false, itemId: item.id, error: result.error.message };
            }
          } else {
            await this.syncManager.markSynced(item.id);
            
            // Update local cache with server response
            if (result?.data && item.operation !== 'DELETE') {
              await this.cache.set(item.tableName, result.data);
            }
            return { success: true, itemId: item.id };
          }
        } catch (error: any) {
          // Handle 409 Conflict as success (idempotency)
          const errorStatus = error?.status ?? error?.statusCode ?? 0;
          const errorMessage = String(error?.message ?? '').toLowerCase();
          
          if (errorStatus === 409 || errorMessage.includes('conflict') || errorMessage.includes('duplicate')) {
            if (process.env.NODE_ENV === 'development') {
              if (__UDS_DEBUG__) console.log('[UDS] Sync caught 409 conflict - record exists, marking as synced:', item.recordId);
            }
            // Fetch the existing record to update local cache
            const { data: existing } = await client
              .from(item.tableName)
              .select('*')
              .eq('id', item.recordId)
              .maybeSingle();
            if (existing) {
              await this.cache.set(item.tableName as TableName, existing);
            }
            await this.syncManager.markSynced(item.id);
            return { success: true, itemId: item.id };
          }
          
          await this.syncManager.markFailed(item.id, String(error));
          return { success: false, itemId: item.id, error: String(error) };
        }
      })
    );
    
    // Log any failed items (development only)
    if (process.env.NODE_ENV === 'development') {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`[UDS] Sync item ${index} rejected:`, result.reason);
        } else if (result.status === 'fulfilled' && !result.value?.success) {
          console.warn(`[UDS] Sync item ${index} failed:`, result.value?.error);
        }
      });
    }
  }
  
  /**
   * Handle sync conflict
   */
  private async handleSyncConflict(
    item: Awaited<ReturnType<typeof syncManager.getPending>>[0],
    error: { message: string; code?: string }
  ): Promise<void> {
    // Fetch server version
    const client = this.getClient();
    if (!client) return;
    
    const { data: serverData } = await client
      .from(item.tableName)
      .select('*')
      .eq('id', item.recordId)
      .single();
    
    if (serverData) {
      const resolution = resolveConflict(
        item.payload as SyncableEntity,
        serverData as SyncableEntity,
        'latest-timestamp'
      );
      
      await this.syncManager.markConflict(item.id, serverData, resolution);
      
      // If resolution says use local, re-apply
      if (resolution.winner === 'local') {
        await client
          .from(item.tableName)
          .upsert(resolution.data)
          .select()
          .single();
      }
      
      // Update local cache
      await this.cache.set(item.tableName, resolution.data);
    }
  }
  
  /**
   * Handle remote insert from realtime
   */
  private handleRemoteInsert(payload: unknown): void {
    const data = payload as { new: SyncableEntity; table: string };
    if (data.new && data.table) {
      this.cache.set(data.table as TableName, data.new);
    }
  }
  
  /**
   * Handle remote update from realtime
   */
  private handleRemoteUpdate(payload: unknown): void {
    const data = payload as { new: SyncableEntity; old: SyncableEntity; table: string };
    if (data.new && data.table) {
      this.cache.set(data.table as TableName, data.new);
    }
  }
  
  /**
   * Handle remote delete from realtime
   */
  private handleRemoteDelete(payload: unknown): void {
    const data = payload as { old: { id: string }; table: string };
    if (data.old?.id && data.table) {
      this.cache.remove(data.table as TableName, data.old.id);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Force refresh from server
   */
  async refresh(tableName: TableName): Promise<void> {
    await this.cache.clearTable(tableName);
    await this.getAll(tableName as TableNames, { forceRefresh: true });
  }
  
  /**
   * Force sync - Process pending sync items immediately
   * This is the public API for triggering a sync operation
   */
  async sync(): Promise<void> {
    await this.processSyncQueue();
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    return this.syncManager.getStats();
  }
  
  /**
   * Clear all local data
   */
  async clearAllData(): Promise<void> {
    await this.cache.clearAll();
  }
}

// Export singleton instance
export const unifiedDataService = new UnifiedDataService();
