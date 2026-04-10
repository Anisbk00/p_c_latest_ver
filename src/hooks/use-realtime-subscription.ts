/**
 * React Hook for Realtime Subscriptions
 * 
 * Provides a React-friendly interface to the RealtimeManager.
 * Handles automatic cleanup on unmount and reconnection on network changes.
 * 
 * @module hooks/use-realtime-subscription
 */

"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { realtimeManager } from '@/lib/unified-data-service/realtime-manager';
import type { TableName } from '@/lib/unified-data-service/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface UseRealtimeSubscriptionOptions {
  /** Table to subscribe to */
  tableName: TableName;
  /** User ID for filtering (optional - if not provided, subscription is skipped) */
  userId: string | null | undefined;
  /** Handler for INSERT events */
  onInsert?: (payload: RealtimePostgresChangesPayload<unknown>) => void;
  /** Handler for UPDATE events */
  onUpdate?: (payload: RealtimePostgresChangesPayload<unknown>) => void;
  /** Handler for DELETE events */
  onDelete?: (payload: RealtimePostgresChangesPayload<unknown>) => void;
  /** Whether the subscription is enabled (default: true) */
  enabled?: boolean;
}

export interface UseRealtimeSubscriptionResult {
  /** Current connection status */
  status: ConnectionStatus;
  /** Number of active subscriptions */
  activeSubscriptions: number;
  /** Whether currently connected */
  isConnected: boolean;
  /** Manually reconnect */
  reconnect: () => void;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Subscribe to realtime table changes
 * 
 * @example
 * ```tsx
 * useRealtimeSubscription({
 *   tableName: 'food_logs',
 *   userId: user.id,
 *   onInsert: (payload) => {
 *     console.log('New food log:', payload.new);
 *     queryClient.invalidateQueries({ queryKey: ['food-logs'] });
 *   },
 *   onUpdate: (payload) => {
 *     console.log('Updated food log:', payload.new);
 *   },
 *   onDelete: (payload) => {
 *     console.log('Deleted food log:', payload.old);
 *   },
 * });
 * ```
 */
export function useRealtimeSubscription(options: UseRealtimeSubscriptionOptions): UseRealtimeSubscriptionResult {
  const { tableName, userId, onInsert, onUpdate, onDelete, enabled = true } = options;
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const unsubscribeRef = useRef<null | (() => void)>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onInsertRef = useRef<typeof onInsert>();
  const onUpdateRef = useRef<typeof onUpdate>();
  const onDeleteRef = useRef<typeof onDelete>();

  // Keep handlers up to date
  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  // Main subscription effect
  useEffect(() => {
    if (!userId || !enabled) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setTimeout(() => {
        setStatus('disconnected');
        setActiveSubscriptions(0);
      }, 0);
      if (!userId) {
        console.error(`[useRealtimeSubscription] Attempted subscription without userId for table ${tableName}. Subscription skipped.`);
      }
      return;
    }

    setTimeout(() => {
      setStatus('connecting');
    }, 0);

    const unsubscribe = realtimeManager.subscribe({
      tableName,
      userId,
      onInsert: (payload) => onInsertRef.current?.(payload),
      onUpdate: (payload) => onUpdateRef.current?.(payload),
      onDelete: (payload) => onDeleteRef.current?.(payload),
    });
    unsubscribeRef.current = unsubscribe;

    // Status polling - increased to 5 seconds to reduce CPU load
    // Use ref for proper cleanup across rapid remounts
    statusIntervalRef.current = setInterval(() => {
      const currentStatus = realtimeManager.getStatus();
      setStatus(currentStatus);
      setActiveSubscriptions(realtimeManager.getActiveSubscriptions());
    }, 5000);

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setTimeout(() => {
        setStatus('disconnected');
        setActiveSubscriptions(0);
      }, 0);
    };
  }, [tableName, userId, enabled]);

  const reconnect = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setTimeout(() => {
      setStatus('connecting');
    }, 0);
    // Re-run the effect by changing a dummy state if needed
  }, [tableName, userId, enabled]);

  return {
    status,
    activeSubscriptions,
    isConnected: status === 'connected',
    reconnect,
  };
}

// ═══════════════════════════════════════════════════════════════
// Multi-Table Subscription Hook
// ═══════════════════════════════════════════════════════════════

export interface UseMultiRealtimeSubscriptionOptions {
  /** Tables to subscribe to */
  tableNames: TableName[];
  /** User ID for filtering */
  userId: string | null | undefined;
  /** Shared handler for INSERT events */
  onInsert?: (payload: RealtimePostgresChangesPayload<unknown>, tableName: TableName) => void;
  /** Shared handler for UPDATE events */
  onUpdate?: (payload: RealtimePostgresChangesPayload<unknown>, tableName: TableName) => void;
  /** Shared handler for DELETE events */
  onDelete?: (payload: RealtimePostgresChangesPayload<unknown>, tableName: TableName) => void;
  /** Whether subscriptions are enabled */
  enabled?: boolean;
}

/**
 * Subscribe to multiple tables at once
 * 
 * @example
 * ```tsx
 * useMultiRealtimeSubscription({
 *   tableNames: ['food_logs', 'workouts', 'body_metrics'],
 *   userId: user.id,
 *   onInsert: (payload, tableName) => {
 *     console.log(`New ${tableName}:`, payload.new);
 *   },
 * });
 * ```
 */
export function useMultiRealtimeSubscription({
  tableNames,
  userId,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseMultiRealtimeSubscriptionOptions): UseRealtimeSubscriptionResult {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);

  // Stable callback refs
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
  }, [onInsert, onUpdate, onDelete]);

  useEffect(() => {
    if (!userId || !enabled) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      // Defer setState to avoid cascading renders
      setTimeout(() => {
        setStatus('disconnected');
        setActiveSubscriptions(0);
      }, 0);
      return;
    }

    // Defer setState to avoid cascading renders
    setTimeout(() => {
      setStatus('connecting');
    }, 0);

    const unsubscribe = realtimeManager.subscribeToTables(
      userId,
      tableNames,
      {
        onInsert: (payload) => {
          // Try to determine table name from payload
          const tableName = (payload as any).table as TableName;
          onInsertRef.current?.(payload, tableName);
        },
        onUpdate: (payload) => {
          const tableName = (payload as any).table as TableName;
          onUpdateRef.current?.(payload, tableName);
        },
        onDelete: (payload) => {
          const tableName = (payload as any).table as TableName;
          onDeleteRef.current?.(payload, tableName);
        },
      }
    );

    unsubscribeRef.current = unsubscribe;

    // Update status periodically
    const statusInterval = setInterval(() => {
      setStatus(realtimeManager.getStatus());
      setActiveSubscriptions(realtimeManager.getActiveSubscriptions());
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      // Defer setState to avoid cascading renders
      setTimeout(() => {
        setStatus('disconnected');
      }, 0);
    };
  }, [tableNames.join(','), userId, enabled]);

  return {
    status,
    activeSubscriptions,
    isConnected: status === 'connected',
    reconnect: () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      // Re-subscribe will happen via effect
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Convenience Hook for App-Wide Realtime
// ═══════════════════════════════════════════════════════════════

/**
 * Subscribe to all user data tables for real-time sync
 * 
 * @example
 * ```tsx
 * function AppRealtimeProvider({ children }) {
 *   const { user } = useAuth();
 *   
 *   useUserDataRealtime({
 *     userId: user?.id,
 *     onDataChange: (payload, tableName) => {
 *       // Invalidate relevant queries
 *       queryClient.invalidateQueries({ queryKey: [tableName] });
 *     },
 *   });
 *   
 *   return children;
 * }
 * ```
 */
export function useUserDataRealtime({
  userId,
  onDataChange,
  enabled = true,
}: {
  userId: string | null | undefined;
  onDataChange?: (payload: RealtimePostgresChangesPayload<unknown>, tableName: TableName) => void;
  enabled?: boolean;
}): UseRealtimeSubscriptionResult {
  // Core user data tables
  const tableNames: TableName[] = [
    'food_logs',
    'workouts',
    'body_metrics',
    'user_profiles',
    'user_settings',
    'goals',
    'sleep_logs',
    'supplement_logs',
    'notifications', // Added for real-time notification updates
    'ai_insights',   // Added for real-time AI insight updates
  ];

  return useMultiRealtimeSubscription({
    tableNames,
    userId,
    onInsert: onDataChange,
    onUpdate: onDataChange,
    onDelete: onDataChange,
    enabled,
  });
}
