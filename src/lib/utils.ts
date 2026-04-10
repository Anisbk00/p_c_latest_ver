import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ═══════════════════════════════════════════════════════════════
// DATE UTILITIES - Consistent timezone handling for daily data
// ═══════════════════════════════════════════════════════════════

/**
 * Get today's date as YYYY-MM-DD string in LOCAL timezone
 * This is the canonical way to determine "today" for daily data
 * IMPORTANT: Always use this instead of toISOString().split('T')[0] which uses UTC
 */
export function getLocalTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get a date as YYYY-MM-DD string in LOCAL timezone
 * Use this for any Date object to get consistent local date strings
 */
export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the start of day in LOCAL timezone as ISO string
 * Returns midnight local time converted to UTC for database queries
 */
export function getLocalDayStartISO(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0);
  return localMidnight.toISOString();
}

/**
 * Get the end of day in LOCAL timezone as ISO string
 * Returns 23:59:59.999 local time converted to UTC for database queries
 */
export function getLocalDayEndISO(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const localEndOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
  return localEndOfDay.toISOString();
}

/**
 * Extract local date string from an ISO timestamp
 * Converts UTC timestamp to local date for comparison
 */
export function isoToLocalDateString(isoString: string): string {
  const date = new Date(isoString);
  return getLocalDateString(date);
}

/**
 * Check if an ISO timestamp falls on a specific local date
 */
export function isOnLocalDate(isoString: string, localDateStr: string): boolean {
  return isoToLocalDateString(isoString) === localDateStr;
}

/**
 * Debounce function - delays execution until after wait ms have elapsed
 * since the last time the debounced function was invoked.
 * PERF-FIX: Prevents excessive API calls on rapid input
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Throttle function - limits execution to once per wait ms
 * PERF-FIX: Prevents excessive function calls on scroll/resize events
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastTime = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        timeoutId = null;
        func(...args);
      }, remaining);
    }
  };
}

/**
 * Creates a memoized debounce hook for React components
 * PERF-FIX: Stable debounce reference across renders
 */
export function createDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      callback(...args);
      timeoutId = null;
    }, delay);
  }) as T;
}
