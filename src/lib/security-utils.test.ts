import { describe, it, expect } from 'vitest'
import {
  sanitizeUrl,
  sanitizeString,
  sanitizeAIContent,
  sanitizeStringPlain,
  validateNumber,
} from '@/lib/security-utils'

describe('sanitizeUrl', () => {
  it('blocks javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('')
  })

  it('blocks vbscript: URLs', () => {
    expect(sanitizeUrl('vbscript:MsgBox("xss")')).toBe('')
    expect(sanitizeUrl('VBSCRIPT:MsgBox("xss")')).toBe('')
  })

  it('blocks non-image data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('')
    expect(sanitizeUrl('data:application/json,{"evil":true}')).toBe('')
  })

  it('allows valid https: URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/')
  })

  it('returns empty string for null/undefined input', () => {
    expect(sanitizeUrl(null)).toBe('')
    expect(sanitizeUrl(undefined)).toBe('')
  })
})

describe('sanitizeString', () => {
  it('escapes HTML entities', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).not.toContain('<script>')
    expect(sanitizeString('a & b')).toContain('&amp;')
    expect(sanitizeString('a < b')).toContain('&lt;')
  })

  it('returns empty string for null/undefined', () => {
    expect(sanitizeString(null)).toBe('')
    expect(sanitizeString(undefined)).toBe('')
  })

  it('respects maxLength parameter', () => {
    const result = sanitizeString('a'.repeat(1000), 10)
    expect(result.length).toBeLessThanOrEqual(10)
  })
})

describe('sanitizeAIContent', () => {
  it('removes script tags', () => {
    const input = '<script>alert("xss")</script>Hello'
    const result = sanitizeAIContent(input)
    expect(result).not.toContain('<script')
    expect(result).toContain('Hello')
  })

  it('removes event handlers', () => {
    const input = '<div onclick="alert(1)">Click me</div>'
    const result = sanitizeAIContent(input)
    expect(result).not.toContain('onclick')
  })

  it('removes javascript: protocol', () => {
    const input = '<a href="javascript:alert(1)">link</a>'
    const result = sanitizeAIContent(input)
    expect(result).not.toContain('javascript')
  })
})

describe('sanitizeStringPlain', () => {
  it('removes HTML tags without escaping entities', () => {
    const input = '<b>hello</b> & goodbye'
    const result = sanitizeStringPlain(input)
    expect(result).not.toContain('<b>')
    expect(result).toContain('hello & goodbye')
  })

  it('removes javascript: protocol variants', () => {
    const result = sanitizeStringPlain('visit javascript:void(0) now')
    expect(result).not.toContain('javascript:')
  })
})

describe('validateNumber', () => {
  it('returns number for valid numeric input', () => {
    expect(validateNumber('42')).toBe(42)
    expect(validateNumber(3.14)).toBe(3.14)
  })

  it('returns null for invalid input', () => {
    expect(validateNumber('abc')).toBe(null)
    expect(validateNumber(null)).toBe(null)
    expect(validateNumber(undefined)).toBe(null)
  })

  it('respects min and max bounds', () => {
    expect(validateNumber('5', 0, 10)).toBe(5)
    expect(validateNumber('-1', 0, 10)).toBe(null)
    expect(validateNumber('15', 0, 10)).toBe(null)
  })
})
