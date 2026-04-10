/**
 * Offline Status Hook
 * 
 * Provides real-time network status and sync queue information.
 * Use this to show offline indicators and sync status in the UI.
 * 
 * @module hooks/use-offlineStatus
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { syncManager } from '@/lib/unified-data-service';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface OfflineStatus {
  isOnline: boolean;
  isOffline: boolean;
  lastOnlineTime: Date | null;
  lastOfflineTime: Date | null;
  pendingSyncCount: number;
  failedSyncCount: number;
  isSyncing: boolean;
  connectionType: string;
  downlink: number | null;
  effectiveType: string;
}

export interface SyncStats {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  conflict: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════
// Helper to get network info
// ═══════════════════════════════════════════════════════════════

function getNetworkInfo() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      connectionType: 'unknown',
      downlink: null,
      effectiveType: 'unknown',
    };
  }
  
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  
  if (connection) {
    return {
      connectionType: connection.type || 'unknown',
      downlink: connection.downlink || null,
      effectiveType: connection.effectiveType || 'unknown',
    };
  }
  
  return {
    connectionType: 'unknown',
    downlink: null,
    effectiveType: 'unknown',
  };
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useOfflineStatus(): OfflineStatus {
  // Initialize with current online status
  const initialOnline = useMemo(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }, []);

  const [status, setStatus] = useState<OfflineStatus>(() => ({
    isOnline: initialOnline,
    isOffline: !initialOnline,
    lastOnlineTime: initialOnline ? new Date() : null,
    lastOfflineTime: null,
    pendingSyncCount: 0,
    failedSyncCount: 0,
    isSyncing: false,
    ...getNetworkInfo(),
  }));

  // Update sync stats
  const updateSyncStats = useCallback(async () => {
    try {
      const stats = await syncManager.getStats();
      setStatus(prev => ({
        ...prev,
        pendingSyncCount: stats.pending,
        failedSyncCount: stats.failed,
        isSyncing: stats.syncing > 0,
      }));
    } catch (error) {
      console.error('[useOfflineStatus] Failed to get sync stats:', error);
    }
  }, []);

  useEffect(() => {
    // Handle online/offline events
    const handleOnline = () => {
      console.log('[useOfflineStatus] Back online');
      setStatus(prev => ({
        ...prev,
        isOnline: true,
        isOffline: false,
        lastOnlineTime: new Date(),
        ...getNetworkInfo(),
      }));
      // Trigger sync when coming back online
      updateSyncStats();
    };

    const handleOffline = () => {
      console.log('[useOfflineStatus] Gone offline');
      setStatus(prev => ({
        ...prev,
        isOnline: false,
        isOffline: true,
        lastOfflineTime: new Date(),
      }));
    };

    // Handle connection changes
    const handleConnectionChange = () => {
      setStatus(prev => ({
        ...prev,
        ...getNetworkInfo(),
      }));
    };

    // Initial sync stats update (deferred to avoid cascading renders)
    const timeoutId = setTimeout(() => {
      updateSyncStats();
    }, 0);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to connection changes if available
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    connection?.addEventListener?.('change', handleConnectionChange);

    // Subscribe to sync status changes
    const unsubscribe = syncManager.subscribe(() => {
      updateSyncStats();
    });

    // Periodic sync stats update
    const interval = setInterval(updateSyncStats, 30000); // Every 30 seconds

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      connection?.removeEventListener?.('change', handleConnectionChange);
      unsubscribe();
      clearInterval(interval);
    };
  }, [updateSyncStats]);

  return status;
}

// ═══════════════════════════════════════════════════════════════
// Sync Stats Hook
// ═══════════════════════════════════════════════════════════════

export function useSyncStats(): SyncStats {
  const [stats, setStats] = useState<SyncStats>({
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    conflict: 0,
    total: 0,
  });

  useEffect(() => {
    const updateStats = async () => {
      try {
        const newStats = await syncManager.getStats();
        setStats(newStats);
      } catch (error) {
        console.error('[useSyncStats] Failed to get stats:', error);
      }
    };

    updateStats();

    const unsubscribe = syncManager.subscribe(() => {
      updateStats();
    });

    const interval = setInterval(updateStats, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return stats;
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface NetworkInformation extends EventTarget {
  type?: string;
  downlink?: number;
  effectiveType?: string;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}
