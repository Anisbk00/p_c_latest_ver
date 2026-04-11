"use client";

/**
 * Notification Center Component
 * 
 * A unified notification center for viewing and managing notifications
 * 
 * @module components/notifications/notification-center
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getClient } from '@/lib/supabase/client';
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronRight,
  Dumbbell,
  Flame,
  Target,
  Trophy,
  Utensils,
  Droplets,
  Zap,
  MessageSquare,
  Calendar,
  X,
  Loader2,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/mobile-api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import type {
  Notification,
  NotificationType,
} from '@/lib/notifications/notification-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════════════════

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationClick?: (notification: Notification) => void;
  onSettingsClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Icon Mapping
// ═══════════════════════════════════════════════════════════════════════════════

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  workout_reminder: Dumbbell,
  meal_reminder: Utensils,
  streak_protection: Flame,
  achievement: Trophy,
  goal_progress: Target,
  coach_insight: MessageSquare,
  habit_reinforcement: Zap,
  daily_summary: Calendar,
  hydration_reminder: Droplets,
  motivational: Flame,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  workout_reminder: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
  meal_reminder: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30',
  streak_protection: 'text-red-500 bg-red-50 dark:bg-red-950/30',
  achievement: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
  goal_progress: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30',
  coach_insight: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30',
  habit_reinforcement: 'text-teal-500 bg-teal-50 dark:bg-teal-950/30',
  daily_summary: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30',
  hydration_reminder: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-950/30',
  motivational: 'text-pink-500 bg-pink-50 dark:bg-pink-950/30',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Item Component
// ═══════════════════════════════════════════════════════════════════════════════

function NotificationItem({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
  const colorClass = NOTIFICATION_COLORS[notification.type] || 'text-gray-500 bg-gray-50';
  const isRead = ['opened', 'actioned', 'dismissed'].includes(notification.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        'group relative flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer',
        isRead
          ? 'bg-background border-border hover:bg-muted/50'
          : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
      )}
      onClick={onClick}
    >
      {/* Icon */}
      <div className={cn('flex-shrink-0 p-2 rounded-lg', colorClass)}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'font-medium text-sm',
            isRead ? 'text-muted-foreground' : 'text-foreground'
          )}>
            {notification.title}
          </p>
          {!isRead && (
            <span className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-primary" />
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {notification.body}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>

      {/* Action indicator */}
      {notification.deep_link && (
        <ChevronRight className="flex-shrink-0 w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Notification Center Component
// ═══════════════════════════════════════════════════════════════════════════════

export function NotificationCenter({
  isOpen,
  onClose,
  onNotificationClick,
  onSettingsClick,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // P0 FIX: Track subscription cleanup to prevent memory leaks
  const subscriptionRef = useRef<(() => void) | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiFetch('/api/notifications?limit=50');
      if (!response.ok) throw new Error('Failed to fetch notifications');

      const data = await response.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('[NotificationCenter] Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // P0 FIX: Setup realtime subscription with proper cleanup
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      
      // Setup realtime subscription for new notifications
      const supabase = getClient();
      
      // Get current user and subscribe
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        
        const channel = supabase
          .channel(`notifications:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              // Add new notification to the top of the list
              const newNotification = payload.new as Notification;
              setNotifications(prev => [newNotification, ...prev]);
              setUnreadCount(prev => prev + 1);
            }
          )
          .subscribe();
        
        // Store cleanup function
        subscriptionRef.current = () => {
          supabase.removeChannel(channel);
        };
      });
      
      // Cleanup on unmount or when isOpen changes to false
      return () => {
        if (subscriptionRef.current) {
          subscriptionRef.current();
          subscriptionRef.current = null;
        }
      };
    }
  }, [isOpen, fetchNotifications]);

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      const response = await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to mark all as read');

      setNotifications(prev =>
        prev.map(n => ({ ...n, status: 'opened' as const }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('[NotificationCenter] Error marking all as read:', err);
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    try {
      // Mark as opened
      await apiFetch(`/api/notifications/${notification.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open' }),
      });

      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.id === notification.id ? { ...n, status: 'opened' as const } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));

      // Call callback
      onNotificationClick?.(notification);
    } catch (err) {
      console.error('[NotificationCenter] Error handling notification click:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-background border-l shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Bell className="w-6 h-6" />
                  {unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Notifications</h2>
                  <p className="text-sm text-muted-foreground">
                    {unreadCount > 0
                      ? `${unreadCount} unread`
                      : 'All caught up!'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkAllRead}
                    className="text-xs"
                  >
                    <CheckCheck className="w-4 h-4 mr-1" />
                    Mark all read
                  </Button>
                )}
                {onSettingsClick && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onSettingsClick}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="h-[calc(100vh-80px)]">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <BellOff className="w-8 h-8 text-muted-foreground" />
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={fetchNotifications}>
                  Try again
                </Button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="p-4 rounded-full bg-muted">
                  <Bell className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No notifications yet</p>
                <p className="text-sm text-muted-foreground/70">
                  We&apos;ll notify you when something important happens
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <AnimatePresence mode="popLayout">
                  {notifications.map(notification => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onClick={() => handleNotificationClick(notification)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Badge Component (for header/navbar)
// ═══════════════════════════════════════════════════════════════════════════════

export function NotificationBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-full hover:bg-muted transition-colors"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
    >
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full"
        >
          {count > 99 ? '99+' : count}
        </motion.span>
      )}
    </button>
  );
}

export default NotificationCenter;
