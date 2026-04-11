'use client';

import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { NotificationCenter, NotificationBadge } from '@/components/notifications/notification-center';
import { apiFetch } from '@/lib/mobile-api';
import type { Notification } from '@/lib/notifications/notification-types';

// ═══════════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════════

interface NotificationContextValue {
  unreadCount: number;
  openNotificationCenter: () => void;
  closeNotificationCenter: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  openNotificationCenter: () => {},
  closeNotificationCenter: () => {},
});

export function useNotificationContext() {
  return useContext(NotificationContext);
}

// ═══════════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════════

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Use a ref for the polling interval so we can stop/start it cleanly
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start polling for unread count (includes an immediate first fetch)
  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // already running
    pollingRef.current = setInterval(() => {
      apiFetch('/api/notifications?limit=1')
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setUnreadCount(data.unreadCount || 0); })
        .catch(() => {});
    }, 60000);
  }, []);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Start polling on mount, stop on unmount.
  // When the panel closes, refetch the count by restarting polling.
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [isOpen, startPolling, stopPolling]);

  // Fetch unread count immediately on mount for first paint
  useEffect(() => {
    apiFetch('/api/notifications?limit=1')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setUnreadCount(data.unreadCount || 0); })
      .catch(() => {});
  }, []);

  // Handle notification click – navigate to deep link if present
  const handleNotificationClick = useCallback((notification: Notification) => {
    if (notification.deep_link) {
      window.location.href = notification.deep_link;
    }
    setIsOpen(false);
  }, []);

  const openNotificationCenter = useCallback(() => setIsOpen(true), []);
  const closeNotificationCenter = useCallback(() => setIsOpen(false), []);

  return (
    <NotificationContext.Provider value={{ unreadCount, openNotificationCenter, closeNotificationCenter }}>
      {children}
      <NotificationCenter
        isOpen={isOpen}
        onClose={closeNotificationCenter}
        onNotificationClick={handleNotificationClick}
      />
    </NotificationContext.Provider>
  );
}
