/**
 * Local Cache
 * 
 * In-memory cache layer for the Unified Data Service.
 * Provides fast access to frequently used data without hitting IndexedDB.
 * 
 * @module lib/unified-data-service/local-cache
 */

import type { TableName } from './types';

// ═══════════════════════════════════════════════════════════════
// Local Cache Class
// ═══════════════════════════════════════════════════════════════

export class LocalCache {
  private cache: Map<string, Map<string, any>>;
  private _expiryMap: Map<string, number>;
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize: number = 1000, ttl: number = 5 * 60 * 1000) {
    this.cache = new Map();
    this._expiryMap = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Get cache key for a table and id
   */
  private getCacheKey(tableName: TableName, id: string): string {
    return `${tableName}:${id}`;
  }

  /**
   * Get a single item from cache
   */
  async get<T>(tableName: TableName, id: string): Promise<T | null> {
    const table = this.cache.get(tableName);
    if (!table) return null;

    const item = table.get(id);
    if (!item) return null;

    // Check if expired
    const cacheKey = this.getCacheKey(tableName, id);
    const expiry = this._expiryMap.get(cacheKey);
    if (expiry !== undefined && Date.now() > expiry) {
      table.delete(id);
      this._expiryMap.delete(cacheKey);
      return null;
    }

    return item as T;
  }

  /**
   * Get all items from a table
   */
  async getAll<T>(tableName: TableName): Promise<T[]> {
    const table = this.cache.get(tableName);
    if (!table) return [];

    const items: T[] = [];
    const now = Date.now();

    for (const [id, item] of table.entries()) {
      // Check if expired
      const cacheKey = this.getCacheKey(tableName, id);
      const expiry = this._expiryMap.get(cacheKey);
      if (expiry !== undefined && now > expiry) {
        table.delete(id);
        this._expiryMap.delete(cacheKey);
        continue;
      }
      items.push(item as T);
    }

    return items;
  }

  /**
   * Set a single item in cache
   */
  async set(tableName: TableName, data: any): Promise<void> {
    if (!data || !data.id) return;

    let table = this.cache.get(tableName);
    if (!table) {
      table = new Map();
      this.cache.set(tableName, table);
    }

    // Store cache metadata separately to avoid polluting data objects
    const cacheKey = this.getCacheKey(tableName, data.id);
    this._expiryMap.set(cacheKey, Date.now() + this.ttl);

    table.set(data.id, data);

    // Enforce max size per table
    if (table.size > this.maxSize) {
      // Remove oldest entries (first in Map)
      const firstKey = table.keys().next().value;
      if (firstKey) {
        table.delete(firstKey);
        this._expiryMap.delete(this.getCacheKey(tableName, firstKey));
      }
    }
  }

  /**
   * Set multiple items in cache
   */
  async setAll(tableName: TableName, items: any[]): Promise<void> {
    if (!items || items.length === 0) return;

    let table = this.cache.get(tableName);
    if (!table) {
      table = new Map();
      this.cache.set(tableName, table);
    }

    const now = Date.now();
    for (const item of items) {
      if (!item || !item.id) continue;

      // Store cache metadata separately to avoid polluting data objects
      const cacheKey = this.getCacheKey(tableName, item.id);
      this._expiryMap.set(cacheKey, now + this.ttl);

      table.set(item.id, item);
    }

    // Enforce max size
    while (table.size > this.maxSize) {
      const firstKey = table.keys().next().value;
      if (firstKey) {
        table.delete(firstKey);
        this._expiryMap.delete(this.getCacheKey(tableName, firstKey));
      }
    }
  }

  /**
   * Remove a single item from cache
   */
  async remove(tableName: TableName, id: string): Promise<void> {
    const table = this.cache.get(tableName);
    if (!table) return;

    table.delete(id);
    this._expiryMap.delete(this.getCacheKey(tableName, id));
  }

  /**
   * Clear all items from a table
   */
  async clearTable(tableName: TableName): Promise<void> {
    // Remove expiry entries for this table
    const prefix = `${tableName}:`;
    for (const key of this._expiryMap.keys()) {
      if (key.startsWith(prefix)) {
        this._expiryMap.delete(key);
      }
    }
    this.cache.delete(tableName);
  }

  /**
   * Clear entire cache
   */
  async clearAll(): Promise<void> {
    this.cache.clear();
    this._expiryMap.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalTables: number;
    totalItems: number;
    tableStats: Record<string, number>;
  } {
    const tableStats: Record<string, number> = {};
    let totalItems = 0;

    for (const [tableName, table] of this.cache.entries()) {
      const size = table.size;
      tableStats[tableName] = size;
      totalItems += size;
    }

    return {
      totalTables: this.cache.size,
      totalItems,
      tableStats,
    };
  }

  /**
   * Cleanup expired items
   */
  async cleanup(): Promise<number> {
    let removed = 0;
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find expired entries via the expiry map
    for (const [cacheKey, expiry] of this._expiryMap.entries()) {
      if (now > expiry) {
        expiredKeys.push(cacheKey);
      }
    }

    // Remove expired entries from both maps
    for (const cacheKey of expiredKeys) {
      const colonIndex = cacheKey.indexOf(':');
      const tableName = cacheKey.substring(0, colonIndex) as TableName;
      const id = cacheKey.substring(colonIndex + 1);

      const table = this.cache.get(tableName);
      if (table && table.has(id)) {
        table.delete(id);
        removed++;
      }
      this._expiryMap.delete(cacheKey);

      // Remove empty tables
      if (table && table.size === 0) {
        this.cache.delete(tableName);
      }
    }

    return removed;
  }
}
