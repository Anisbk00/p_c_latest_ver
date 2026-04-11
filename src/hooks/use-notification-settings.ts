/**
 * Notification Settings Hook
 * 
 * React hook for managing notification preferences and device registration.
 * 
 * @module hooks/use-notification-settings
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { notificationService, type NotificationPreferences } from '@/lib/notifications/service';

interface UseNotificationSettingsReturn {
  // State
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  error: string | null;
  isUpdating: boolean;

  // Actions
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<boolean>;
  enableNotifications: () => Promise<boolean>;
  disableNotifications: () => Promise<boolean>;
  setQuietHours: (start: string, end: string) => Promise<boolean>;
  refreshPreferences: () => Promise<void>;
}

export function useNotificationSettings(): UseNotificationSettingsReturn {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPreferences = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await notificationService.getPreferences();

    if (result.error) {
      setError(result.error);
    } else {
      setPreferences(result.preferences);
    }

    setIsLoading(false);
  }, []);

  // Fetch preferences on mount
  useEffect(() => {
    void refreshPreferences(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const updatePreferences = useCallback(async (
    updates: Partial<NotificationPreferences>
  ): Promise<boolean> => {
    setIsUpdating(true);
    setError(null);

    const result = await notificationService.updatePreferences(updates);

    if (result.success) {
      setPreferences((prev) => prev ? { ...prev, ...updates } : null);
      setIsUpdating(false);
      return true;
    } else {
      setError(result.error || 'Failed to update preferences');
      setIsUpdating(false);
      return false;
    }
  }, []);

  const enableNotifications = useCallback(async (): Promise<boolean> => {
    return updatePreferences({ notifications_enabled: true });
  }, [updatePreferences]);

  const disableNotifications = useCallback(async (): Promise<boolean> => {
    return updatePreferences({ notifications_enabled: false });
  }, [updatePreferences]);

  const setQuietHours = useCallback(async (start: string, end: string): Promise<boolean> => {
    return updatePreferences({
      quiet_hours_start: start,
      quiet_hours_end: end,
    });
  }, [updatePreferences]);

  return {
    preferences,
    isLoading,
    error,
    isUpdating,
    updatePreferences,
    enableNotifications,
    disableNotifications,
    setQuietHours,
    refreshPreferences,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Permission Hook (for Web)
// ═══════════════════════════════════════════════════════════════════════════════

interface UseNotificationPermissionReturn {
  permission: NotificationPermission;
  isSupported: boolean;
  requestPermission: () => Promise<boolean>;
}

export function useNotificationPermission(): UseNotificationPermissionReturn {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (isSupported) {
      return Notification.permission;
    }
    return 'default';
  });

  useEffect(() => {
    if (!isSupported) return;

    // Update permission if it changes externally
    const handleChange = () => {
      setPermission(Notification.permission);
    };
    
    // Use Permission API change event if available (more efficient)
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' }).then((status) => {
        status.addEventListener('change', handleChange);
        return () => status.removeEventListener('change', handleChange);
      }).catch(() => {
        // Fallback: only poll when tab is visible
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            handleChange();
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
      });
    } else {
      // Fallback: check on visibility change instead of polling
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          handleChange();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, [isSupported]);

  return { permission, isSupported, requestPermission };
}
