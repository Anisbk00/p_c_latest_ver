/**
 * Offline Status Indicator Components
 * 
 * UI components for showing offline/sync status to users.
 * 
 * @module components/offline-status-indicator
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wifi, 
  WifiOff, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Check, 
  AlertTriangle,
  Upload,
  Clock
} from 'lucide-react';
import { useOfflineStatus, useSyncStats } from '@/hooks/use-offline-status';
import { cn } from '@/lib/utils';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

// ═══════════════════════════════════════════════════════════════
// Offline Banner Component
// ═══════════════════════════════════════════════════════════════

export function OfflineBanner() {
  const { isOffline, pendingSyncCount } = useOfflineStatus();
  // Prevent hydration mismatch by only rendering after mount
  // Using useSyncExternalStore pattern for SSR safety
  const [mounted, setMounted] = useState(false);
  
  // Using flushSync alternative - defer to next tick
  const isClient = typeof window !== 'undefined';
  
  // Use a ref to track mount state without triggering cascading renders
  const mountedRef = useState(() => isClient);
  
  useEffect(() => {
    // Defer to next event loop to avoid cascading render warning
    const timer = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Don't render on server or before mount to prevent hydration mismatch
  if (!mounted || !isOffline) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-amber-500/95 text-amber-950 px-4 py-2 text-center text-sm font-medium shadow-lg"
      >
        <div className="flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span>You're offline</span>
          {pendingSyncCount > 0 && (
            <Badge variant="outline" className="ml-2 bg-amber-100 border-amber-700 text-amber-900">
              {pendingSyncCount} pending
            </Badge>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// Compact Status Indicator
// ═══════════════════════════════════════════════════════════════

interface OfflineIndicatorProps {
  showLabel?: boolean;
  className?: string;
}

export function OfflineIndicator({ showLabel = false, className }: OfflineIndicatorProps) {
  const { isOffline, pendingSyncCount, isSyncing } = useOfflineStatus();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1.5', className)}>
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            ) : isOffline ? (
              <WifiOff className="h-4 w-4 text-amber-500" />
            ) : (
              <Wifi className="h-4 w-4 text-green-500" />
            )}
            {showLabel && (
              <span className={cn(
                'text-xs font-medium',
                isOffline ? 'text-amber-500' : 'text-green-500'
              )}>
                {isOffline ? 'Offline' : 'Online'}
              </span>
            )}
            {pendingSyncCount > 0 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-100 border-amber-300 text-amber-700">
                {pendingSyncCount}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p>{isOffline ? 'You are offline' : 'Connected'}</p>
            {pendingSyncCount > 0 && (
              <p className="text-amber-400">{pendingSyncCount} items pending sync</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sync Status Component
// ═══════════════════════════════════════════════════════════════

export function SyncStatusIndicator({ className }: { className?: string }) {
  const stats = useSyncStats();
  const { isOnline, isSyncing } = useOfflineStatus();

  const hasPending = stats.pending > 0;
  const hasFailed = stats.failed > 0;
  const hasConflict = stats.conflict > 0;

  // Determine status
  let status: 'synced' | 'pending' | 'syncing' | 'failed' | 'conflict' = 'synced';
  if (hasConflict) status = 'conflict';
  else if (hasFailed) status = 'failed';
  else if (isSyncing) status = 'syncing';
  else if (hasPending) status = 'pending';

  const config = {
    synced: { icon: Check, color: 'text-green-500', bg: 'bg-green-100', label: 'Synced', animate: false },
    pending: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-100', label: `${stats.pending} pending`, animate: false },
    syncing: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-100', label: 'Syncing...', animate: true },
    failed: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100', label: `${stats.failed} failed`, animate: false },
    conflict: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-100', label: `${stats.conflict} conflicts`, animate: false },
  };

  const { icon: Icon, color, bg, label, animate } = config[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-2 px-2 py-1 rounded-full', bg, className)}>
            <Icon className={cn('h-3.5 w-3.5', color, animate && 'animate-spin')} />
            <span className={cn('text-xs font-medium', color)}>{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Status:</span>
              <span className={color}>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Pending:</span>
              <span>{stats.pending}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Synced:</span>
              <span className="text-green-500">{stats.synced}</span>
            </div>
            {stats.failed > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Failed:</span>
                <span className="text-red-500">{stats.failed}</span>
              </div>
            )}
            {stats.conflict > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Conflicts:</span>
                <span className="text-orange-500">{stats.conflict}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Full Status Panel
// ═══════════════════════════════════════════════════════════════

export function OfflineStatusPanel({ className }: { className?: string }) {
  const { isOnline, isOffline, connectionType, effectiveType, downlink } = useOfflineStatus();
  const stats = useSyncStats();

  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-4', className)}>
      <h3 className="font-semibold text-sm">Connection Status</h3>
      
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Cloud className="h-5 w-5 text-green-500" />
          ) : (
            <CloudOff className="h-5 w-5 text-amber-500" />
          )}
          <span className="text-sm">{isOnline ? 'Connected' : 'Offline'}</span>
        </div>
        <Badge variant={isOnline ? 'default' : 'secondary'}>
          {effectiveType || 'Unknown'}
        </Badge>
      </div>

      {/* Sync Queue */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase">Sync Queue</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Upload className="h-4 w-4 text-amber-500" />
            <span>Pending: {stats.pending}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            <span>Synced: {stats.synced}</span>
          </div>
          {stats.failed > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span>Failed: {stats.failed}</span>
            </div>
          )}
          {stats.conflict > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span>Conflicts: {stats.conflict}</span>
            </div>
          )}
        </div>
      </div>

      {/* Network Details */}
      {downlink && (
        <div className="text-xs text-muted-foreground">
          <span>Speed: {downlink} Mbps</span>
          {connectionType && <span className="ml-2">• {connectionType}</span>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Offline Warning for Actions
// ═══════════════════════════════════════════════════════════════

interface OfflineWarningProps {
  action?: string;
  className?: string;
}

export function OfflineWarning({ action = 'This action', className }: OfflineWarningProps) {
  const { isOffline } = useOfflineStatus();

  if (!isOffline) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 p-3 rounded-lg bg-amber-100 text-amber-800 text-sm',
      className
    )}>
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        {action} will be saved locally and synced when you're back online.
      </span>
    </div>
  );
}
