'use client';

import { useCallback, useEffect, useState } from 'react';
import { isNative } from '@/lib/capacitor';
import {
  captureError,
  syncErrors,
  getQueueStats,
  onSyncStatusChange,
  initAutoSync,
  type ErrorCategory,
  type ErrorSeverity,
  type CapturedError,
  type ErrorQueueStats,
} from '@/lib/error-monitoring';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LogErrorOptions {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  userId?: string;
  userEmail?: string;
  additionalData?: Record<string, unknown>;
  componentStack?: string;
}

export interface LogApiErrorOptions extends LogErrorOptions {
  endpoint?: string;
  method?: string;
  statusCode?: number;
  responseBody?: unknown;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncError: Error | null;
}

export interface UseErrorLoggingReturn {
  logError: (error: Error | unknown, options?: LogErrorOptions) => Promise<CapturedError | null>;
  logApiError: (error: Error | unknown, options?: LogApiErrorOptions) => Promise<CapturedError | null>;
  logMessage: (message: string, options?: LogErrorOptions) => Promise<CapturedError | null>;
  triggerSync: () => Promise<{ synced: number; failed: number }>;
  queueStats: ErrorQueueStats;
  syncStatus: SyncStatus;
  isOnline: boolean;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HOOK
// ═══════════════════════════════════════════════════════════════

export function useErrorLogging(
  defaultOptions?: LogErrorOptions
): UseErrorLoggingReturn {
  const [queueStats, setQueueStats] = useState<ErrorQueueStats>({
    total: 0,
    synced: 0,
    pending: 0,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncError: null,
  });
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Fetch queue stats on mount (using IIFE to avoid lint warning)
  useEffect(() => {
    let mounted = true;
    
    async function fetchStats() {
      try {
        const stats = await getQueueStats();
        if (mounted) {
          setQueueStats(stats);
        }
      } catch (error) {
        console.error('Failed to get queue stats:', error);
      }
    }
    
    fetchStats();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Refresh queue stats function (for manual refresh)
  const refreshQueueStats = useCallback(async () => {
    try {
      const stats = await getQueueStats();
      setQueueStats(stats);
    } catch (error) {
      console.error('Failed to get queue stats:', error);
    }
  }, []);

  // Initialize auto-sync and network status listener
  useEffect(() => {
    // Initialize auto-sync
    const cleanupAutoSync = initAutoSync();

    // Subscribe to sync status changes
    const cleanupSyncListener = onSyncStatusChange((status) => {
      setSyncStatus({
        isSyncing: status.syncing,
        lastSyncError: status.error || null,
      });
    });

    // Network status listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    let removeCapNetListener: (() => void) | null = null;

    if (isNative) {
      // Use Capacitor Network plugin
      import('@capacitor/network').then(({ Network }) => {
        Network.getStatus().then(s => setIsOnline(s.connected));
        Network.addListener('networkStatusChange', (status) => {
          setIsOnline(status.connected);
        }).then(handle => {
          removeCapNetListener = () => handle.remove();
        });
      }).catch(() => {
        // fallback to web events
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
      });
    } else {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      cleanupAutoSync();
      cleanupSyncListener();
      if (removeCapNetListener) removeCapNetListener();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Log an error
  const logError = useCallback(
    async (
      error: Error | unknown,
      options?: LogErrorOptions
    ): Promise<CapturedError | null> => {
      try {
        const captured = await captureError(error, {
          ...defaultOptions,
          ...options,
        });

        // Refresh queue stats after capturing
        await refreshQueueStats();

        return captured;
      } catch (captureErr) {
        console.error('Failed to log error:', captureErr);
        return null;
      }
    },
    [defaultOptions, refreshQueueStats]
  );

  // Log an API error with additional context
  const logApiError = useCallback(
    async (
      error: Error | unknown,
      options?: LogApiErrorOptions
    ): Promise<CapturedError | null> => {
      const normalizedError = error instanceof Error
        ? error
        : new Error(String(error));

      return logError(normalizedError, {
        ...defaultOptions,
        ...options,
        category: options?.category || 'api',
        additionalData: {
          ...options?.additionalData,
          endpoint: options?.endpoint,
          method: options?.method,
          statusCode: options?.statusCode,
          responseBody: options?.responseBody,
        },
      });
    },
    [defaultOptions, logError]
  );

  // Log a custom message as an error
  const logMessage = useCallback(
    async (
      message: string,
      options?: LogErrorOptions
    ): Promise<CapturedError | null> => {
      return logError(new Error(message), options);
    },
    [logError]
  );

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    try {
      const result = await syncErrors();
      await refreshQueueStats();
      return result;
    } catch (error) {
      console.error('Failed to sync errors:', error);
      return { synced: 0, failed: 0 };
    }
  }, [refreshQueueStats]);

  return {
    logError,
    logApiError,
    logMessage,
    triggerSync,
    queueStats,
    syncStatus,
    isOnline,
  };
}

// ═══════════════════════════════════════════════════════════════
// SPECIALIZED HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for logging API errors with automatic retry handling
 */
export function useApiErrorLogging() {
  const { logApiError, isOnline, triggerSync } = useErrorLogging();

  const logFetchError = useCallback(
    async (
      url: string,
      error: unknown,
      options?: {
        method?: string;
        statusCode?: number;
        responseBody?: unknown;
        userId?: string;
      }
    ) => {
      return logApiError(error, {
        endpoint: url,
        method: options?.method || 'GET',
        statusCode: options?.statusCode,
        responseBody: options?.responseBody,
        userId: options?.userId,
      });
    },
    [logApiError]
  );

  /**
   * Wraps fetch with automatic error logging
   */
  const fetchWithErrorLogging = useCallback(
    async <T = unknown>(
      url: string,
      options?: RequestInit & { userId?: string }
    ): Promise<{ data: T | null; error: Error | null }> => {
      try {
        if (!isOnline) {
          throw new Error('Network offline');
        }

        const response = await fetch(url, options);

        if (!response.ok) {
          let responseBody: unknown;
          try {
            responseBody = await response.json();
          } catch {
            responseBody = await response.text();
          }

          const error = new Error(
            `API Error: ${response.status} ${response.statusText}`
          );

          await logFetchError(url, error, {
            method: options?.method,
            statusCode: response.status,
            responseBody,
            userId: options?.userId,
          });

          return { data: null, error };
        }

        const data = await response.json();
        return { data, error: null };
      } catch (error) {
        await logFetchError(url, error, {
          method: options?.method,
          userId: options?.userId,
        });

        return {
          data: null,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [isOnline, logFetchError]
  );

  return {
    logFetchError,
    fetchWithErrorLogging,
    isOnline,
    triggerSync,
  };
}

/**
 * Hook for logging component errors
 */
export function useComponentErrorLogging(componentName: string) {
  const { logError } = useErrorLogging();

  const logComponentError = useCallback(
    async (error: Error | unknown, additionalData?: Record<string, unknown>) => {
      return logError(error, {
        category: 'rendering',
        additionalData: {
          componentName,
          ...additionalData,
        },
      });
    },
    [componentName, logError]
  );

  const logStateError = useCallback(
    async (error: Error | unknown, stateName?: string) => {
      return logError(error, {
        category: 'state',
        additionalData: {
          componentName,
          stateName,
        },
      });
    },
    [componentName, logError]
  );

  return {
    logComponentError,
    logStateError,
  };
}

/**
 * Hook for logging form validation errors
 */
export function useFormErrorLogging(formName: string) {
  const { logError } = useErrorLogging();

  const logValidationError = useCallback(
    async (
      fieldName: string,
      value: unknown,
      errorMessage: string,
      additionalData?: Record<string, unknown>
    ) => {
      return logError(new Error(`Validation error: ${errorMessage}`), {
        category: 'validation',
        severity: 'low',
        additionalData: {
          formName,
          fieldName,
          valueType: typeof value,
          errorMessage,
          ...additionalData,
        },
      });
    },
    [formName, logError]
  );

  const logSubmissionError = useCallback(
    async (error: Error | unknown, formData?: Record<string, unknown>) => {
      return logError(error, {
        category: 'api',
        severity: 'medium',
        additionalData: {
          formName,
          fieldsAttempted: formData ? Object.keys(formData) : undefined,
        },
      });
    },
    [formName, logError]
  );

  return {
    logValidationError,
    logSubmissionError,
  };
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a safe async function wrapper that logs errors
 */
export function withErrorLogging<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options?: LogErrorOptions
): (...args: T) => Promise<R | null> {
  return async (...args: T): Promise<R | null> => {
    try {
      return await fn(...args);
    } catch (error) {
      await captureError(error, options);
      return null;
    }
  };
}

/**
 * Creates a safe sync function wrapper that logs errors
 */
export function withSyncErrorLogging<T extends unknown[], R>(
  fn: (...args: T) => R,
  options?: LogErrorOptions
): (...args: T) => R | null {
  return (...args: T): R | null => {
    try {
      return fn(...args);
    } catch (error) {
      // Fire and forget error logging
      captureError(error, options).catch(() => {});
      return null;
    }
  };
}

export default useErrorLogging;
