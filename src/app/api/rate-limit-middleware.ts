import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory store for demonstration (replace with Redis or DB in production)
const rateLimitStore: Record<string, { count: number, last: number }> = {}

const RATE_LIMIT = 60 // max requests per minute

export async function rateLimitMiddleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.ip || 'unknown'
  const now = Date.now()
  const windowMs = 60 * 1000

  if (!rateLimitStore[ip] || now - rateLimitStore[ip].last > windowMs) {
    rateLimitStore[ip] = { count: 1, last: now }
  } else {
    rateLimitStore[ip].count++
    rateLimitStore[ip].last = now
  }

  if (rateLimitStore[ip].count > RATE_LIMIT) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }
  return null
}
