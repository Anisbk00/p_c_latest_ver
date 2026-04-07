/**
 * Conflict Resolver
 * 
 * Handles conflict resolution between local and server data.
 * Implements last-write-wins with timestamp comparison.
 * 
 * @module lib/unified-data-service/conflict-resolver
 */

import type { ConflictStrategy, ConflictResolution } from './types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/**
 * Entity with conflict tracking fields
 */
interface ConflictTrackable {
  id: string;
  updated_at: string;
  client_timestamp?: string | null;
  device_id?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Conflict Resolution Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a conflict between local and server data
 * 
 * Resolution strategies:
 * - server-wins: Always use server data
 * - client-wins: Always use local data
 * - latest-timestamp: Use whichever was modified more recently
 * - merge: Attempt to merge non-conflicting fields (advanced)
 */
export function resolveConflict<T extends ConflictTrackable>(
  local: T,
  server: T,
  strategy: ConflictStrategy = 'latest-timestamp'
): ConflictResolution<T> {
  switch (strategy) {
    case 'server-wins':
      return {
        winner: 'server',
        data: server,
        reason: 'Server-wins strategy applied',
        strategy,
      };
    
    case 'client-wins':
      return {
        winner: 'local',
        data: local,
        reason: 'Client-wins strategy applied',
        strategy,
      };
    
    case 'latest-timestamp':
    default:
      return resolveByTimestamp(local, server);
  }
}

/**
 * Resolve conflict by comparing timestamps
 * Priority: client_timestamp > updated_at
 */
function resolveByTimestamp<T extends ConflictTrackable>(
  local: T,
  server: T
): ConflictResolution<T> {
  // Use client_timestamp if available, fall back to updated_at
  const localTime = local.client_timestamp 
    ? new Date(local.client_timestamp).getTime()
    : new Date(local.updated_at).getTime();
  
  const serverTime = server.client_timestamp
    ? new Date(server.client_timestamp).getTime()
    : new Date(server.updated_at).getTime();
  
  // If local is newer
  if (localTime > serverTime) {
    return {
      winner: 'local',
      data: local,
      reason: `Local is more recent (${localTime} > ${serverTime})`,
      strategy: 'latest-timestamp',
    };
  }
  
  // If server is newer
  if (serverTime > localTime) {
    return {
      winner: 'server',
      data: server,
      reason: `Server is more recent (${serverTime} > ${localTime})`,
      strategy: 'latest-timestamp',
    };
  }
  
  // Exact same timestamp - prefer server (source of truth)
  return {
    winner: 'server',
    data: server,
    reason: 'Same timestamp, server preferred as source of truth',
    strategy: 'latest-timestamp',
  };
}

/**
 * Check if two records are conflicting
 * A conflict exists when:
 * 1. Both records have been modified after the last sync
 * 2. The modifications were made on different devices
 */
export function hasConflict<T extends ConflictTrackable>(
  local: T,
  server: T,
  lastSyncTime: string | null
): boolean {
  // If never synced, no conflict possible
  if (!lastSyncTime) {
    return false;
  }
  
  const lastSync = new Date(lastSyncTime).getTime();
  
  // Check if local was modified after last sync
  const localModified = local.client_timestamp
    ? new Date(local.client_timestamp).getTime()
    : new Date(local.updated_at).getTime();
  
  const localChangedAfterSync = localModified > lastSync;
  
  // Check if server was modified after last sync
  const serverModified = server.client_timestamp
    ? new Date(server.client_timestamp).getTime()
    : new Date(server.updated_at).getTime();
  
  const serverChangedAfterSync = serverModified > lastSync;
  
  // Both changed after last sync = conflict
  return localChangedAfterSync && serverChangedAfterSync;
}

/**
 * Detect field-level conflicts between two records
 */
export function detectFieldConflicts<T extends Record<string, unknown>>(
  local: T,
  server: T,
  lastSync: Partial<T> | null
): string[] {
  const conflictingFields: string[] = [];
  
  if (!lastSync) {
    return conflictingFields;
  }
  
  for (const key of Object.keys(local)) {
    // Skip metadata fields
    if (['id', 'created_at', 'updated_at', 'client_timestamp', 'device_id', 'user_id'].includes(key)) {
      continue;
    }
    
    const localValue = local[key];
    const serverValue = server[key];
    const lastSyncValue = lastSync[key];
    
    // Check if local changed from last sync
    const localChanged = JSON.stringify(localValue) !== JSON.stringify(lastSyncValue);
    
    // Check if server changed from last sync
    const serverChanged = JSON.stringify(serverValue) !== JSON.stringify(lastSyncValue);
    
    // Both changed = field conflict
    if (localChanged && serverChanged) {
      conflictingFields.push(key);
    }
  }
  
  return conflictingFields;
}

/**
 * Create a merged record from local and server data
 * Uses last sync state as baseline for field-level merging
 */
export function mergeRecords<T extends ConflictTrackable & Record<string, unknown>>(
  local: T,
  server: T,
  lastSync: Partial<T> | null,
  preferLocal = true
): T {
  if (!lastSync) {
    // No baseline, just prefer one
    return preferLocal ? local : server;
  }
  
  const merged = { ...server } as T;
  let didMerge = false;
  
  for (const key of Object.keys(local)) {
    // Skip metadata fields
    if (['id', 'created_at', 'user_id'].includes(key)) {
      continue;
    }
    
    const localValue = local[key];
    const serverValue = server[key];
    const lastSyncValue = lastSync[key];
    
    const localChanged = JSON.stringify(localValue) !== JSON.stringify(lastSyncValue);
    const serverChanged = JSON.stringify(serverValue) !== JSON.stringify(lastSyncValue);
    
    if (localChanged && !serverChanged) {
      // Only local changed - use local
      (merged as Record<string, unknown>)[key] = localValue;
      didMerge = true;
    } else if (!localChanged && serverChanged) {
      // Only server changed - keep server (already in merged)
    } else if (localChanged && serverChanged) {
      // Both changed - use preferred source
      (merged as Record<string, unknown>)[key] = preferLocal ? localValue : serverValue;
      didMerge = true;
    }
    // If neither changed, keep server value
  }
  
  // Only update timestamps if the merge actually changed something.
  // Unconditionally stamping timestamps on an identical record overwrites
  // the server's timestamp and causes cascading conflicts on multi-device sync.
  if (didMerge) {
    merged.updated_at = new Date().toISOString();
    merged.client_timestamp = new Date().toISOString();
  }
  
  return didMerge ? merged : server;
}

/**
 * Create a conflict report for logging/debugging
 */
export function createConflictReport<T extends ConflictTrackable>(
  local: T,
  server: T,
  resolution: ConflictResolution<T>
): {
  recordId: string;
  tableName: string;
  localTimestamp: string;
  serverTimestamp: string;
  winner: 'local' | 'server';
  reason: string;
  strategy: ConflictStrategy;
  localDeviceId: string | null;
  serverDeviceId: string | null;
  timestamp: string;
} {
  return {
    recordId: local.id,
    tableName: (local as unknown as Record<string, unknown>).table_name as string || 'unknown',
    localTimestamp: local.client_timestamp || local.updated_at,
    serverTimestamp: server.client_timestamp || server.updated_at,
    winner: resolution.winner,
    reason: resolution.reason,
    strategy: resolution.strategy,
    localDeviceId: local.device_id || null,
    serverDeviceId: server.device_id || null,
    timestamp: new Date().toISOString(),
  };
}
