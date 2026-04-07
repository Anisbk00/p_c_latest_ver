/**
 * Realtime Manager
 * 
 * Manages Supabase Realtime subscriptions for live data updates.
 * Automatically syncs data across devices when changes occur.
 * 
 * @module lib/unified-data-service/realtime-manager
 */

import { getClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database, Tables } from '@/lib/supabase/database.types';
import type { TableName } from './types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type ChangeHandler<T> = (payload: RealtimePostgresChangesPayload<T>) => void;

interface SubscriptionConfig {
  tableName: TableName;
  userId: string;
  onInsert?: ChangeHandler<unknown>;
  onUpdate?: ChangeHandler<unknown>;
  onDelete?: ChangeHandler<unknown>;
}

// ═══════════════════════════════════════════════════════════════
// Realtime Manager Class
// ═══════════════════════════════════════════════════════════════

export class RealtimeManager {
  private channels: Map<string, RealtimeChannel> = new Map();
  private supabaseUrl: string;
  private supabaseKey: string;
  private client: ReturnType<typeof getClient> | null = null;
  
  // HIGH PRIORITY FIX: Exponential backoff for reconnection
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts: number = 5;
  private baseReconnectDelay: number = 1000; // 1 second
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  }
  
  /**
   * Calculate reconnection delay with exponential backoff and jitter
   */
  private getReconnectDelay(channelName: string): number {
    const attempts = this.reconnectAttempts.get(channelName) || 0;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s with jitter
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, attempts),
      30000 // Max 30 seconds
    );
    // Add jitter (±25%) to prevent thundering herd
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }
  
  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(channelName: string, config: SubscriptionConfig): void {
    const attempts = this.reconnectAttempts.get(channelName) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.warn(`[Realtime] Max reconnection attempts (${this.maxReconnectAttempts}) reached for ${channelName}`);
      return;
    }
    
    // Clear any existing timer
    const existingTimer = this.reconnectTimers.get(channelName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const delay = this.getReconnectDelay(channelName);
    this.reconnectAttempts.set(channelName, attempts + 1);
    
    console.log(`[Realtime] Scheduling reconnect for ${channelName} in ${delay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
    
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(channelName);
      this.subscribe(config);
    }, delay);
    
    this.reconnectTimers.set(channelName, timer);
  }
  
  /**
   * Reset reconnection attempts on successful connection
   */
  private resetReconnectAttempts(channelName: string): void {
    this.reconnectAttempts.delete(channelName);
    const timer = this.reconnectTimers.get(channelName);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(channelName);
    }
  }
  
  /**
   * Get or create Supabase client
   */
  private getClient() {
    if (!this.client && typeof window !== 'undefined') {
      this.client = getClient();
    }
    return this.client;
  }
  
  /**
   * Subscribe to table changes for a user
   */
  subscribe<T extends Tables<TableName>>(
    config: SubscriptionConfig
  ): () => void {
    const client = this.getClient();
    if (!client) {
      console.warn('[Realtime] Client not available');
      return () => {};
    }
    if (!config.userId) {
      console.error(`[Realtime] Subscription attempt without userId for table ${config.tableName}. Subscription skipped.`);
      return () => {};
    }
    const channelName = `${config.tableName}:${config.userId}`;
    // Check if already subscribed
    if (this.channels.has(channelName)) {
      return () => this.unsubscribe(channelName);
    }
    // Create channel
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes' as const,
        {
          event: '*',
          schema: 'public',
          table: config.tableName,
          filter: (config.tableName === 'profiles' || config.tableName === 'user_settings' || config.tableName === 'supplements' || config.tableName === 'global_foods')
            ? `id=eq.${config.userId}` 
            : `user_id=eq.${config.userId}`,
        },
        (payload) => {
          const { eventType } = payload;
          switch (eventType) {
            case 'INSERT':
              config.onInsert?.(payload as RealtimePostgresChangesPayload<T>);
              break;
            case 'UPDATE':
              config.onUpdate?.(payload as RealtimePostgresChangesPayload<T>);
              break;
            case 'DELETE':
              config.onDelete?.(payload as RealtimePostgresChangesPayload<T>);
              break;
          }
          // Log for debugging
          console.log(`[Realtime] ${config.tableName} ${eventType}:`, payload);
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] ${channelName} status:`, status);
        
        // HIGH PRIORITY FIX: Handle reconnection with exponential backoff
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Channel ${channelName} disconnected or errored`);
          this.scheduleReconnect(channelName, config);
        } else if (status === 'SUBSCRIBED') {
          // Reset reconnect attempts on successful connection
          this.resetReconnectAttempts(channelName);
        }
      });
    this.channels.set(channelName, channel);
    // Return unsubscribe function
    return () => this.unsubscribe(channelName);
  }
  
  /**
   * Unsubscribe from a channel
   */
  private async unsubscribe(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) return;
    
    try {
      await channel.unsubscribe();
      this.channels.delete(channelName);
      console.log(`[Realtime] Unsubscribed from ${channelName}`);
    } catch (error) {
      console.error(`[Realtime] Error unsubscribing from ${channelName}:`, error);
    }
  }
  
  /**
   * Unsubscribe from all channels
   */
  async unsubscribeAll(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    
    for (const [name, channel] of this.channels) {
      try {
        await channel.unsubscribe();
        this.channels.delete(name);
      } catch (error) {
        console.error(`[Realtime] Error unsubscribing from ${name}:`, error);
      }
    }
    
    console.log('[Realtime] Unsubscribed from all channels');
  }
  
  /**
   * Get connection status
   */
  getStatus(): 'connected' | 'disconnected' | 'connecting' {
    // Check if any channel is connected
    for (const channel of this.channels.values()) {
      const state = channel.state;
      if (state === 'joined') {
        return 'connected';
      }
      if (state === 'joining') {
        return 'connecting';
      }
    }
    return 'disconnected';
  }
  
  /**
   * Get active subscriptions count
   */
  getActiveSubscriptions(): number {
    return this.channels.size;
  }
  
  /**
   * Subscribe to multiple tables at once
   */
  subscribeToTables(
    userId: string,
    tableNames: TableName[],
    handlers: {
      onInsert?: ChangeHandler<unknown>;
      onUpdate?: ChangeHandler<unknown>;
      onDelete?: ChangeHandler<unknown>;
    }
  ): () => void {
    const unsubscribers: Array<() => void> = [];
    
    for (const tableName of tableNames) {
      const unsub = this.subscribe({
        tableName,
        userId,
        ...handlers,
      });
      unsubscribers.push(unsub);
    }
    
    // Return function to unsubscribe from all
    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }
}

// Export singleton instance
export const realtimeManager = new RealtimeManager();

// ═══════════════════════════════════════════════════════════════
// Hook for React components
// ═══════════════════════════════════════════════════════════════

/**
 * React hook for realtime subscriptions
 * Usage:
 * 
 * useRealtimeSubscription({
 *   tableName: 'food_logs',
 *   userId: user.id,
 *   onInsert: (payload) => { // handle insert },
 *   onUpdate: (payload) => { // handle update },
 *   onDelete: (payload) => { // handle delete },
 * });
 */
export function useRealtimeSubscription(config: SubscriptionConfig | null) {
  // This is a placeholder - the actual hook implementation
  // should be in a separate hooks file for React components
  // to avoid importing React in this service module
}
