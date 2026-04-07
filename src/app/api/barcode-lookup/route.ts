/**
 * Barcode Lookup API
 * 
 * Pipeline:
 * 1. Check local database (global_foods)
 * 2. If not found, query Open Food Facts API
 * 3. Save result to local database
 * 4. Return nutrition data
 * 
 * SECURITY: Requires authentication to prevent abuse.
 * Rate limited to prevent Open Food Facts API abuse.
 * 
 * GET /api/barcode-lookup?barcode=XXX
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/supabase/server'
import { checkRateLimit, getRateLimitHeaders, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { getOrCreateRequestId, getRequestIdHeaders, withRequestId, createRequestContext } from '@/lib/request-id'
import { logger } from '@/lib/logger'
import type { Database } from '@/lib/supabase/database.types'

type GlobalFood = Database['public']['Tables']['global_foods']['Row']

// ═══════════════════════════════════════════════════════════════
// Open Food Facts API Integration
// ═══════════════════════════════════════════════════════════════

interface OpenFoodFactsProduct {
  code: string
  product?: {
    product_name?: string
    product_name_en?: string
    brands?: string
    brands_tags?: string[]
    categories?: string
    categories_tags?: string[]
    image_front_url?: string
    image_url?: string
    nutriments?: {
      'energy-kcal_100g'?: number
      'energy-kcal'?: number
      energy_100g?: number
      proteins_100g?: number
      carbohydrates_100g?: number
      fat_100g?: number
      fiber_100g?: number
      sugars_100g?: number
      sodium_100g?: number
      salt_100g?: number
      serving_quantity?: number
      quantity?: string
    }
    serving_quantity?: number
    serving_size?: string
    quantity?: string
    ingredients_text?: string
    countries_tags?: string[]
  }
  status: number
  status_verbose?: string
}

async function fetchOpenFoodFacts(barcode: string): Promise<{
  found: boolean
  product: Partial<GlobalFood> | null
  raw?: OpenFoodFactsProduct
}> {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ProgressCompanion/1.0 (contact@progresscompanion.app)',
      },
      signal: AbortSignal.timeout(10000), // SECURITY: 10s timeout to prevent hanging
    })

    if (!response.ok) {
      logger.warn('OpenFoodFacts HTTP error', { barcode, status: response.status })
      return { found: false, product: null }
    }

    const data: OpenFoodFactsProduct = await response.json()

    if (!data.product || data.status === 0) {
      return { found: false, product: null, raw: data }
    }

    const p = data.product
    const n = p.nutriments || {}

    // Extract nutrition per 100g
    const caloriesPer100g = n['energy-kcal_100g'] ?? n['energy-kcal'] ?? (n.energy_100g ? n.energy_100g / 4.184 : null)
    const proteinPer100g = n.proteins_100g ?? null
    const carbsPer100g = n.carbohydrates_100g ?? null
    const fatPer100g = n.fat_100g ?? null
    const fiberPer100g = n.fiber_100g ?? null
    const sugarPer100g = n.sugars_100g ?? null
    const sodiumPer100g = n.sodium_100g ?? n.salt_100g ? n.salt_100g * 1000 : null

    // Skip if no nutritional data
    if (caloriesPer100g === null && proteinPer100g === null) {
      return { found: false, product: null, raw: data }
    }

    // Determine category from tags
    let category = 'Packaged Foods'
    const categories = p.categories_tags || []
    if (categories.some(c => c.includes('drink') || c.includes('beverage'))) {
      category = 'Beverages'
    } else if (categories.some(c => c.includes('dairy') || c.includes('milk'))) {
      category = 'Dairy'
    } else if (categories.some(c => c.includes('meat') || c.includes('poultry'))) {
      category = 'Meat'
    } else if (categories.some(c => c.includes('snack') || c.includes('candy'))) {
      category = 'Snacks'
    } else if (categories.some(c => c.includes('cereal') || c.includes('breakfast'))) {
      category = 'Breakfast'
    } else if (categories.some(c => c.includes('sauce') || c.includes('condiment'))) {
      category = 'Condiments'
    }

    // Determine origin from country tags
    let origin = 'International'
    const countries = p.countries_tags || []
    if (countries.some(c => c.includes('tunisia') || c.includes('tunisie'))) {
      origin = 'Tunisian'
    } else if (countries.some(c => c.includes('france') || c.includes('franca'))) {
      origin = 'French'
    } else if (countries.some(c => c.includes('united-states') || c.includes('usa'))) {
      origin = 'American'
    }

    // Get serving size
    const servingSize = p.serving_quantity ?? n.serving_quantity ?? 100

    // Build product name — SECURITY: Sanitize and truncate
    const name = String(p.product_name || p.product_name_en || 'Unknown Product').slice(0, 128)
    const brand = p.brands?.split(',')[0]?.trim().slice(0, 64) || null

    const product: Partial<GlobalFood> = {
      name,
      name_en: p.product_name_en ? p.product_name_en.slice(0, 128) : name,
      barcode,
      brand,
      category,
      origin,
      calories_per_100g: caloriesPer100g ?? 0,
      protein_per_100g: proteinPer100g ?? 0,
      carbs_per_100g: carbsPer100g ?? 0,
      fats_per_100g: fatPer100g ?? 0,
      fiber_per_100g: fiberPer100g,
      sugar_per_100g: sugarPer100g,
      sodium_per_100g: sodiumPer100g,
      typical_serving_grams: servingSize,
      verified: false,
    }

    return { found: true, product, raw: data }
  } catch (error) {
    logger.error('OpenFoodFacts fetch error', { barcode, error })
    return { found: false, product: null }
  }
}

// ═══════════════════════════════════════════════════════════════
// Main API Handler
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_STANDARD)

      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: RATE_LIMITS.API_STANDARD.message, requestId },
          { status: 429, headers: { ...getRateLimitHeaders(rateLimitResult), ...getRequestIdHeaders(requestId) } }
        )
      }

      // ─── Authentication (REQUIRED) ─────────────────────────────
      let user
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json({ error: 'Authentication required', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }

      // ─── Parse & Validate ──────────────────────────────────────
      const { searchParams } = new URL(request.url)
      const barcode = searchParams.get('barcode') ?? searchParams.get('code') ?? ''
      const saveToDb = searchParams.get('save') !== 'false'

      if (!barcode) {
        return NextResponse.json({ error: 'Missing barcode parameter', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }

      // Validate barcode format (EAN-13, UPC-A, EAN-8)
      const cleanBarcode = barcode.replace(/\D/g, '')
      if (cleanBarcode.length < 8 || cleanBarcode.length > 14) {
        return NextResponse.json({ error: 'Invalid barcode format', details: 'Barcode must be 8-14 digits', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }

      const supabase = await createClient()

      // Step 1: Check local database
      const { data: localFood, error: dbError } = await supabase
        .from('global_foods')
        .select('*')
        .eq('barcode', cleanBarcode)
        .maybeSingle()

      if (dbError) {
        logger.warn('BarcodeLookup database error', { barcode: cleanBarcode, error: dbError.message })
      }

      if (localFood) {
        return NextResponse.json({
          found: true,
          food: {
            id: localFood.id,
            name: localFood.name,
            brand: localFood.brand,
            barcode: localFood.barcode,
            calories: localFood.calories_per_100g,
            protein: localFood.protein_per_100g,
            carbs: localFood.carbs_per_100g,
            fat: localFood.fats_per_100g,
            fiber: localFood.fiber_per_100g,
            sugar: localFood.sugar_per_100g,
            sodium: localFood.sodium_per_100g,
            servingSize: localFood.typical_serving_grams,
            servingUnit: 'g',
            isVerified: localFood.verified,
            source: 'local',
            category: localFood.category,
            origin: localFood.origin,
          },
          source: 'local',
        })
      }

      // Step 2: Query Open Food Facts API
      const offResult = await fetchOpenFoodFacts(cleanBarcode)

      if (!offResult.found || !offResult.product) {
        return NextResponse.json({
          found: false,
          food: null,
          barcode: cleanBarcode,
          message: 'Product not found in local or Open Food Facts database',
        })
      }

      const product = offResult.product

      // Step 3: Save to local database for future use
      if (saveToDb) {
        const { error: insertError } = await supabase
          .from('global_foods')
          .insert({
            name: product.name!,
            name_en: product.name_en || product.name,
            barcode: cleanBarcode,
            brand: product.brand,
            category: product.category || 'Packaged Foods',
            origin: product.origin || 'International',
            calories_per_100g: product.calories_per_100g ?? 0,
            protein_per_100g: product.protein_per_100g ?? 0,
            carbs_per_100g: product.carbs_per_100g ?? 0,
            fats_per_100g: product.fats_per_100g ?? 0,
            fiber_per_100g: product.fiber_per_100g,
            sugar_per_100g: product.sugar_per_100g,
            sodium_per_100g: product.sodium_per_100g,
            typical_serving_grams: product.typical_serving_grams ?? 100,
            verified: false,
          })
          .select()
          .single()

        if (insertError) {
          logger.warn('BarcodeLookup insert error', {
            error: insertError.message,
            code: insertError.code,
            barcode: cleanBarcode,
            productName: product.name,
          })
        }
      }

      // Step 4: Return result
      return NextResponse.json({
        found: true,
        food: {
          id: product.id,
          name: product.name,
          brand: product.brand,
          barcode: cleanBarcode,
          calories: product.calories_per_100g ?? 0,
          protein: product.protein_per_100g ?? 0,
          carbs: product.carbs_per_100g ?? 0,
          fat: product.fats_per_100g ?? 0,
          fiber: product.fiber_per_100g,
          sugar: product.sugar_per_100g,
          sodium: product.sodium_per_100g,
          servingSize: product.typical_serving_grams ?? 100,
          servingUnit: 'g',
          isVerified: false,
          source: 'openfoodfacts',
          category: product.category,
          origin: product.origin,
          image_url: offResult.raw?.product?.image_front_url || offResult.raw?.product?.image_url,
        },
        source: 'openfoodfacts',
      })
    } catch (err) {
      logger.error('BarcodeLookup error', err, { requestId })
      return NextResponse.json({ error: 'Barcode lookup failed', requestId }, { status: 500, headers: getRequestIdHeaders(requestId) })
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// POST: Batch lookup for offline queue processing
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)

  return withRequestId(requestId, async () => {
    try {
      // Authentication required for batch operations
      let user
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json({ error: 'Authentication required', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }

      let body: any
      try {
        body = await request.json()
      } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      
      const { BarcodeBatchLookupSchema } = await import('@/lib/validation')
      const parseResult = BarcodeBatchLookupSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json({ error: 'Invalid input', details: parseResult.error.flatten(), requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      body = parseResult.data
      
      if (Array.isArray(body.barcodes)) {
        body.barcodes = body.barcodes.map((b: string) => typeof b === 'string' ? b.trim() : b)
      }
      
      // Limit batch size to prevent abuse
      const barcodes = body.barcodes.slice(0, 20)

      const results = await Promise.all(
        barcodes.map(async (barcode: string) => {
          const url = new URL(request.url)
          url.searchParams.set('barcode', barcode)
          const response = await fetch(url.toString())
          return response.json()
        })
      )

      return NextResponse.json({ results }, { headers: getRequestIdHeaders(requestId) })
    } catch (err) {
      logger.error('Batch lookup error', err, { requestId })
      return NextResponse.json({ error: 'Batch lookup failed', requestId }, { status: 500, headers: getRequestIdHeaders(requestId) })
    }
  })
}
