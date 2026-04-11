import { useState, useCallback, useEffect, useRef } from 'react';
import { UserSettings, DEFAULT_SETTINGS } from '@/lib/types/settings';
import { useSupabaseAuth } from '@/lib/supabase/auth-context';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/mobile-api';

// ═══════════════════════════════════════════════════════════════
// SETTINGS CACHING LAYER
// In-memory cache with 30-second TTL + localStorage for instant load
// ═══════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const LOCAL_STORAGE_KEY = 'progress-companion-settings-cache';

interface CachedSettings {
  settings: UserSettings;
  timestamp: number;
  userId: string;
}

// In-memory cache (shared across hook instances)
let memoryCache: CachedSettings | null = null;

// Global fetch lock to prevent concurrent fetches across hook instances
let globalFetchInProgress = false;
let globalFetchPromise: Promise<void> | null = null;

function getMemoryCache(userId: string): UserSettings | null {
  if (!memoryCache) return null;
  if (memoryCache.userId !== userId) {
    memoryCache = null;
    return null;
  }
  const age = Date.now() - memoryCache.timestamp;
  if (age > CACHE_TTL_MS) {
    memoryCache = null;
    return null;
  }
  return memoryCache.settings;
}

function setMemoryCache(userId: string, settings: UserSettings): void {
  memoryCache = {
    settings,
    timestamp: Date.now(),
    userId,
  };
}

function getLocalStorageCache(userId: string): UserSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const cached: CachedSettings = JSON.parse(raw);
    if (cached.userId !== userId) return null;
    // LocalStorage cache doesn't expire - it's for instant load
    // The memory cache handles freshness
    return cached.settings;
  } catch {
    return null;
  }
}

function setLocalStorageCache(userId: string, settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const cached: CachedSettings = {
      settings,
      timestamp: Date.now(),
      userId,
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore localStorage errors (quota, private mode, etc.)
  }
}

export function useSettings() {
  const { user } = useSupabaseAuth();
  const [settings, setSettings] = useState<UserSettings | null>(() => {
    // Try to load from caches immediately for instant UI
    if (typeof window === 'undefined' || !user?.id) return null;
    const memCached = getMemoryCache(user.id);
    if (memCached) return memCached;
    const lsCached = getLocalStorageCache(user.id);
    if (lsCached) return lsCached;
    return null;
  });
  
  // Changed: Don't block UI - show cached/default content immediately
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { toast } = useToast();
  const hasLoadedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Re-read cache on mount in case it was updated elsewhere
  useEffect(() => {
    mountedRef.current = true;
    if (user?.id) {
      const memCached = getMemoryCache(user.id);
      if (memCached && mountedRef.current) {
        setSettings(memCached);
      } else {
        const lsCached = getLocalStorageCache(user.id);
        if (lsCached && mountedRef.current) {
          setSettings(lsCached);
        }
      }
    }
    return () => { mountedRef.current = false; };
  }, [user?.id]);

  // Fetch settings - stable function with global lock to prevent race conditions
  const fetchSettings = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;
    
    // CRITICAL: Use global lock to prevent concurrent fetches across ALL hook instances
    // This prevents the infinite loop when multiple components use this hook
    if (globalFetchInProgress && globalFetchPromise) {
      // Wait for the existing fetch to complete
      await globalFetchPromise;
      return;
    }
    
    // Skip if we already loaded for this user and not forcing refresh
    if (hasLoadedRef.current && lastUserIdRef.current === user.id && !forceRefresh) {
      return;
    }
    
    // Check memory cache first
    const memCached = getMemoryCache(user.id);
    if (memCached && !forceRefresh) {
      setSettings(memCached);
      hasLoadedRef.current = true;
      lastUserIdRef.current = user.id;
      return;
    }
    
    // Try localStorage for instant display
    const lsCached = getLocalStorageCache(user.id);
    if (lsCached && !hasLoadedRef.current) {
      setSettings(lsCached);
      // Continue to fetch fresh data in background
    }
    
    // Set global lock BEFORE any async operations
    globalFetchInProgress = true;
    let resolveFetch: () => void;
    globalFetchPromise = new Promise<void>(resolve => { resolveFetch = resolve; });
    
    try {
      if (hasLoadedRef.current) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      
      const res = await apiFetch('/api/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();
      
      setSettings(data);
      setMemoryCache(user.id, data);
      setLocalStorageCache(user.id, data);
      hasLoadedRef.current = true;
      lastUserIdRef.current = user.id;
    } catch (error) {
      console.error(error);
      // Only show error if we have no cached data
      if (!hasLoadedRef.current) {
        toast({
          title: "Error loading settings",
          description: "Could not retrieve your preferences.",
          variant: "destructive"
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      globalFetchInProgress = false;
      globalFetchPromise = null;
      resolveFetch!();
    }
  // CRITICAL: Empty dependency array with refs for volatile values
  }, []); 

  // Only fetch when user ID changes - use ref to prevent re-fetch loops
  useEffect(() => {
    if (user?.id && user.id !== lastUserIdRef.current) {
      fetchSettings();
    }
  // CRITICAL: Don't include fetchSettings in deps - it's stable via empty deps
  }, [user?.id]);

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!user?.id) return;
    
    // Get current settings or use defaults
    const currentSettings = settings || DEFAULT_SETTINGS;
    
    try {
      // Optimistic update
      const optimisticSettings = { ...currentSettings, ...updates };
      setSettings(optimisticSettings);
      setMemoryCache(user.id, optimisticSettings as UserSettings);

      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      
      if (!res.ok) throw new Error('Failed to save settings');
      
      const newSettings = await res.json();
      setSettings(newSettings);
      setMemoryCache(user.id, newSettings);
      setLocalStorageCache(user.id, newSettings);
      
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Error saving settings",
        description: "Could not save your changes. Please try again.",
        variant: "destructive"
      });
      // Revert by re-fetching
      fetchSettings(true);
    }
  }, [user?.id, settings, toast, fetchSettings]);

  return {
    settings,
    isLoading,
    isRefreshing,
    updateSettings,
    refresh: () => fetchSettings(true)
  };
}
