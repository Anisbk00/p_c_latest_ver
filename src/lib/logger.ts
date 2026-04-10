/**
 * Structured logging service for Progress Companion
 * Provides formatted logging with different levels and output formats
 * Updated: 2025-01-20
 */

import { getCurrentRequestId } from './request-id';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  /** Unique request ID for tracing */
  requestId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  request?: {
    method?: string;
    url?: string;
    path?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  };
  response?: {
    statusCode?: number;
    duration?: number;
    headers?: Record<string, string>;
  };
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
  service?: string;
  environment?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  prettyPrint: boolean;
  service: string;
  environment: string;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const defaultConfig: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  prettyPrint: process.env.NODE_ENV !== 'production',
  service: 'progress-companion',
  environment: process.env.NODE_ENV || 'development',
};

// ═══════════════════════════════════════════════════════════════
// COLOR UTILITIES FOR PRETTY PRINTING
// ═══════════════════════════════════════════════════════════════

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

const levelColors: Record<LogLevel, string> = {
  debug: colors.cyan,
  info: colors.green,
  warn: colors.yellow,
  error: colors.red,
};

const levelEmojis: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

// ═══════════════════════════════════════════════════════════════
// LOGGER CLASS
// ═══════════════════════════════════════════════════════════════

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatPretty(entry: LogEntry): string {
    const { level, message, timestamp, requestId, context, error, request, response, user } = entry;
    
    const colorFn = levelColors[level];
    const emoji = levelEmojis[level];
    const upperLevel = level.toUpperCase().padEnd(5);
    
    // Include request ID in the timestamp line if available
    const requestIdStr = requestId ? ` ${colors.magenta}[${requestId}]${colors.reset}` : '';
    let output = `${colors.dim}[${timestamp}]${colors.reset}${requestIdStr} ${colorFn}${emoji} ${upperLevel}${colors.reset} ${colors.bright}${message}${colors.reset}`;
    
    // Add context if present
    if (context && Object.keys(context).length > 0) {
      output += `\n  ${colors.cyan}Context:${colors.reset} ${JSON.stringify(context, null, 2).split('\n').join('\n  ')}`;
    }
    
    // Add user info if present
    if (user) {
      output += `\n  ${colors.magenta}User:${colors.reset} ${user.id || 'unknown'}${user.email ? ` (${user.email})` : ''}`;
    }
    
    // Add request info if present
    if (request) {
      const reqParts: string[] = [];
      if (request.method) reqParts.push(request.method);
      if (request.path) reqParts.push(request.path);
      if (request.url) reqParts.push(request.url);
      if (reqParts.length > 0) {
        output += `\n  ${colors.blue}Request:${colors.reset} ${reqParts.join(' ')}`;
      }
    }
    
    // Add response info if present
    if (response) {
      const resParts: string[] = [];
      if (response.statusCode !== undefined) {
        const statusColor = response.statusCode < 400 ? colors.green : colors.red;
        resParts.push(`${statusColor}${response.statusCode}${colors.reset}`);
      }
      if (response.duration !== undefined) {
        resParts.push(`${response.duration}ms`);
      }
      if (resParts.length > 0) {
        output += `\n  ${colors.green}Response:${colors.reset} ${resParts.join(' ')}`;
      }
    }
    
    // Add error if present
    if (error) {
      output += `\n  ${colors.red}Error:${colors.reset} ${error.name}: ${error.message}`;
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(0, 5);
        output += `\n  ${colors.dim}${stackLines.join('\n  ')}${colors.reset}`;
      }
    }
    
    return output;
  }

  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, data?: Partial<LogEntry>): void {
    if (!this.shouldLog(level)) return;

    // Get request ID from async context if available
    const requestId = data?.requestId || getCurrentRequestId();

    const entry: LogEntry = {
      level,
      message,
      timestamp: this.formatTimestamp(),
      service: this.config.service,
      environment: this.config.environment,
      requestId,
      ...data,
    };

    const output = this.config.prettyPrint
      ? this.formatPretty(entry)
      : this.formatJson(entry);

    // Use appropriate console method
    switch (level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC LOGGING METHODS
  // ═══════════════════════════════════════════════════════════════

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, { context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, { context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, { context });
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorData = error instanceof Error
      ? {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        }
      : error
        ? { context: { ...context, rawError: error } }
        : {};

    this.log('error', message, { ...errorData, context });
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUEST/RESPONSE LOGGING HELPERS
  // ═══════════════════════════════════════════════════════════════

  logRequest(
    method: string,
    path: string,
    options?: {
      headers?: Record<string, string>;
      query?: Record<string, string>;
      userId?: string;
      userEmail?: string;
    }
  ): number {
    const startTime = Date.now();
    
    this.info(`Incoming request: ${method} ${path}`, {
      request: {
        method,
        path,
        headers: options?.headers,
        query: options?.query,
      },
      user: options?.userId
        ? {
            id: options.userId,
            email: options.userEmail,
          }
        : undefined,
    });

    return startTime;
  }

  logResponse(
    method: string,
    path: string,
    statusCode: number,
    startTime: number,
    options?: {
      error?: Error;
      userId?: string;
    }
  ): void {
    const duration = Date.now() - startTime;
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    this.log(level, `Response: ${method} ${path} ${statusCode}`, {
      request: { method, path },
      response: {
        statusCode,
        duration,
      },
      user: options?.userId ? { id: options.userId } : undefined,
      error: options?.error
        ? {
            name: options.error.name,
            message: options.error.message,
            stack: options.error.stack,
          }
        : undefined,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SPECIALIZED LOGGERS
  // ═══════════════════════════════════════════════════════════════

  api(
    method: string,
    endpoint: string,
    options?: {
      statusCode?: number;
      duration?: number;
      error?: Error;
      context?: Record<string, unknown>;
    }
  ): void {
    const level: LogLevel = options?.error
      ? 'error'
      : options?.statusCode && options.statusCode >= 400
        ? 'warn'
        : 'info';

    this.log(level, `API ${method} ${endpoint}`, {
      request: { method, path: endpoint },
      response: options?.statusCode
        ? { statusCode: options.statusCode, duration: options.duration }
        : undefined,
      error: options?.error
        ? {
            name: options.error.name,
            message: options.error.message,
            stack: options.error.stack,
          }
        : undefined,
      context: options?.context,
    });
  }

  database(
    operation: string,
    table: string,
    options?: {
      duration?: number;
      error?: Error;
      context?: Record<string, unknown>;
    }
  ): void {
    const level: LogLevel = options?.error ? 'error' : 'debug';

    this.log(level, `Database ${operation} on ${table}`, {
      context: {
        operation,
        table,
        duration: options?.duration,
        ...options?.context,
      },
      error: options?.error
        ? {
            name: options.error.name,
            message: options.error.message,
            stack: options.error.stack,
          }
        : undefined,
    });
  }

  auth(
    event: string,
    options?: {
      userId?: string;
      email?: string;
      success?: boolean;
      error?: Error;
      context?: Record<string, unknown>;
    }
  ): void {
    const level: LogLevel = options?.error ? 'error' : options?.success === false ? 'warn' : 'info';

    this.log(level, `Auth: ${event}`, {
      user: {
        id: options?.userId,
        email: options?.email,
      },
      context: {
        success: options?.success,
        ...options?.context,
      },
      error: options?.error
        ? {
            name: options.error.name,
            message: options.error.message,
            stack: options.error.stack,
          }
        : undefined,
    });
  }

  performance(
    operation: string,
    duration: number,
    options?: {
      threshold?: number;
      context?: Record<string, unknown>;
    }
  ): void {
    const threshold = options?.threshold || 1000; // Default 1 second
    const level: LogLevel = duration > threshold ? 'warn' : 'debug';

    this.log(level, `Performance: ${operation} took ${duration}ms`, {
      context: {
        operation,
        duration,
        threshold,
        exceededThreshold: duration > threshold,
        ...options?.context,
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════

export const logger = new Logger();

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a child logger with additional context
 */
export function createLogger(config: Partial<LoggerConfig> = {}): Logger {
  return new Logger({ ...defaultConfig, ...config });
}

/**
 * Measure execution time of an async function and log it
 */
export async function withLogging<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    logger.performance(operation, Date.now() - startTime, { context });
    return result;
  } catch (error) {
    logger.error(`${operation} failed`, error instanceof Error ? error : new Error(String(error)), context);
    throw error;
  }
}

/**
 * Express/Next.js middleware-style request logger
 */
export function requestLogger() {
  return {
    start: (method: string, path: string, options?: { headers?: Record<string, string>; userId?: string }) => {
      return logger.logRequest(method, path, options);
    },
    end: (method: string, path: string, statusCode: number, startTime: number, error?: Error) => {
      logger.logResponse(method, path, statusCode, startTime, { error });
    },
  };
}

export default logger;
