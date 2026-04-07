/**
 * Unified Data Service
 * 
 * Core orchestrator for all data operations in the app.
 * Implements offline-first architecture with sync capabilities.
 * 
 * @module lib/unified-data-service
 */

// Core Service
export { UnifiedDataService, unifiedDataService } from './service';

// Managers
export { SyncManager, syncManager } from './sync-manager';
export { RealtimeManager, realtimeManager } from './realtime-manager';
export { 
  resolveConflict, 
  hasConflict, 
  detectFieldConflicts, 
  mergeRecords 
} from './conflict-resolver';

// Types
export type {
  DataOperation,
  SyncStatus,
  ConflictStrategy,
  ConflictResolution,
  SyncQueueItem,
  SyncMetadata,
  ReadOptions,
  WriteOptions,
  QueryOptions,
  TableName,
  SyncableEntity,
} from './types';

export { 
  isOnline, 
  subscribeToNetworkChanges,
  subscribeToVisibilityChanges,
  generateId,
  getDeviceId,
  initDeviceId,
  timestamp,
  calculateBackoff,
  canRetry,
} from './types';
