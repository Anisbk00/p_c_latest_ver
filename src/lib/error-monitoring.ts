/**
 * Error monitoring service for Progress Companion
 * Provides error capture, categorization, severity levels, context enrichment,
 * local storage queue for offline support, and auto-sync capabilities
 * Updated: 2025-01-20
 */

import logger from './logger';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ErrorCategory = 
  | 'api' 
  | 'client' 
  | 'database' 
  | 'network' 
  | 'validation' 
  | 'authentication' 
  | 'authorization' 
  | 'rendering' 
  | 'state' 
  | 'unknown';

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface CapturedError {
  id: string;
  message: string;
  name: string;
  stack?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: string;
  context: ErrorContext;
  fingerprint: string;
  handled: boolean;
  synced: boolean;
  syncedAt?: string;
}

export interface ErrorContext {
  userId?: string;
  userEmail?: string;
  route?: string;
  pathname?: string;
  userAgent?: string;
  appVersion?: string;
  environment?: string;
  browser?: {
    name?: string;
    version?: string;
    os?: string;
  };
  device?: {
    type?: 'desktop' | 'mobile' | 'tablet';
    screenWidth?: number;
    screenHeight?: number;
  };
  network?: {
    online?: boolean;
    connectionType?: string;
  };
  react?: {
    componentStack?: string;
    componentName?: string;
  };
  additionalData?: Record<string, unknown>;
}

export interface ErrorQueueStats {
  total: number;
  synced: number;
  pending: number;
  oldestUnsynced?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const DB_NAME = 'progress-companion-errors';
const DB_VERSION = 1;
const STORE_NAME = 'error-queue';
const MAX_QUEUE_SIZE = 100;
const SYNC_BATCH_SIZE = 10;

// ═══════════════════════════════════════════════════════════════
// ERROR CATEGORIZATION
// ═══════════════════════════════════════════════════════════════

const ERROR_PATTERNS: Record<ErrorCategory, RegExp[]> = {
  api: [
    /fetch failed/i,
    /network request failed/i,
    /api error/i,
    /request aborted/i,
    /timeout/i,
    /5\d{2}/,
  ],
  database: [
    /database/i,
    /supabase/i,
    /pg/i,
    /unique constraint/i,
    /foreign key/i,
    /query failed/i,
  ],
  network: [
    /network error/i,
    /offline/i,
    /connection refused/i,
    /dns/i,
    /cors/i,
  ],
  validation: [
    /validation/i,
    /invalid/i,
    /required/i,
    /type error/i,
    /must be/i,
  ],
  authentication: [
    /unauthorized/i,
    /not authenticated/i,
    /token expired/i,
    /invalid token/i,
    /login required/i,
  ],
  authorization: [
    /forbidden/i,
    /not authorized/i,
    /permission denied/i,
    /access denied/i,
  ],
  rendering: [
    /render/i,
    /hydration/i,
    /dom/i,
    /react/i,
    /component/i,
    /minified react error/i,
  ],
  state: [
    /state/i,
    /context/i,
    /provider/i,
    /store/i,
    /reducer/i,
  ],
  unknown: [],
};

const SEVERITY_KEYWORDS: Record<ErrorSeverity, string[]> = {
  critical: [
    'crash',
    'fatal',
    'unrecoverable',
    'memory',
    'stack overflow',
    'out of memory',
  ],
  high: [
    'unauthorized',
    'forbidden',
    'authentication',
    'database',
    'corruption',
    'data loss',
  ],
  medium: [
    'validation',
    'timeout',
    'network',
    'api error',
    'failed',
  ],
  low: [
    'warning',
    'deprecated',
    'minor',
    'optional',
  ],
};

/**
 * Categorize an error based on its message and properties
 */
export function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';

  for (const [category, patterns] of Object.entries(ERROR_PATTERNS)) {
    if (category === 'unknown') continue;
    
    for (const pattern of patterns) {
      if (pattern.test(message) || pattern.test(name) || pattern.test(stack)) {
        return category as ErrorCategory;
      }
    }
  }

  // Check for specific error types
  if (error.name === 'TypeError' && message.includes('fetch')) {
    return 'api';
  }
  
  if (error.name === 'ChunkError' || message.includes('chunk')) {
    return 'network';
  }

  return 'unknown';
}

/**
 * Determine error severity based on error properties
 */
export function determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
  const message = error.message.toLowerCase();

  // Check for critical keywords
  for (const keyword of SEVERITY_KEYWORDS.critical) {
    if (message.includes(keyword)) {
      return 'critical';
    }
  }

  // Category-based severity
  if (category === 'authentication' || category === 'authorization' || category === 'database') {
    return 'high';
  }

  // Check for high severity keywords
  for (const keyword of SEVERITY_KEYWORDS.high) {
    if (message.includes(keyword)) {
      return 'high';
    }
  }

  // Check for medium severity
  for (const keyword of SEVERITY_KEYWORDS.medium) {
    if (message.includes(keyword)) {
      return 'medium';
    }
  }

  // API errors with 5xx are high severity
  if (category === 'api' && /5\d{2}/.test(message)) {
    return 'high';
  }

  // Default to low for unknown or minor issues
  if (category === 'unknown') {
    return 'low';
  }

  return 'medium';
}

// ═══════════════════════════════════════════════════════════════
// FINGERPRINTING
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a fingerprint for error deduplication
 */
export function generateFingerprint(error: Error, context: ErrorContext): string {
  const parts: string[] = [
    error.name,
    error.message.split('\n')[0], // First line of message
    context.route || context.pathname || 'unknown-route',
  ];

  // Add first stack frame if available
  if (error.stack) {
    const firstFrame = error.stack.split('\n').find(line => line.includes('at '));
    if (firstFrame) {
      parts.push(firstFrame.trim());
    }
  }

  return parts.join('|');
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT ENRICHMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Enrich error context with environment information
 */
export function enrichContext(baseContext?: Partial<ErrorContext>): ErrorContext {
  const context: ErrorContext = {
    ...baseContext,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    appVersion: process.env.npm_package_version || '1.0.0',
  };

  // Add browser information (client-side only)
  if (typeof window !== 'undefined') {
    context.userAgent = navigator.userAgent;
    context.pathname = window.location.pathname;
    context.route = window.location.pathname;

    // Browser detection
    const ua = navigator.userAgent;
    let browserName = 'unknown';
    let browserVersion = '';
    
    if (ua.includes('Firefox/')) {
      browserName = 'Firefox';
      browserVersion = ua.split('Firefox/')[1]?.split(' ')[0] || '';
    } else if (ua.includes('Chrome/')) {
      browserName = 'Chrome';
      browserVersion = ua.split('Chrome/')[1]?.split(' ')[0] || '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      browserName = 'Safari';
      browserVersion = ua.split('Safari/')[1]?.split(' ')[0] || '';
    } else if (ua.includes('Edge/')) {
      browserName = 'Edge';
      browserVersion = ua.split('Edge/')[1]?.split(' ')[0] || '';
    }

    context.browser = {
      name: browserName,
      version: browserVersion,
      os: ua.includes('Windows') ? 'Windows' : 
          ua.includes('Mac') ? 'MacOS' : 
          ua.includes('Linux') ? 'Linux' : 
          ua.includes('Android') ? 'Android' : 
          ua.includes('iOS') ? 'iOS' : 'unknown',
    };

    // Device detection
    context.device = {
      type: /mobile|android|iphone/i.test(ua) ? 'mobile' : 
            /tablet|ipad/i.test(ua) ? 'tablet' : 'desktop',
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    };

    // Network status
    context.network = {
      online: navigator.onLine,
      connectionType: (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType,
    };
  }

  return context;
}

// ═══════════════════════════════════════════════════════════════
// INDEXEDDB STORAGE
// ═══════════════════════════════════════════════════════════════

let dbInstance: IDBDatabase | null = null;

async function initErrorDatabase(): Promise<IDBDatabase> {
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
      logger.error('Failed to open error database');
      reject(new Error('Failed to open error database'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('fingerprint', 'fingerprint', { unique: false });
        store.createIndex('severity', 'severity', { unique: false });
      }
    };
  });
}

/**
 * Store error in the offline queue
 */
export async function queueError(error: CapturedError): Promise<CapturedError> {
  if (typeof window === 'undefined') {
    return error;
  }

  const db = await initErrorDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Check queue size and remove oldest if needed
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      if (countRequest.result >= MAX_QUEUE_SIZE) {
        // Remove oldest unsynced errors
        const index = store.index('timestamp');
        const cursorRequest = index.openCursor();
        
        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && countRequest.result >= MAX_QUEUE_SIZE) {
            cursor.delete();
            cursor.continue();
          }
        };
      }
    };

    const request = store.add(error);
    request.onsuccess = () => resolve(error);
    request.onerror = () => {
      logger.error('Failed to queue error');
      reject(new Error('Failed to queue error'));
    };
  });
}

/**
 * Get all queued errors
 */
export async function getQueuedErrors(): Promise<CapturedError[]> {
  if (typeof window === 'undefined') return [];

  const db = await initErrorDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const errors = request.result as CapturedError[];
      errors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(errors);
    };
    request.onerror = () => reject(new Error('Failed to get queued errors'));
  });
}

/**
 * Get unsynced errors
 */
export async function getUnsyncedErrors(): Promise<CapturedError[]> {
  if (typeof window === 'undefined') return [];

  const db = await initErrorDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));

    request.onsuccess = () => {
      const errors = request.result as CapturedError[];
      errors.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      resolve(errors);
    };
    request.onerror = () => reject(new Error('Failed to get unsynced errors'));
  });
}

/**
 * Mark error as synced
 */
export async function markErrorSynced(id: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const db = await initErrorDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const error = getRequest.result as CapturedError | undefined;
      if (!error) {
        resolve();
        return;
      }

      error.synced = true;
      error.syncedAt = new Date().toISOString();

      const putRequest = store.put(error);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(new Error('Failed to mark error as synced'));
    };

    getRequest.onerror = () => reject(new Error('Failed to get error'));
  });
}

/**
 * Remove synced errors older than a specified age
 */
export async function cleanupOldErrors(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  if (typeof window === 'undefined') return 0;

  const db = await initErrorDatabase();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  let deleted = 0;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('synced');
    const cursorRequest = index.openCursor(IDBKeyRange.only(true));

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const error = cursor.value as CapturedError;
        if (error.syncedAt && error.syncedAt < cutoff) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      } else {
        resolve(deleted);
      }
    };

    cursorRequest.onerror = () => reject(new Error('Failed to cleanup old errors'));
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<ErrorQueueStats> {
  if (typeof window === 'undefined') {
    return { total: 0, synced: 0, pending: 0 };
  }

  const errors = await getQueuedErrors();
  const synced = errors.filter(e => e.synced);
  const pending = errors.filter(e => !e.synced);

  return {
    total: errors.length,
    synced: synced.length,
    pending: pending.length,
    oldestUnsynced: pending[pending.length - 1]?.timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════
// ERROR CAPTURE
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a unique error ID
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Capture an error with full context
 */
export async function captureError(
  error: Error | unknown,
  options?: {
    userId?: string;
    userEmail?: string;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    handled?: boolean;
    additionalData?: Record<string, unknown>;
    componentStack?: string;
  }
): Promise<CapturedError> {
  const normalizedError = error instanceof Error 
    ? error 
    : new Error(typeof error === 'string' ? error : JSON.stringify(error));

  const category = options?.category || categorizeError(normalizedError);
  const severity = options?.severity || determineSeverity(normalizedError, category);
  const context = enrichContext({
    userId: options?.userId,
    userEmail: options?.userEmail,
    additionalData: options?.additionalData,
    react: options?.componentStack
      ? {
          componentStack: options.componentStack,
        }
      : undefined,
  });

  const capturedError: CapturedError = {
    id: generateErrorId(),
    message: normalizedError.message,
    name: normalizedError.name,
    stack: normalizedError.stack,
    category,
    severity,
    timestamp: new Date().toISOString(),
    context,
    fingerprint: generateFingerprint(normalizedError, context),
    handled: options?.handled ?? false,
    synced: false,
  };

  // Log the error
  logger.error(`Error captured: [${category}] ${severity.toUpperCase()}`, normalizedError, {
    errorId: capturedError.id,
    fingerprint: capturedError.fingerprint,
    ...context,
  });

  // Queue the error for sync
  try {
    await queueError(capturedError);
  } catch (queueError) {
    logger.error('Failed to queue error for sync', queueError);
  }

  return capturedError;
}

// ═══════════════════════════════════════════════════════════════
// SYNC FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════

let isSyncing = false;
let syncListeners: Array<(status: { syncing: boolean; error?: Error }) => void> = [];

/**
 * Subscribe to sync status changes
 */
export function onSyncStatusChange(
  callback: (status: { syncing: boolean; error?: Error }) => void
): () => void {
  syncListeners.push(callback);
  return () => {
    syncListeners = syncListeners.filter(l => l !== callback);
  };
}

/**
 * Sync queued errors to the server
 */
export async function syncErrors(): Promise<{ synced: number; failed: number }> {
  if (typeof window === 'undefined' || isSyncing) {
    return { synced: 0, failed: 0 };
  }

  // Check if online
  if (!navigator.onLine) {
    logger.warn('Cannot sync errors: offline');
    return { synced: 0, failed: 0 };
  }

  isSyncing = true;
  syncListeners.forEach(l => l({ syncing: true }));

  try {
    const unsyncedErrors = await getUnsyncedErrors();
    
    if (unsyncedErrors.length === 0) {
      isSyncing = false;
      syncListeners.forEach(l => l({ syncing: false }));
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < unsyncedErrors.length; i += SYNC_BATCH_SIZE) {
      const batch = unsyncedErrors.slice(i, i + SYNC_BATCH_SIZE);

      try {
        const response = await fetch('/api/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errors: batch }),
        });

        if (response.ok) {
          // Mark all as synced
          await Promise.all(batch.map(e => markErrorSynced(e.id)));
          synced += batch.length;
        } else {
          failed += batch.length;
          logger.error('Failed to sync error batch', new Error(`HTTP ${response.status}`));
        }
      } catch (batchError) {
        failed += batch.length;
        logger.error('Failed to sync error batch', batchError);
      }
    }

    logger.info(`Error sync complete: ${synced} synced, ${failed} failed`);
    
    isSyncing = false;
    syncListeners.forEach(l => l({ syncing: false }));

    // Cleanup old synced errors
    await cleanupOldErrors();

    return { synced, failed };
  } catch (error) {
    isSyncing = false;
    syncListeners.forEach(l => l({ syncing: false, error: error instanceof Error ? error : new Error(String(error)) }));
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTO-SYNC SETUP
// ═══════════════════════════════════════════════════════════════

let autoSyncInitialized = false;

/**
 * Initialize auto-sync when user comes online
 */
export function initAutoSync(): () => void {
  if (typeof window === 'undefined' || autoSyncInitialized) {
    return () => {};
  }

  autoSyncInitialized = true;

  const handleOnline = () => {
    logger.info('Network online - starting error sync');
    syncErrors().catch(err => {
      logger.error('Auto-sync failed', err);
    });
  };

  window.addEventListener('online', handleOnline);

  // Also try to sync periodically when online
  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      getUnsyncedErrors().then(errors => {
        if (errors.length > 0) {
          syncErrors().catch(() => {});
        }
      });
    }
  }, 60000); // Check every minute

  // Try to sync on init if online
  if (navigator.onLine) {
    syncErrors().catch(() => {});
  }

  return () => {
    autoSyncInitialized = false;
    window.removeEventListener('online', handleOnline);
    clearInterval(intervalId);
  };
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Set up global error handlers
 */
export function setupGlobalErrorHandlers(options?: {
  userId?: string;
  userEmail?: string;
}): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // Handle uncaught errors
  const handleError = (event: ErrorEvent) => {
    captureError(event.error || new Error(event.message), {
      ...options,
      handled: false,
      additionalData: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  };

  // Handle unhandled promise rejections
  const handleRejection = (event: PromiseRejectionEvent) => {
    captureError(event.reason, {
      ...options,
      handled: false,
      category: 'api',
    });
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  // Initialize auto-sync
  const cleanupAutoSync = initAutoSync();

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
    cleanupAutoSync();
  };
}

// Error monitoring service object
const errorMonitoring = {
  captureError,
  categorizeError,
  determineSeverity,
  enrichContext,
  generateFingerprint,
  queueError,
  getQueuedErrors,
  getUnsyncedErrors,
  markErrorSynced,
  cleanupOldErrors,
  getQueueStats,
  syncErrors,
  initAutoSync,
  setupGlobalErrorHandlers,
  onSyncStatusChange,
};

export default errorMonitoring;
