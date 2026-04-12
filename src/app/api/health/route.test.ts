import { describe, it, expect } from 'vitest'

describe('GET /api/health', () => {
  it('returns status 200 with status field "ok"', async () => {
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  it('returns expected health response shape', async () => {
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const body = await response.json()

    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('uptime')
    expect(body).toHaveProperty('environment')
    expect(body).toHaveProperty('version')
    // services object removed to avoid leaking infrastructure details
    expect(body).not.toHaveProperty('services')
  })

  it('returns a valid ISO timestamp', async () => {
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const body = await response.json()

    const timestamp = body.timestamp
    expect(new Date(timestamp).toISOString()).toBe(timestamp)
  })
})
