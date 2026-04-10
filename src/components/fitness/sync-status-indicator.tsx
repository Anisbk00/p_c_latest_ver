"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SyncStatus } from "@/lib/offline-storage";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface SyncStatusIndicatorProps {
  isOnline: boolean;
  syncStatus: SyncStatus;
  isSyncing: boolean;
  onSyncNow: () => void;
  onRetryFailed?: () => void;
  onClearSynced?: () => void;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function SyncStatusIndicator({
  isOnline,
  syncStatus,
  isSyncing,
  onSyncNow,
  onRetryFailed,
  onClearSynced,
  compact = false,
}: SyncStatusIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { pending, syncing, synced, failed, lastSyncAt } = syncStatus;
  const hasPending = pending > 0 || failed > 0;

  // Determine status
  const getStatus = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="w-4 h-4" />,
        label: "Offline",
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        description: "Workouts will be saved locally",
      };
    }
    if (isSyncing || syncing > 0) {
      return {
        icon: <RefreshCw className="w-4 h-4 animate-spin" />,
        label: "Syncing",
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        description: `Syncing ${syncing} workout${syncing > 1 ? "s" : ""}...`,
      };
    }
    if (failed > 0) {
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        label: "Sync Failed",
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        description: `${failed} workout${failed > 1 ? "s" : ""} failed to sync`,
      };
    }
    if (pending > 0) {
      return {
        icon: <Clock className="w-4 h-4" />,
        label: "Pending",
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        description: `${pending} workout${pending > 1 ? "s" : ""} waiting to sync`,
      };
    }
    if (lastSyncAt) {
      const timeSince = Date.now() - lastSyncAt;
      const minutes = Math.floor(timeSince / 60000);
      const hours = Math.floor(minutes / 60);
      
      const timeLabel = hours > 0 
        ? `${hours}h ago` 
        : minutes > 0 
          ? `${minutes}m ago` 
          : "just now";
      
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        label: "Synced",
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
        description: `Last sync ${timeLabel}`,
      };
    }
    
    return {
      icon: <Wifi className="w-4 h-4" />,
      label: "Online",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      description: "All synced",
    };
  };

  const status = getStatus();

  // Compact mode - just show icon badge
  if (compact) {
    return (
      <motion.button
        onClick={hasPending && isOnline ? onSyncNow : undefined}
        disabled={!hasPending || !isOnline || isSyncing}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors",
          status.bgColor,
          status.color,
          hasPending && isOnline && "hover:opacity-80 cursor-pointer",
          !hasPending && "cursor-default"
        )}
        whileTap={hasPending && isOnline ? { scale: 0.95 } : {}}
      >
        {status.icon}
        <span>{status.label}</span>
        {(pending > 0 || failed > 0) && (
          <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
            {pending + failed}
          </Badge>
        )}
      </motion.button>
    );
  }

  // Full mode
  return (
    <div className="rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", status.bgColor, status.color)}>
            {status.icon}
          </div>
          <div>
            <p className={cn("font-medium", status.color)}>{status.label}</p>
            <p className="text-xs text-muted-foreground">{status.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {(pending > 0 || synced > 0 || failed > 0) && (
            <div className="flex gap-1">
              {pending > 0 && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-[10px]">
                  {pending} pending
                </Badge>
              )}
              {synced > 0 && (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-[10px]">
                  {synced} synced
                </Badge>
              )}
              {failed > 0 && (
                <Badge variant="secondary" className="bg-red-500/10 text-red-600 text-[10px]">
                  {failed} failed
                </Badge>
              )}
            </div>
          )}
          
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/30"
          >
            <div className="p-4 space-y-4">
              {/* Status Grid */}
              <div className="grid grid-cols-4 gap-3">
                <StatusCard
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Pending"
                  value={pending}
                  color="text-amber-500"
                />
                <StatusCard
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  label="Syncing"
                  value={syncing}
                  color="text-blue-500"
                />
                <StatusCard
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                  label="Synced"
                  value={synced}
                  color="text-emerald-500"
                />
                <StatusCard
                  icon={<AlertCircle className="w-3.5 h-3.5" />}
                  label="Failed"
                  value={failed}
                  color="text-red-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {hasPending && isOnline && (
                  <Button
                    onClick={onSyncNow}
                    disabled={isSyncing}
                    size="sm"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4 mr-2" />
                        Sync Now
                      </>
                    )}
                  </Button>
                )}
                
                {failed > 0 && onRetryFailed && (
                  <Button
                    onClick={onRetryFailed}
                    disabled={isSyncing}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Failed
                  </Button>
                )}
                
                {synced > 0 && onClearSynced && (
                  <Button
                    onClick={onClearSynced}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Synced
                  </Button>
                )}
              </div>

              {/* Offline Notice */}
              {!isOnline && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-600 text-sm">
                  <CloudOff className="w-4 h-4 flex-shrink-0" />
                  <p>
                    You're offline. Workouts will be saved locally and synced when you reconnect.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════

function StatusCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center p-2 rounded-xl bg-muted/30">
      <div className={cn("mb-1", color)}>{icon}</div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Mini Badge for Navigation
// ═══════════════════════════════════════════════════════════════

export function SyncMiniBadge({
  isOnline,
  pendingCount,
  isSyncing,
}: {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
}) {
  if (!isOnline) {
    return (
      <div className="w-2 h-2 rounded-full bg-amber-500" title="Offline" />
    );
  }
  
  if (isSyncing) {
    return (
      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Syncing" />
    );
  }
  
  if (pendingCount > 0) {
    return (
      <div className="w-2 h-2 rounded-full bg-amber-500" title={`${pendingCount} pending`} />
    );
  }
  
  return (
    <div className="w-2 h-2 rounded-full bg-emerald-500" title="Synced" />
  );
}
