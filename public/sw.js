/**
 * Progress Companion — Service Worker v14
 * 
 * Enhanced offline-first service worker with:
 * - Cache-first for static assets
 * - Network-first for API calls
 * - Background sync for offline mutations
 * - Push notification support
 * 
 * @version 14.0.0
 */

const CACHE_NAME = 'progress-companion-v14';
const OFFLINE_URL = '/offline.html';
const SYNC_TAG = 'sync-offline-data';

// Static assets to pre-cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/logo.svg',
];

// API endpoints that should NEVER be cached (auth-sensitive or user-specific)
// Entries ending with '/' use prefix matching; others use exact or prefix-with-slash matching
// to avoid false positives (e.g. /api/export must not match /api/export-pdf).
const NEVER_CACHE_API = [
  '/api/profile',
  '/api/user',
  '/api/auth',
  '/api/signin',
  '/api/signout',
  '/api/signup',
  // Nutrition endpoints — contain user-specific food logs and meals
  '/api/food-log',
  '/api/food-logs',
  '/api/meals',
  '/api/barcode-lookup',
  '/api/analyze-food-photo',
  '/api/ai/nutrition',
  '/api/ai/feedback',
  '/api/supplement-log',
  // User-specific analytics
  '/api/analytics',
  '/api/insights',
  '/api/targets',
  '/api/notifications',
  // User photos, health data, and measurements (PII)
  '/api/progress-photos',
  '/api/body-composition',
  '/api/measurements',
  '/api/user/avatar',
  // User setup data (prefix match)
  '/api/setup/',
  // User data export (PII)
  '/api/export',
  // Settings and account
  '/api/settings',
];

// API endpoints that can be cached for offline use (public/global data only)
const CACHEABLE_API = [
  '/api/foods/global',   // Global food database (read-only public data)
];

// ═══════════════════════════════════════════════════════════════
// Install Event
// ═══════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v14');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to pre-cache:', url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ═══════════════════════════════════════════════════════════════
// Activate Event
// ═══════════════════════════════════════════════════════════════

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v14');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// ═══════════════════════════════════════════════════════════════
// Fetch Event
// ═══════════════════════════════════════════════════════════════

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip chrome-extension, chrome-error, and other non-http requests
  if (!url.protocol.startsWith('http')) return;

  // Skip requests from error pages (chrome-error://)
  if (request.mode === 'navigate' && event.clientId) {
    // Will be handled by handleNavigationRequest
  }

  // Skip non-GET requests for caching (mutations are handled separately)
  if (request.method !== 'GET') {
    // For POST/PUT/DELETE requests, try network first, queue if offline
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(handleMutation(request));
    }
    return;
  }

  // API routes: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request, url));
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Static assets: cache-first
  event.respondWith(handleStaticRequest(request));
});

// ═══════════════════════════════════════════════════════════════
// Request Handlers
// ═══════════════════════════════════════════════════════════════

/**
 * Handle API GET requests - Network first, cache fallback
 */
async function handleApiRequest(request, url) {
  // Path-boundary-aware matching: entries ending with '/' use prefix matching,
  // others require exact match or prefix followed by '/' to avoid false positives
  // (e.g. /api/export must not block /api/export-pdf).
  const shouldCache = !NEVER_CACHE_API.some((p) => {
    if (p.endsWith('/')) {
      return url.pathname.startsWith(p);
    }
    return url.pathname === p || url.pathname.startsWith(p + '/');
  });

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.status === 200 && shouldCache) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, clone).catch(() => {});
      });
    }

    return response;
  } catch (error) {
    // Network failed - try cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving API from cache:', url.pathname);
      return cached;
    }

    // Return offline response
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'You are offline. Data will sync when connection is restored.',
        data: null,
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Served-By': 'ServiceWorker-Offline',
        },
      }
    );
  }
}

/**
 * Handle navigation requests - Network first with offline page fallback
 */
async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);

    // Cache successful page responses
    if (response.status === 200) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, clone).catch(() => {});
      });
    }

    return response;
  } catch (error) {
    // Try cached version
    const cached = await caches.match(request);
    if (cached) return cached;

    // Try root page
    const root = await caches.match('/');
    if (root) return root;

    // Fall back to offline page
    return caches.match(OFFLINE_URL);
  }
}

/**
 * Handle static asset requests - Cache first
 */
async function handleStaticRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.status === 200 && response.type === 'basic') {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, clone).catch(() => {});
      });
    }

    return response;
  } catch (error) {
    // Return empty response for images
    if (request.destination === 'image') {
      return new Response('', { status: 404 });
    }
    return new Response('', { status: 503 });
  }
}

/**
 * Handle mutation requests (POST/PUT/DELETE)
 * Queues requests when offline for background sync
 */
async function handleMutation(request) {
  try {
    // Try network first
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Network failed - queue for background sync
    console.log('[SW] Mutation failed, queuing for sync:', request.url);

    // Store the request for later sync
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: await request.text(),
      timestamp: Date.now(),
    };

    // Store in IndexedDB via postMessage to main thread
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'QUEUE_MUTATION',
        payload: requestData,
      });
    });

    // Register background sync
    if ('sync' in self.registration) {
      await self.registration.sync.register(SYNC_TAG);
    }

    // Return optimistic response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Request queued. Will sync when online.',
        queued: true,
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Background Sync
// ═══════════════════════════════════════════════════════════════

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      (async () => {
        // Notify all clients to process sync queue
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({
            type: 'PROCESS_SYNC_QUEUE',
          });
        });
      })()
    );
  }
});

// ═══════════════════════════════════════════════════════════════
// Push Notifications
// ═══════════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Time to check your fitness goals!',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: data.tag || 'fitness-reminder',
    data: data.data || {},
    actions: data.actions || [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    vibrate: [100, 50, 100],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Progress Companion', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  // Open the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// ═══════════════════════════════════════════════════════════════
// Message Handler
// ═══════════════════════════════════════════════════════════════

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: CACHE_NAME });
      break;

    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
      break;

    case 'CACHE_URLS':
      if (payload?.urls) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.addAll(payload.urls).then(() => {
            event.ports[0]?.postMessage({ success: true });
          });
        });
      }
      break;
  }
});

console.log('[SW] Service worker loaded - v14');
