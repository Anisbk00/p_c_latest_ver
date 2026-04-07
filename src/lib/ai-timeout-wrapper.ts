/**
 * AI Timeout and Error Handling Utilities
 * 
 * Provides timeout wrappers, circuit breakers, and error handling
 * for AI/LLM service calls to ensure reliability and prevent hanging.
 * 
 * @module lib/ai-timeout-wrapper
 */

// ═══════════════════════════════════════════════════════════════
// TIMEOUT WRAPPER
// ═══════════════════════════════════════════════════════════════

/**
 * Default timeout for AI completions (30 seconds)
 */
export const AI_DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum timeout for AI completions (60 seconds)
 */
export const AI_MAX_TIMEOUT_MS = 60000;

/**
 * Timeout for streaming operations (2 minutes)
 */
export const AI_STREAM_TIMEOUT_MS = 120000;

/**
 * Error class for timeout errors
 */
export class AITimeoutError extends Error {
  constructor(message: string = 'AI operation timed out') {
    super(message);
    this.name = 'AITimeoutError';
  }
}

/**
 * Error class for circuit breaker open state
 */
export class AICircuitBreakerError extends Error {
  constructor(message: string = 'AI service temporarily unavailable') {
    super(message);
    this.name = 'AICircuitBreakerError';
  }
}

/**
 * Wrap a promise with a timeout
 * 
 * @param promise - The promise to wrap
 * @param ms - Timeout in milliseconds
 * @param operation - Name of operation for error messages
 * @returns Promise that rejects on timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = AI_DEFAULT_TIMEOUT_MS,
  operation: string = 'AI operation'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new AITimeoutError(`${operation} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Wrap a promise with timeout and AbortController support
 * 
 * @param promiseFn - Function that receives AbortSignal and returns promise
 * @param ms - Timeout in milliseconds
 * @param operation - Name of operation for error messages
 * @returns Promise that rejects on timeout with proper abort
 */
export function withAbortableTimeout<T>(
  promiseFn: (signal: AbortSignal) => Promise<T>,
  ms: number = AI_DEFAULT_TIMEOUT_MS,
  operation: string = 'AI operation'
): Promise<T> {
  const controller = new AbortController();
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new AITimeoutError(`${operation} timed out after ${ms}ms`));
    }, ms);

    promiseFn(controller.signal)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          reject(new AITimeoutError(`${operation} was aborted`));
        } else {
          reject(error);
        }
      });
  });
}

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeout: number;
  /** Time window for counting failures */
  failureWindow: number;
}

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  failureWindow: 300000, // 5 minutes
};

/**
 * Simple in-memory circuit breaker for AI calls
 */
class AICircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed',
  };
  
  private config: CircuitBreakerConfig;
  
  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }
  
  /**
   * Check if circuit allows requests
   */
  canExecute(): boolean {
    const now = Date.now();
    
    // If circuit is open, check if we should try half-open
    if (this.state.state === 'open') {
      if (now - this.state.lastFailureTime > this.config.resetTimeout) {
        this.state.state = 'half-open';
        return true;
      }
      return false;
    }
    
    return true;
  }
  
  /**
   * Record a successful call
   */
  recordSuccess(): void {
    if (this.state.state === 'half-open') {
      // Reset on success in half-open state
      this.state = {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed',
      };
    }
  }
  
  /**
   * Record a failed call
   */
  recordFailure(): void {
    const now = Date.now();
    
    // Reset failure count if outside window
    if (now - this.state.lastFailureTime > this.config.failureWindow) {
      this.state.failures = 0;
    }
    
    this.state.failures++;
    this.state.lastFailureTime = now;
    
    if (this.state.failures >= this.config.failureThreshold) {
      this.state.state = 'open';
    }
  }
  
  /**
   * Get current state for monitoring
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

// Singleton circuit breaker instance
export const aiCircuitBreaker = new AICircuitBreaker();

/**
 * Wrap a function with circuit breaker protection
 */
export function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  operation: string = 'AI operation'
): Promise<T> {
  if (!aiCircuitBreaker.canExecute()) {
    return Promise.reject(new AICircuitBreakerError(
      `${operation} is temporarily unavailable due to repeated failures. Please try again later.`
    ));
  }
  
  return fn()
    .then((result) => {
      aiCircuitBreaker.recordSuccess();
      return result;
    })
    .catch((error) => {
      aiCircuitBreaker.recordFailure();
      throw error;
    });
}

// ═══════════════════════════════════════════════════════════════
// RETRY LOGIC
// ═══════════════════════════════════════════════════════════════

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: Error) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );
  // Add jitter (10-30% of delay)
  const jitter = delay * (0.1 + Math.random() * 0.2);
  return Math.round(delay + jitter);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: Error): boolean {
  // Network errors
  if (error.message.includes('network') || error.message.includes('fetch')) {
    return true;
  }
  
  // Timeout errors
  if (error instanceof AITimeoutError) {
    return true;
  }
  
  // Rate limiting (429)
  if (error.message.includes('429') || error.message.includes('rate limit')) {
    return true;
  }
  
  // Server errors (5xx)
  if (error.message.includes('500') || error.message.includes('502') || 
      error.message.includes('503') || error.message.includes('504')) {
    return true;
  }
  
  return false;
}

/**
 * Wrap a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const shouldRetry = fullConfig.shouldRetry || isRetryableError;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry
      if (attempt < fullConfig.maxAttempts - 1 && shouldRetry(lastError)) {
        const delay = calculateBackoff(attempt, fullConfig);
        console.warn(`[AI] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════
// COMBINED WRAPPER
// ═══════════════════════════════════════════════════════════════

interface AIWrapperConfig {
  timeout?: number;
  retries?: number;
  operation?: string;
}

/**
 * Combined wrapper with timeout, circuit breaker, and retry
 * Use this for all AI operations
 */
export async function withAIProtection<T>(
  fn: () => Promise<T>,
  config: AIWrapperConfig = {}
): Promise<T> {
  const { timeout = AI_DEFAULT_TIMEOUT_MS, retries = 2, operation = 'AI operation' } = config;
  
  return withCircuitBreaker(async () => {
    return withRetry(
      () => withTimeout(fn(), timeout, operation),
      { maxAttempts: retries + 1 }
    );
  }, operation);
}
