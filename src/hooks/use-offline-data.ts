/**
 * Offline-First Data Hooks
 * 
 * React hooks for offline-first data operations.
 * Automatically handles offline queueing and sync.
 * 
 * @module hooks/use-offline-data
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { unifiedDataService } from '@/lib/unified-data-service';
import { useOfflineStatus } from './use-offline-status';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface UseOfflineDataOptions {
  tableName: string;
  autoFetch?: boolean;
  cacheMaxAge?: number;
}

interface UseOfflineDataResult<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
  isOfflineData: boolean;
  refetch: () => Promise<void>;
  create: (data: Partial<T>) => Promise<T | null>;
  update: (id: string, data: Partial<T>) => Promise<T | null>;
  remove: (id: string) => Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════
// Generic Offline Data Hook
// ═══════════════════════════════════════════════════════════════

export function useOfflineData<T extends { id: string }>(
  options: UseOfflineDataOptions
): UseOfflineDataResult<T> {
  const { tableName, autoFetch = true } = options;
  const { isOffline } = useOfflineStatus();

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineData, setIsOfflineData] = useState(false);

  // Fetch data
  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // @ts-expect-error - Dynamic table access
      const result = await unifiedDataService.getAll(tableName, {
        useCache: true,
      });

      setData(result as T[]);
      setIsOfflineData(isOffline && result.length > 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
      console.error(`[useOfflineData] Error fetching ${tableName}:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [tableName, isOffline]);

  // Create item
  const create = useCallback(async (itemData: Partial<T>): Promise<T | null> => {
    try {
      // @ts-expect-error - Dynamic table access
      const result = await unifiedDataService.create(tableName, itemData);
      
      // Optimistically add to local data
      setData(prev => [result as T, ...prev]);
      
      return result as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create';
      setError(message);
      console.error(`[useOfflineData] Error creating ${tableName}:`, err);
      return null;
    }
  }, [tableName]);

  // Update item
  const update = useCallback(async (id: string, itemData: Partial<T>): Promise<T | null> => {
    try {
      // @ts-expect-error - Dynamic table access
      const result = await unifiedDataService.update(tableName, id, itemData);
      
      if (result) {
        // Update local data optimistically
        setData(prev => prev.map(item => 
          item.id === id ? { ...item, ...itemData } as T : item
        ));
      }
      
      return result as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      setError(message);
      console.error(`[useOfflineData] Error updating ${tableName}:`, err);
      return null;
    }
  }, [tableName]);

  // Delete item
  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      // @ts-expect-error - Dynamic table access
      await unifiedDataService.delete(tableName, id);
      
      // Optimistically remove from local data
      setData(prev => prev.filter(item => item.id !== id));
      
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      setError(message);
      console.error(`[useOfflineData] Error deleting ${tableName}:`, err);
      return false;
    }
  }, [tableName]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      refetch();
    }
  }, [autoFetch, refetch]);

  return {
    data,
    isLoading,
    error,
    isOfflineData,
    refetch,
    create,
    update,
    remove,
  };
}

// ═══════════════════════════════════════════════════════════════
// Food Logs Hook
// ═══════════════════════════════════════════════════════════════

export function useFoodLogs() {
  return useOfflineData<{ id: string; logged_at: string; user_id: string }>({
    tableName: 'food_logs',
  });
}

// ═══════════════════════════════════════════════════════════════
// Workouts Hook
// ═══════════════════════════════════════════════════════════════

export function useWorkouts() {
  return useOfflineData<{ id: string; started_at: string; user_id: string }>({
    tableName: 'workouts',
  });
}

// ═══════════════════════════════════════════════════════════════
// Body Metrics Hook
// ═══════════════════════════════════════════════════════════════

export function useBodyMetrics() {
  return useOfflineData<{ id: string; recorded_at: string; user_id: string }>({
    tableName: 'body_metrics',
  });
}

// ═══════════════════════════════════════════════════════════════
// Goals Hook
// ═══════════════════════════════════════════════════════════════

export function useGoals() {
  return useOfflineData<{ id: string; created_at: string; user_id: string }>({
    tableName: 'goals',
  });
}
