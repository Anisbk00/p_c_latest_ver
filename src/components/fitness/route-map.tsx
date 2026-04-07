"use client";

/**
 * Route Map Component
 * Displays workout routes on a map with offline tile support
 * Uses canvas for rendering to avoid external dependencies
 * Updated: 2025-01-20
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Download, Wifi, WifiOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getTile,
  getTileUrl,
  latLonToTile,
  tileToLatLon,
  getCacheStats,
  downloadTilesForRegion,
  type TileBounds,
  type CacheStats,
  type DownloadProgress,
} from "@/lib/map-tiles";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GeoPoint {
  lat: number;
  lon: number;
  elevation?: number;
  timestamp?: number;
  heartRate?: number;
}

export interface RouteData {
  points: GeoPoint[];
  startTime?: string;
  endTime?: string;
  totalDistance?: number;
}

interface RouteMapProps {
  route?: RouteData | null;
  className?: string;
  height?: number | string;
  showControls?: boolean;
  zoom?: number;
  center?: { lat: number; lon: number };
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function parseRouteData(routeString: string | null | undefined): RouteData | null {
  if (!routeString) return null;

  try {
    const parsed = JSON.parse(routeString);
    if (parsed.points && Array.isArray(parsed.points)) {
      return parsed as RouteData;
    }
    // Handle GPX-like format
    if (parsed.trkpts && Array.isArray(parsed.trkpts)) {
      return {
        points: parsed.trkpts.map((p: { lat: number; lon: number; ele?: number; time?: string }) => ({
          lat: p.lat,
          lon: p.lon,
          elevation: p.ele,
          timestamp: p.time ? new Date(p.time).getTime() : undefined,
        })),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function getRouteBounds(points: GeoPoint[]): { north: number; south: number; east: number; west: number } {
  if (points.length === 0) {
    return { north: 45, south: 35, east: 15, west: 5 }; // Default: somewhere in Europe
  }

  let north = -90, south = 90, east = -180, west = 180;

  for (const point of points) {
    north = Math.max(north, point.lat);
    south = Math.min(south, point.lat);
    east = Math.max(east, point.lon);
    west = Math.min(west, point.lon);
  }

  // Add padding
  const latPadding = (north - south) * 0.1 || 0.01;
  const lonPadding = (east - west) * 0.1 || 0.01;

  return {
    north: north + latPadding,
    south: south - latPadding,
    east: east + lonPadding,
    west: west - lonPadding,
  };
}

// ═══════════════════════════════════════════════════════════════
// ROUTE MAP COMPONENT
// ═══════════════════════════════════════════════════════════════

export function RouteMap({
  route: routeProp,
  className,
  height = 200,
  showControls = true,
  zoom: initialZoom = 14,
  center: centerProp,
}: RouteMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const route = routeProp;
  const points = route?.points || [];

  // Calculate center and zoom from route
  const bounds = getRouteBounds(points);
  const center = centerProp || {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  };

  // Check online status
  useEffect(() => {
    const checkOnline = () => setIsOnline(navigator.onLine);
    checkOnline();

    window.addEventListener('online', checkOnline);
    window.addEventListener('offline', checkOnline);

    return () => {
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('offline', checkOnline);
    };
  }, []);

  // Load cache stats
  useEffect(() => {
    getCacheStats().then(setCacheStats);
  }, []);

  // Render map
  const renderMap = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    const width = container?.clientWidth || 300;
    const height = typeof height === 'number' ? height : 200;

    // Set canvas size
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Calculate tile range for current view
    const zoom = initialZoom;
    const centerTile = latLonToTile(center.lat, center.lon, zoom);

    // Calculate visible tile range
    const tilesX = Math.ceil(width / 256) + 2;
    const tilesY = Math.ceil(height / 256) + 2;

    const startTileX = Math.floor(centerTile.tileX - tilesX / 2);
    const startTileY = Math.floor(centerTile.tileY - tilesY / 2);

    // Calculate pixel offset for centering
    const offsetX = (centerTile.x - centerTile.tileX) * 256;
    const offsetY = (centerTile.y - centerTile.tileY) * 256;

    // Draw tiles
    const tilePromises: Promise<void>[] = [];

    for (let dx = 0; dx < tilesX; dx++) {
      for (let dy = 0; dy < tilesY; dy++) {
        const tileX = startTileX + dx;
        const tileY = startTileY + dy;

        // Skip invalid tile coordinates
        const maxTile = Math.pow(2, zoom);
        if (tileX < 0 || tileX >= maxTile || tileY < 0 || tileY >= maxTile) continue;

        const promise = (async () => {
          try {
            let blob: Blob;

            if (isOnline) {
              // Try to get from cache or download
              const result = await getTile(zoom, tileX, tileY);
              blob = result.blob;
            } else {
              // Offline: only use cache
              const { getCachedTile } = await import('@/lib/map-tiles');
              const cached = await getCachedTile(zoom, tileX, tileY);
              if (!cached) return; // Skip if not cached
              blob = cached;
            }

            // Draw tile
            const img = new Image();
            img.src = URL.createObjectURL(blob);

            await new Promise<void>((resolve) => {
              img.onload = () => {
                const drawX = dx * 256 - offsetX - 128;
                const drawY = dy * 256 - offsetY - 128;
                ctx.drawImage(img, drawX, drawY, 256, 256);
                URL.revokeObjectURL(img.src);
                resolve();
              };
              img.onerror = () => {
                URL.revokeObjectURL(img.src);
                resolve();
              };
            });
          } catch (err) {
            // Tile not available, draw placeholder
            const drawX = dx * 256 - offsetX - 128;
            const drawY = dy * 256 - offsetY - 128;
            ctx.fillStyle = '#2a2a4e';
            ctx.fillRect(drawX, drawY, 256, 256);
          }
        })();

        tilePromises.push(promise);
      }
    }

    await Promise.all(tilePromises);

    // Draw route if available
    if (points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Set shadow for glow effect
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 6;

      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const tilePos = latLonToTile(point.lat, point.lon, zoom);

        const screenX = (tilePos.x - startTileX) * 256 - offsetX - 128;
        const screenY = (tilePos.y - startTileY) * 256 - offsetY - 128;

        if (i === 0) {
          ctx.moveTo(screenX, screenY);
        } else {
          ctx.lineTo(screenX, screenY);
        }
      }

      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Draw start marker
      if (points.length > 0) {
        const startPoint = points[0];
        const startTilePos = latLonToTile(startPoint.lat, startPoint.lon, zoom);
        const startScreenX = (startTilePos.x - startTileX) * 256 - offsetX - 128;
        const startScreenY = (startTilePos.y - startTileY) * 256 - offsetY - 128;

        ctx.beginPath();
        ctx.arc(startScreenX, startScreenY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw end marker
      if (points.length > 1) {
        const endPoint = points[points.length - 1];
        const endTilePos = latLonToTile(endPoint.lat, endPoint.lon, zoom);
        const endScreenX = (endTilePos.x - startTileX) * 256 - offsetX - 128;
        const endScreenY = (endTilePos.y - startTileY) * 256 - offsetY - 128;

        ctx.beginPath();
        ctx.arc(endScreenX, endScreenY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw offline indicator if offline
    if (!isOnline) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, width, 30);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText('Offline - Showing cached map', 10, 20);
    }
  }, [center, initialZoom, height, isOnline, points]);

  // Render map when dependencies change
  useEffect(() => {
    renderMap();
  }, [renderMap]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => renderMap();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderMap]);

  // Download tiles for offline use
  const handleDownloadOffline = async () => {
    if (!isOnline) {
      setError('Cannot download tiles while offline');
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const tileBounds: TileBounds = {
        minZoom: 10,
        maxZoom: 16,
        bounds: {
          north: bounds.north,
          south: bounds.south,
          east: bounds.east,
          west: bounds.west,
        },
      };

      const result = await downloadTilesForRegion(tileBounds, setDownloadProgress);

      if (result.failed > 0) {
        setError(`Downloaded ${result.success} tiles, ${result.failed} failed`);
      }

      // Refresh cache stats
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (err) {
      setError('Failed to download tiles');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden rounded-2xl bg-muted/30", className)}
      style={{ height: heightStyle }}
      role="img"
      aria-label="Workout route map"
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      )}

      {/* No route placeholder */}
      {points.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <MapPin className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No route data</p>
        </div>
      )}

      {/* Controls overlay */}
      {showControls && points.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-3 right-3 flex items-center gap-2"
        >
          {/* Cache stats */}
          {cacheStats && cacheStats.tileCount > 0 && (
            <div className="px-2 py-1 rounded-lg bg-black/50 text-xs text-white/80">
              {cacheStats.tileCount} tiles cached
            </div>
          )}

          {/* Download button */}
          {isOnline && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDownloadOffline}
              disabled={isDownloading}
              className="h-8 px-3 bg-black/50 hover:bg-black/70 border-0"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {downloadProgress?.percentComplete || 0}%
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-1" />
                  Save Offline
                </>
              )}
            </Button>
          )}
        </motion.div>
      )}

      {/* Online/Offline indicator */}
      <div className="absolute top-3 left-3">
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs",
          isOnline ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"
        )}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isOnline ? "Online" : "Offline"}
        </div>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-3 left-3 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI ROUTE PREVIEW (for list items)
// ═══════════════════════════════════════════════════════════════

interface MiniRoutePreviewProps {
  route?: RouteData | null;
  className?: string;
  size?: number;
}

export function MiniRoutePreview({ route, className, size = 48 }: MiniRoutePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const points = route?.points || [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size * window.devicePixelRatio;
    canvas.height = size * window.devicePixelRatio;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    // Get bounds
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }

    const latRange = maxLat - minLat || 1;
    const lonRange = maxLon - minLon || 1;

    // Draw route
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    for (let i = 0; i < points.length; i++) {
      const x = ((points[i].lon - minLon) / lonRange) * (size - 8) + 4;
      const y = size - ((points[i].lat - minLat) / latRange) * (size - 8) - 4;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }, [points, size]);

  if (points.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center bg-muted/30 rounded-lg", className)}
        style={{ width: size, height: size }}
      >
        <MapPin className="w-4 h-4 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={cn("rounded-lg", className)}
      style={{ width: size, height: size }}
    />
  );
}

// Re-export parseRouteData for convenience
export { parseRouteData };
