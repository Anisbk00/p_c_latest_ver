/**
 * Optimistic Locking Utility
 * 
 * Provides optimistic locking for concurrent updates using version/timestamp checking.
 * Prevents lost updates when multiple requests modify the same resource simultaneously.
 * 
 * Supports two locking strategies:
 * 1. Numeric version field (recommended) - Incremented on each update
 * 2. Timestamp field - Uses updated_at for comparison
 * 
 * @module lib/optimistic-locking
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface VersionedEntity {
  id: string
  updated_at: string
  version?: number
}

export interface OptimisticLockConfig {
  /** Field name for version (default: 'updated_at') */
  versionField?: 'updated_at' | 'version'
  /** Whether to use numeric version or timestamp */
  useNumericVersion?: boolean
  /** Whether to enforce locking (if false, allows updates without version check) */
  enforceLocking?: boolean
}

export interface LockCheckResult {
  valid: boolean
  currentVersion: string | number
  providedVersion: string | number | null
  conflict: boolean
  shouldRetry: boolean
}

export class OptimisticLockError extends Error {
  public readonly currentVersion: string | number
  public readonly providedVersion: string | number | null
  public readonly resourceId: string

  constructor(
    message: string,
    resourceId: string,
    currentVersion: string | number,
    providedVersion: string | number | null
  ) {
    super(message)
    this.name = 'OptimisticLockError'
    this.currentVersion = currentVersion
    this.providedVersion = providedVersion
    this.resourceId = resourceId
  }
}

// ═══════════════════════════════════════════════════════════════
// Version Extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Extract version from entity for comparison
 */
export function extractVersion(
  entity: VersionedEntity,
  config: OptimisticLockConfig = {}
): string | number {
  const { versionField = 'updated_at', useNumericVersion = false } = config

  if (useNumericVersion && entity.version !== undefined) {
    return entity.version
  }

  return entity.updated_at
}

/**
 * Get version header from request
 */
export function getVersionFromHeaders(
  headers: Headers
): string | null {
  // Check common version header names
  return (
    headers.get('If-Match') ||
    headers.get('X-Resource-Version') ||
    headers.get('X-Resource-Timestamp') ||
    null
  )
}

/**
 * Parse version from string
 */
export function parseVersion(
  versionStr: string | null
): string | number | null {
  if (!versionStr) return null

  // Try parsing as number first
  const num = parseInt(versionStr, 10)
  if (!isNaN(num) && versionStr === num.toString()) {
    return num
  }

  // Return as string (timestamp)
  return versionStr
}

// ═══════════════════════════════════════════════════════════════
// Lock Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Check if an update is valid based on version
 */
export function validateVersion(
  currentEntity: VersionedEntity,
  providedVersion: string | number | null,
  config: OptimisticLockConfig = {}
): LockCheckResult {
  const currentVersion = extractVersion(currentEntity, config)

  // If no version provided, check if locking is enforced
  if (providedVersion === null) {
    const enforceLocking = config.enforceLocking ?? false
    return {
      valid: !enforceLocking,
      currentVersion,
      providedVersion: null,
      conflict: enforceLocking,
      shouldRetry: false,
    }
  }

  // Compare versions
  const versionsMatch = compareVersions(currentVersion, providedVersion)

  return {
    valid: versionsMatch,
    currentVersion,
    providedVersion,
    conflict: !versionsMatch,
    shouldRetry: !versionsMatch, // Client can retry with fresh data
  }
}

/**
 * Compare two versions for equality
 */
function compareVersions(
  current: string | number,
  provided: string | number
): boolean {
  // Numeric comparison
  if (typeof current === 'number' && typeof provided === 'number') {
    return current === provided
  }

  // String comparison (timestamps)
  const currentStr = current.toString()
  const providedStr = provided.toString()

  // Normalize timestamps to milliseconds for comparison
  const currentDate = new Date(currentStr)
  const providedDate = new Date(providedStr)

  if (!isNaN(currentDate.getTime()) && !isNaN(providedDate.getTime())) {
    // Allow 1 second tolerance for timestamp comparison
    return Math.abs(currentDate.getTime() - providedDate.getTime()) < 1000
  }

  // Direct string comparison as fallback
  return currentStr === providedStr
}

// ═══════════════════════════════════════════════════════════════
// Version Increment
// ═══════════════════════════════════════════════════════════════

/**
 * Generate new version for an entity
 */
export function generateNewVersion(
  config: OptimisticLockConfig = {}
): string | number {
  const { useNumericVersion = false } = config

  if (useNumericVersion) {
    // For numeric version, use timestamp as number
    return Date.now()
  }

  // Return current timestamp
  return new Date().toISOString()
}

// ═══════════════════════════════════════════════════════════════
// Response Headers
// ═══════════════════════════════════════════════════════════════

/**
 * Get headers to include in response for version tracking
 */
export function getVersionHeaders(
  entity: VersionedEntity,
  config: OptimisticLockConfig = {}
): Record<string, string> {
  const version = extractVersion(entity, config)

  return {
    'X-Resource-Version': version.toString(),
    ETag: `"${version}"`,
  }
}

// ═══════════════════════════════════════════════════════════════
// Higher-Order Update Function
// ═══════════════════════════════════════════════════════════════

/**
 * Wrapper for update operations with optimistic locking
 */
export async function withOptimisticLock<T extends VersionedEntity>(
  options: {
    /** Function to fetch current entity */
    fetchCurrent: () => Promise<T | null>
    /** Function to perform the update */
    performUpdate: (current: T, newVersion: string) => Promise<T | null>
    /** Version provided by client */
    providedVersion?: string | number | null
    /** Resource ID for error messages */
    resourceId: string
    /** Lock configuration */
    config?: OptimisticLockConfig
  }
): Promise<{ success: boolean; entity: T | null; error?: OptimisticLockError }> {
  const {
    fetchCurrent,
    performUpdate,
    providedVersion = null,
    resourceId,
    config = {},
  } = options

  // Fetch current entity
  const current = await fetchCurrent()

  if (!current) {
    return {
      success: false,
      entity: null,
      error: new OptimisticLockError(
        `Entity not found: ${resourceId}`,
        resourceId,
        '',
        null
      ),
    }
  }

  // Validate version
  const check = validateVersion(current, providedVersion, config)

  if (check.conflict) {
    const error = new OptimisticLockError(
      `Conflict updating ${resourceId}: resource was modified by another request`,
      resourceId,
      check.currentVersion,
      check.providedVersion
    )
    return { success: false, entity: current, error }
  }

  // Generate new version
  const newVersion = generateNewVersion(config) as string

  // Perform update
  const updated = await performUpdate(current, newVersion)

  return { success: true, entity: updated }
}

// ═══════════════════════════════════════════════════════════════
// Retry Logic for Conflicts
// ═══════════════════════════════════════════════════════════════

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number
  /** Base delay in milliseconds */
  baseDelayMs: number
  /** Maximum delay in milliseconds */
  maxDelayMs: number
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  exponentialBackoff: true,
}

/**
 * Retry an update operation with automatic conflict resolution
 */
export async function retryOnConflict<T extends VersionedEntity, R>(
  operation: (current: T) => Promise<{ entity: T; result: R }>,
  fetchCurrent: () => Promise<T | null>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ success: boolean; result?: R; error?: Error }> {
  let lastError: Error | null = null
  let attempt = 0

  while (attempt < config.maxRetries) {
    attempt++

    try {
      const current = await fetchCurrent()
      if (!current) {
        return { success: false, error: new Error('Entity not found') }
      }

      const { entity, result } = await operation(current)
      return { success: true, result }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Only retry on conflict errors
      if (error instanceof OptimisticLockError) {
        const delay = config.exponentialBackoff
          ? Math.min(config.baseDelayMs * Math.pow(2, attempt - 1), config.maxDelayMs)
          : config.baseDelayMs

        await sleep(delay)
        continue
      }

      // Non-conflict error, don't retry
      return { success: false, error: lastError }
    }
  }

  return { success: false, error: lastError || new Error('Max retries exceeded') }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ═══════════════════════════════════════════════════════════════
// Client-Side Utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Create versioned fetch options for client-side API calls
 */
export function createVersionedFetchOptions(
  currentEntity: VersionedEntity,
  options: RequestInit = {},
  config: OptimisticLockConfig = {}
): RequestInit {
  const version = extractVersion(currentEntity, config)

  return {
    ...options,
    headers: {
      ...options.headers,
      'X-Resource-Version': version.toString(),
      'If-Match': `"${version}"`,
    },
  }
}
