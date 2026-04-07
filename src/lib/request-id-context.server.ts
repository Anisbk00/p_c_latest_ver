/**
 * Server-only Request ID Context
 * 
 * Uses async_hooks for request context tracking.
 * This file MUST only be imported on the server side.
 * 
 * @module lib/request-id-server
 */

import { AsyncLocalStorage } from 'async_hooks';

const requestIdStorage = new AsyncLocalStorage<string>();

/**
 * Run a function with a request ID in context
 */
export function withRequestId<T>(requestId: string, fn: () => T): T {
  return requestIdStorage.run(requestId, fn);
}

/**
 * Get the current request ID from async context
 */
export function getRequestIdFromContext(): string | undefined {
  return requestIdStorage.getStore();
}
