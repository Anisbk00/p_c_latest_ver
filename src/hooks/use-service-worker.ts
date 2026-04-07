/**
 * Service Worker Registration
 * 
 * Registers and manages the service worker for offline functionality.
 * 
 * @module hooks/use-service-worker
 */

'use client';

import { useEffect, useCallback, useState } from 'react';

interface ServiceWorkerStatus {
  isRegistered: boolean;
  isUpdateAvailable: boolean;
  registration: ServiceWorkerRegistration | null;
  error: string | null;
  update: () => Promise<void>;
  unregister: () => Promise<void>;
}

export function useServiceWorker(): ServiceWorkerStatus {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Register service worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[SW] Service workers not supported');
      return;
    }

    const registerSW = async () => {
      try {
        console.log('[SW] Registering service worker...');

        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none', // Always check for SW updates
        });

        setRegistration(reg);
        setIsRegistered(true);
        console.log('[SW] Service worker registered');

        // Force check for updates immediately
        reg.update().catch(() => {});

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] Update available, activating immediately...');
                // Auto-activate the new service worker
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                setIsUpdateAvailable(true);
              }
            });
          }
        });

        // Check for existing waiting worker
        if (reg.waiting) {
          console.log('[SW] Found waiting worker, activating...');
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setIsUpdateAvailable(true);
        }

        // Handle messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          const { type, payload } = event.data || {};
          
          switch (type) {
            case 'QUEUE_MUTATION':
              console.log('[SW] Mutation queued:', payload);
              // The sync provider will handle this
              break;

            case 'PROCESS_SYNC_QUEUE':
              console.log('[SW] Sync queue processing requested');
              // Dispatch custom event for sync provider
              window.dispatchEvent(new CustomEvent('sw:sync-request'));
              break;
          }
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to register service worker';
        setError(message);
        console.error('[SW] Registration failed:', err);
      }
    };

    // Register after page load
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
    }

    return () => {
      window.removeEventListener('load', registerSW);
    };
  }, []);

  // Update service worker
  const update = useCallback(async () => {
    if (!registration) return;

    try {
      if (registration.waiting) {
        // Tell the waiting worker to activate
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        setIsUpdateAvailable(false);
      } else {
        // Check for updates
        await registration.update();
      }
    } catch (err) {
      console.error('[SW] Update failed:', err);
    }
  }, [registration]);

  // Unregister service worker
  const unregister = useCallback(async () => {
    if (!registration) return;

    try {
      await registration.unregister();
      setIsRegistered(false);
      setRegistration(null);
      console.log('[SW] Service worker unregistered');
    } catch (err) {
      console.error('[SW] Unregister failed:', err);
    }
  }, [registration]);

  // Handle controller change (new version activated)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleControllerChange = () => {
      console.log('[SW] New controller activated, reloading...');
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return {
    isRegistered,
    isUpdateAvailable,
    registration,
    error,
    update,
    unregister,
  };
}
