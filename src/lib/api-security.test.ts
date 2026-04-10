import { describe, it, expect } from 'vitest'
import { isValidUuid, sanitizeErrorForClient, validateContentType, getClientIp, validateUserId } from '@/lib/api-security'
import { NextRequest } from 'next/server'

describe('CSRF token format validation', () => {
  it('validates a correctly formatted 64-character hex CSRF token with matching cookie', async () => {
    const { validateCsrfToken } = await import('@/lib/api-security')
    const validToken = 'a'.repeat(64)
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'X-CSRF-Token': validToken, Cookie: `csrf-token=${validToken}` },
    })
    const result = await validateCsrfToken(request)
    expect(result.valid).toBe(true)
  })

  it('rejects a CSRF token that is not 64 hex characters', async () => {
    const { validateCsrfToken } = await import('@/lib/api-security')
    const badToken = 'not-a-valid-token'
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'X-CSRF-Token': badToken, Cookie: `csrf-token=${badToken}` },
    })
    const result = await validateCsrfToken(request)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid CSRF token format')
  })

  it('rejects missing CSRF token header on POST request', async () => {
    const { validateCsrfToken } = await import('@/lib/api-security')
    const request = new NextRequest('http://localhost/api/test', { method: 'POST' })
    const result = await validateCsrfToken(request)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Missing CSRF token')
  })

  it('rejects CSRF token when cookie is missing', async () => {
    const { validateCsrfToken } = await import('@/lib/api-security')
    const validToken = 'a'.repeat(64)
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'X-CSRF-Token': validToken },
    })
    const result = await validateCsrfToken(request)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Missing CSRF cookie')
  })

  it('rejects CSRF token when header and cookie do not match', async () => {
    const { validateCsrfToken } = await import('@/lib/api-security')
    const headerToken = 'a'.repeat(64)
    const cookieToken = 'b'.repeat(64)
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'X-CSRF-Token': headerToken, Cookie: `csrf-token=${cookieToken}` },
    })
    const result = await validateCsrfToken(request)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('CSRF token mismatch')
  })

  it('skips CSRF check for GET requests', async () => {
    const { validateCsrfToken } = await import('@/lib/api-security')
    const request = new NextRequest('http://localhost/api/test')
    const result = await validateCsrfToken(request)
    expect(result.valid).toBe(true)
  })
})

describe('isValidUuid', () => {
  it('accepts a valid UUID v4', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('rejects an invalid UUID', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false)
    expect(isValidUuid('')).toBe(false)
  })
})

describe('validateUserId', () => {
  const authedUserId = '550e8400-e29b-41d4-a716-446655440000'

  it('returns valid when IDs match and are valid UUIDs', () => {
    const result = validateUserId(authedUserId, authedUserId)
    expect(result.valid).toBe(true)
  })

  it('returns invalid when requested ID is malformed', () => {
    const result = validateUserId('bad-id', authedUserId)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid user ID format')
  })

  it('returns invalid when IDs do not match', () => {
    const result = validateUserId('660e8400-e29b-41d4-a716-446655440000', authedUserId)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unauthorized access')
  })
})

describe('sanitizeErrorForClient', () => {
  it('returns default message for errors containing "database"', () => {
    const error = new Error('Failed to connect to database')
    expect(sanitizeErrorForClient(error, 'Oops')).toBe('Oops')
  })

  it('returns default message for errors containing "credential"', () => {
    const error = new Error('Invalid credential supplied')
    expect(sanitizeErrorForClient(error, 'Oops')).toBe('Oops')
  })

  it('returns default message for non-Error input', () => {
    expect(sanitizeErrorForClient('string error', 'Oops')).toBe('Oops')
  })

  it('preserves safe short messages', () => {
    const error = new Error('Something went wrong')
    expect(sanitizeErrorForClient(error, 'Default')).toBe('Something went wrong')
  })
})

describe('getClientIp', () => {
  it('extracts IP from X-Forwarded-For header', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(request)).toBe('1.2.3.4')
  })

  it('extracts IP from X-Real-IP header as fallback', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    })
    expect(getClientIp(request)).toBe('10.0.0.1')
  })

  it('returns "unknown" when no IP headers are present', () => {
    const request = new NextRequest('http://localhost/api/test')
    expect(getClientIp(request)).toBe('unknown')
  })
})

describe('validateContentType', () => {
  it('returns valid for matching content-type', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: { 'content-type': 'application/json' },
    })
    const result = validateContentType(request, 'application/json')
    expect(result.valid).toBe(true)
  })

  it('returns invalid for mismatched content-type', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: { 'content-type': 'text/plain' },
    })
    const result = validateContentType(request, 'application/json')
    expect(result.valid).toBe(false)
  })
})
