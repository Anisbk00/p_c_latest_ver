/**
 * Offline Map Tile Caching Service
 * Downloads and caches map tiles for offline use
 * Uses IndexedDB for persistent storage
 * 
 * UPDATED: Uses multiple fast CDN-backed tile servers
 * Updated: 2025-01-20
 */

const DB_NAME = 'progress-companion-maps';
const DB_VERSION = 1;
const TILES_STORE = 'map-tiles';

// Multiple tile servers for redundancy and speed
// CartoDB is fast and free (no API key needed)
const TILE_SERVERS = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager',  // Fast, beautiful
  'https://b.basemaps.cartocdn.com/rastertiles/voyager',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager',
  'https://d.basemaps.cartocdn.com/rastertiles/voyager',
];

// Fallback to OSM (slower but reliable)
const FALLBACK_SERVER = 'https://tile.openstreetmap.org';

// Active server (round-robin)
let serverIndex = 0;

// Cache settings
const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_TILES_IN_CACHE = 2000; // Increased for better coverage

// Pre-fetch radius (in tiles around current position)
const PREFETCH_RADIUS = 2;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MapTile {
  key: string;        // z-x-y format
  z: number;          // zoom level
  x: number;          // tile x coordinate
  y: number;          // tile y coordinate
  blob: Blob;         // tile image data
  cachedAt: number;   // timestamp when cached
  lastAccessed: number;
  size: number;       // bytes
}

export interface TileBounds {
  minZoom: number;
  maxZoom: number;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface CacheStats {
  tileCount: number;
  totalSize: number;
  oldestTile: number | null;
  newestTile: number | null;
}

export interface DownloadProgress {
  total: number;
  downloaded: number;
  failed: number;
  currentTile: string;
  percentComplete: number;
}

// Database instance
let dbInstance: IDBDatabase | null = null;

// ═══════════════════════════════════════════════════════════════
// DATABASE INITIALIZATION
// ═══════════════════════════════════════════════════════════════

export function initMapDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      resolve({} as IDBDatabase);
      return;
    }

    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open map tiles database'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(TILES_STORE)) {
        const store = db.createObjectStore(TILES_STORE, { keyPath: 'key' });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
        store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// TILE KEY UTILITIES
// ═══════════════════════════════════════════════════════════════

export function tileKey(z: number, x: number, y: number): string {
  return `${z}-${x}-${y}`;
}

export function parseTileKey(key: string): { z: number; x: number; y: number } | null {
  const parts = key.split('-');
  if (parts.length !== 3) return null;
  return {
    z: parseInt(parts[0], 10),
    x: parseInt(parts[1], 10),
    y: parseInt(parts[2], 10),
  };
}

// ═══════════════════════════════════════════════════════════════
// COORDINATE CONVERSION
// ═══════════════════════════════════════════════════════════════

/**
 * Convert latitude/longitude to tile coordinates
 */
export function latLonToTile(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number; tileX: number; tileY: number } {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

  return {
    x,
    y,
    tileX: Math.floor(x),
    tileY: Math.floor(y),
  };
}

/**
 * Convert tile coordinates to latitude/longitude (northwest corner)
 */
export function tileToLatLon(
  z: number,
  x: number,
  y: number
): { north: number; south: number; east: number; west: number } {
  const n = Math.pow(2, z);
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;

  return { north, south, east, west };
}

/**
 * Get all tiles needed for a given bounding box and zoom range
 */
export function getTilesForBounds(bounds: TileBounds): { z: number; x: number; y: number }[] {
  const tiles: { z: number; x: number; y: number }[] = [];

  for (let z = bounds.minZoom; z <= bounds.maxZoom; z++) {
    const nw = latLonToTile(bounds.bounds.north, bounds.bounds.west, z);
    const se = latLonToTile(bounds.bounds.south, bounds.bounds.east, z);

    const minX = Math.max(0, nw.tileX);
    const maxX = Math.min(Math.pow(2, z) - 1, se.tileX);
    const minY = Math.max(0, se.tileY);
    const maxY = Math.min(Math.pow(2, z) - 1, nw.tileY);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({ z, x, y });
      }
    }
  }

  return tiles;
}

// ═══════════════════════════════════════════════════════════════
// TILE CACHING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get a cached tile from IndexedDB
 */
export async function getCachedTile(z: number, x: number, y: number): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;

  const db = await initMapDatabase();
  const key = tileKey(z, x, y);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TILES_STORE], 'readwrite');
    const store = transaction.objectStore(TILES_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      const tile = request.result as MapTile | undefined;
      if (tile) {
        // Update last accessed time
        tile.lastAccessed = Date.now();
        store.put(tile);
        resolve(tile.blob);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to get cached tile'));
    };
  });
}

/**
 * Store a tile in the cache
 */
export async function cacheTile(z: number, x: number, y: number, blob: Blob): Promise<void> {
  if (typeof window === 'undefined') return;

  const db = await initMapDatabase();
  const key = tileKey(z, x, y);
  const now = Date.now();

  const tile: MapTile = {
    key,
    z,
    x,
    y,
    blob,
    cachedAt: now,
    lastAccessed: now,
    size: blob.size,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TILES_STORE], 'readwrite');
    const store = transaction.objectStore(TILES_STORE);
    const request = store.put(tile);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to cache tile'));
  });
}

/**
 * Get the next fast tile server (round-robin for load balancing)
 */
function getNextServer(): string {
  const server = TILE_SERVERS[serverIndex];
  serverIndex = (serverIndex + 1) % TILE_SERVERS.length;
  return server;
}

/**
 * Download a single tile from the server
 * Tries fast CDN servers first, falls back to OSM
 */
export async function downloadTile(
  z: number,
  x: number,
  y: number
): Promise<Blob> {
  // Try fast CDN servers first
  for (let attempt = 0; attempt < TILE_SERVERS.length; attempt++) {
    const server = getNextServer();
    const url = `${server}/${z}/${x}/${y}.png`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout per server
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'image/png',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response.blob();
      }
    } catch {
      // Try next server
      continue;
    }
  }
  
  // Fallback to OSM
  const fallbackUrl = `${FALLBACK_SERVER}/${z}/${x}/${y}.png`;
  const response = await fetch(fallbackUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to download tile ${z}/${x}/${y}`);
  }
  
  return response.blob();
}

/**
 * Get a tile - first check cache, then download if needed
 */
export async function getTile(
  z: number,
  x: number,
  y: number
): Promise<{ blob: Blob; fromCache: boolean }> {
  // Check cache first
  const cached = await getCachedTile(z, x, y);
  if (cached) {
    return { blob: cached, fromCache: true };
  }

  // Download and cache
  const blob = await downloadTile(z, x, y);
  await cacheTile(z, x, y, blob);
  return { blob, fromCache: false };
}

/**
 * Download and cache tiles for a region
 */
export async function downloadTilesForRegion(
  bounds: TileBounds,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: number; failed: number; errors: string[] }> {
  const tiles = getTilesForBounds(bounds);
  const result = { success: 0, failed: 0, errors: [] as string[] };

  for (let i = 0; i < tiles.length; i++) {
    const { z, x, y } = tiles[i];

    try {
      // Check if already cached
      const cached = await getCachedTile(z, x, y);
      if (!cached) {
        const blob = await downloadTile(z, x, y);
        await cacheTile(z, x, y, blob);
      }
      result.success++;

      onProgress?.({
        total: tiles.length,
        downloaded: i + 1,
        failed: result.failed,
        currentTile: tileKey(z, x, y),
        percentComplete: Math.round(((i + 1) / tiles.length) * 100),
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      result.failed++;
      result.errors.push(`Tile ${tileKey(z, x, y)}: ${error}`);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  if (typeof window === 'undefined') {
    return { tileCount: 0, totalSize: 0, oldestTile: null, newestTile: null };
  }

  const db = await initMapDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TILES_STORE], 'readonly');
    const store = transaction.objectStore(TILES_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const tiles = request.result as MapTile[];
      const totalSize = tiles.reduce((sum, t) => sum + t.size, 0);
      const cachedTimes = tiles.map(t => t.cachedAt);

      resolve({
        tileCount: tiles.length,
        totalSize,
        oldestTile: cachedTimes.length > 0 ? Math.min(...cachedTimes) : null,
        newestTile: cachedTimes.length > 0 ? Math.max(...cachedTimes) : null,
      });
    };

    request.onerror = () => {
      reject(new Error('Failed to get cache stats'));
    };
  });
}

/**
 * Clear expired tiles from cache
 */
export async function clearExpiredTiles(): Promise<number> {
  if (typeof window === 'undefined') return 0;

  const db = await initMapDatabase();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TILES_STORE], 'readwrite');
    const store = transaction.objectStore(TILES_STORE);
    const index = store.index('cachedAt');
    const range = IDBKeyRange.upperBound(now - MAX_CACHE_AGE);
    const request = index.openCursor(range);
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        deleted++;
        cursor.continue();
      } else {
        resolve(deleted);
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to clear expired tiles'));
    };
  });
}

/**
 * Clear all cached tiles
 */
export async function clearAllTiles(): Promise<void> {
  if (typeof window === 'undefined') return;

  const db = await initMapDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TILES_STORE], 'readwrite');
    const store = transaction.objectStore(TILES_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to clear tiles'));
  });
}

/**
 * Prune cache if it exceeds the maximum size
 */
export async function pruneCache(): Promise<number> {
  if (typeof window === 'undefined') return 0;

  const stats = await getCacheStats();
  if (stats.tileCount <= MAX_TILES_IN_CACHE) return 0;

  const db = await initMapDatabase();
  const toRemove = stats.tileCount - MAX_TILES_IN_CACHE;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TILES_STORE], 'readwrite');
    const store = transaction.objectStore(TILES_STORE);
    const index = store.index('lastAccessed');
    const request = index.openCursor();
    let removed = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && removed < toRemove) {
        cursor.delete();
        removed++;
        cursor.continue();
      } else {
        resolve(removed);
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to prune cache'));
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// TILE URL HELPER (for when cache is not available)
// ═══════════════════════════════════════════════════════════════

export function getTileUrl(z: number, x: number, y: number): string {
  const server = TILE_SERVERS[0];
  return `${server}/${z}/${x}/${y}.png`;
}

// ═══════════════════════════════════════════════════════════════
// PRE-FETCHING & LAST KNOWN POSITION
// ═══════════════════════════════════════════════════════════════

const LAST_POSITION_KEY = 'progress-companion-last-position';

/**
 * Store last known position for immediate display on app load
 */
export function saveLastKnownPosition(lat: number, lon: number, accuracy?: number): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({
      lat,
      lon,
      accuracy,
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get last known position for immediate map centering
 */
export function getLastKnownPosition(): { lat: number; lon: number; accuracy?: number; timestamp: number } | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(LAST_POSITION_KEY);
    if (!stored) return null;
    
    const data = JSON.parse(stored);
    // Only use if less than 24 hours old
    if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pre-fetch tiles around a location for faster map loading
 * This downloads tiles for common zoom levels around the given position
 */
export async function prefetchTilesAroundLocation(
  lat: number,
  lon: number,
  minZoom: number = 12,
  maxZoom: number = 16,
  radius: number = PREFETCH_RADIUS,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  const result = { success: 0, failed: 0 };
  const tiles: { z: number; x: number; y: number }[] = [];
  
  // Collect all tiles needed
  for (let z = minZoom; z <= maxZoom; z++) {
    const center = latLonToTile(lat, lon, z);
    
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = center.tileX + dx;
        const y = center.tileY + dy;
        const maxTile = Math.pow(2, z);
        
        if (x >= 0 && x < maxTile && y >= 0 && y < maxTile) {
          tiles.push({ z, x, y });
        }
      }
    }
  }
  
  // Download tiles in parallel (max 6 concurrent)
  const BATCH_SIZE = 6;
  let loaded = 0;
  
  for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
    const batch = tiles.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(async ({ z, x, y }) => {
        // Check cache first
        const cached = await getCachedTile(z, x, y);
        if (cached) return { cached: true };
        
        // Download and cache
        const blob = await downloadTile(z, x, y);
        await cacheTile(z, x, y, blob);
        return { cached: false };
      })
    );
    
    for (const r of results) {
      if (r.status === 'fulfilled') {
        result.success++;
      } else {
        result.failed++;
      }
      loaded++;
      onProgress?.(loaded, tiles.length);
    }
  }
  
  return result;
}

/**
 * Quick preload for immediate map display - loads tiles at zoom 14 only
 * Returns immediately, loads in background
 */
export function quickPreloadLocation(lat: number, lon: number): void {
  // Don't await - run in background
  prefetchTilesAroundLocation(lat, lon, 14, 14, 2).catch(() => {
    // Ignore errors in background preload
  });
}
