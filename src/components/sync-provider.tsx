/**
 * Sync Provider
 * 
 * Provides sync functionality across the app.
 * Integrates with auth to cache sessions for offline login.
 * Handles Service Worker messages for offline mutations.
 * 
 * Updated: 2025-03-02 - Fixed forceSync to actually sync
 * Updated: 2025-03-02 - Added SW message handling for QUEUE_MUTATION
 * 
 * @module components/sync-provider
 */

'use client';

import React, { createContext, useContext, useEffect, useCallback, useState, useRef } from 'react';
import { useSupabaseAuth } from '@/lib/supabase/auth-context';
import { unifiedDataService, syncManager } from '@/lib/unified-data-service';
import { 
  cacheAuthSession, 
  clearCachedAuth, 
  getCachedAuthSession 
} from '@/lib/offline-auth';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface SyncContextType {
  isInitialized: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingCount: number;
  failedCount: number;
  forceSync: () => Promise<void>;
  clearLocalData: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════

const SyncContext = createContext<SyncContextType | null>(null);

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user, session, profile, isAuthenticated } = useSupabaseAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // Initialize sync service when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('[SyncProvider] Initializing sync for user:', user.id);
      
      unifiedDataService.initialize(user.id).then(() => {
        setIsInitialized(true);
        console.log('[SyncProvider] Sync initialized');
      });

      // Cache auth session for offline login
      if (session && profile) {
        cacheAuthSession(user, session, profile);
        console.log('[SyncProvider] Auth session cached for offline use');
      }
    } else {
      setIsInitialized(false);
    }
  }, [isAuthenticated, user, session, profile]);

  // Clear cached auth on sign out (only if user was previously authenticated)
  const wasAuthenticatedRef = useRef(false);
  
  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;
    } else if (wasAuthenticatedRef.current) {
      // Only clear cache if user was previously authenticated (explicit sign out)
      clearCachedAuth();
      console.log('[SyncProvider] Cleared cached auth on sign out');
      wasAuthenticatedRef.current = false;
    }
  }, [isAuthenticated]);

  // Handle offline login attempt
  useEffect(() => {
    const handleOfflineLogin = async () => {
      if (!navigator.onLine && !isAuthenticated) {
        console.log('[SyncProvider] Offline and not authenticated, checking cache...');
        const cached = await getCachedAuthSession();
        
        if (cached.success) {
          console.log('[SyncProvider] Found cached session for offline use');
          // The auth context will handle this via its own offline detection
        }
      }
    };

    handleOfflineLogin();
  }, [isAuthenticated]);

  // Update sync stats periodically
  useEffect(() => {
    const updateStats = async () => {
      try {
        const stats = await syncManager.getStats();
        setPendingCount(stats.pending);
        setFailedCount(stats.failed + stats.conflict);
        
        if (stats.syncing > 0) {
          setIsSyncing(true);
        } else {
          setIsSyncing(false);
          if (stats.synced > 0) {
            setLastSyncTime(new Date());
          }
        }
      } catch (error) {
        console.error('[SyncProvider] Failed to get stats:', error);
      }
    };

    updateStats();

    const interval = setInterval(updateStats, 15000);
    const unsubscribe = syncManager.subscribe(updateStats);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Force sync - defined early so it can be used in effects below
  const forceSync = useCallback(async () => {
    if (!isInitialized || !navigator.onLine) {
      console.log('[SyncProvider] Cannot sync: not initialized or offline');
      return;
    }

    setIsSyncing(true);
    console.log('[SyncProvider] Starting force sync...');

    try {
      // Process pending sync items by calling the actual sync method
      await unifiedDataService.sync();
      
      // Update stats after sync
      const stats = await syncManager.getStats();
      setPendingCount(stats.pending);
      setFailedCount(stats.failed + stats.conflict);
      setLastSyncTime(new Date());
      
      console.log('[SyncProvider] Sync complete');
    } catch (error) {
      console.error('[SyncProvider] Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isInitialized]);

  // Handle online event to trigger sync
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SyncProvider] Back online, triggering sync...');
      forceSync();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [forceSync]);

  // Handle visibility change to sync when app comes to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && isAuthenticated) {
        console.log('[SyncProvider] App visible, checking sync...');
        forceSync();
      }
    };

    const handleCapacitorResume = () => {
      console.log('[SyncProvider] Capacitor resume — triggering sync');
      forceSync();
    };

    const handleLowMemory = () => {
      console.warn('[SyncProvider] Low memory — flushing sync queue');
      forceSync();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('capacitor-resume', handleCapacitorResume);
    window.addEventListener('capacitor-low-memory', handleLowMemory);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('capacitor-resume', handleCapacitorResume);
      window.removeEventListener('capacitor-low-memory', handleLowMemory);
    };
  }, [isAuthenticated, forceSync]);

  // Handle Service Worker messages for QUEUE_MUTATION and PROCESS_SYNC_QUEUE
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      const { type, payload } = event.data || {};

      switch (type) {
        case 'QUEUE_MUTATION':
          // Service worker is asking us to queue a mutation for later sync
          console.log('[SyncProvider] SW requested mutation queue:', payload?.url);
          
          // Store mutation in sync queue for later processing
          if (payload && user) {
            try {
              // Parse the request body if it's a string
              const body = typeof payload.body === 'string' 
                ? JSON.parse(payload.body) 
                : payload.body;
              
              // Extract table name from URL (e.g., /api/foods -> foods)
              const url = new URL(payload.url);
              const pathParts = url.pathname.split('/');
              const tableName = pathParts[2]; // /api/{tableName}
              
              if (tableName) {
                // Determine operation type from HTTP method
                const operation = payload.method === 'POST' ? 'INSERT' 
                  : payload.method === 'PUT' || payload.method === 'PATCH' ? 'UPDATE'
                  : payload.method === 'DELETE' ? 'DELETE' 
                  : 'INSERT';
                
                // Add to sync queue
                await syncManager.enqueue(
                  operation,
                  tableName as any,
                  body.id || `temp-${Date.now()}`,
                  body,
                  { priority: 10 } // High priority for SW queued items
                );
                
                console.log('[SyncProvider] Mutation queued for sync');
              }
            } catch (error) {
              console.error('[SyncProvider] Failed to queue mutation:', error);
            }
          }
          break;

        case 'PROCESS_SYNC_QUEUE':
          // Background sync is triggering - process the queue
          console.log('[SyncProvider] SW requested sync queue processing');
          if (navigator.onLine && isInitialized) {
            forceSync();
          }
          break;
      }
    };

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [isInitialized, user, forceSync]);

  // Clear local data
  const clearLocalData = useCallback(async () => {
    console.log('[SyncProvider] Clearing local data...');
    await unifiedDataService.clearAllData();
    await clearCachedAuth();
    setPendingCount(0);
    setFailedCount(0);
    setLastSyncTime(null);
    console.log('[SyncProvider] Local data cleared');
  }, []);

  // Context value
  const value: SyncContextType = {
    isInitialized,
    isSyncing,
    lastSyncTime,
    pendingCount,
    failedCount,
    forceSync,
    clearLocalData,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
