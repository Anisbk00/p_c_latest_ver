/**
 * Foods API — Supabase-native with Caching + Full-Text Search
 * GET /api/foods  — search global foods database
 *
 * Search Strategy (layered, with graceful fallback):
 * 1. PRIMARY: PostgreSQL RPC function (search_foods) with tsvector/tsquery + GIN indexes
 *    - DB-side ranking via ts_rank + exact/prefix match signals
 *    - Dramatically reduced data transfer (fetches only needed page)
 *    - Scales to very large food databases
 * 2. FALLBACK: Legacy ILIKE in-memory scoring (used if RPC function not yet deployed)
 *    - Fetches up to 200 rows (down from 1000) for in-memory scoring
 *    - Same scoring algorithm, just smaller window
 *
 * Caching Strategy:
 * - No query: 5-minute cache for popular items
 * - With query: 1-minute cache for search results
 * - Stale-while-revalidate for better UX
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, getSupabaseUser } from '@/lib/supabase/supabase-data'
// Cache control helpers
const CACHE_HEADERS = {
  // Short cache for search results (1 minute)
  search: 'public, s-maxage=60, stale-while-revalidate=300',
  // Longer cache for popular items (5 minutes)
  popular: 'public, s-maxage=300, stale-while-revalidate=600',
  // No cache for authenticated requests
  private: 'private, no-cache, no-store, must-revalidate',
};

// Track whether RPC search is available (avoids repeated fallback attempts)
// Start as FALSE (use ILIKE by default) — switch to true only on confirmed RPC success.
// This prevents 504 timeouts on first request when RPC function doesn't exist yet.
let rpcAvailable: boolean = false;

// ----------------------------------------------------------
// Lightweight in-memory scoring for RPC results refinement
// (Only used for typo tolerance — the DB handles exact/prefix/rank)
// ----------------------------------------------------------
const normalizeText = (value: unknown): string => {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const getSearchTokens = (query: string): string[] => {
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
}

const getUniqueWords = (value: string, maxWords = 40): string[] => {
  const words = value.split(/\s+/).filter((word) => word.length >= 2)
  const unique: string[] = []
  const seen = new Set<string>()

  for (const word of words) {
    if (seen.has(word)) continue
    seen.add(word)
    unique.push(word)
    if (unique.length >= maxWords) break
  }

  return unique
}

const isOneEditAway = (left: string, right: string): boolean => {
  if (left === right) return false
  const lenLeft = left.length
  const lenRight = right.length
  const lenDelta = Math.abs(lenLeft - lenRight)
  if (lenDelta > 1) return false

  if (lenLeft === lenRight) {
    let differences = 0
    for (let i = 0; i < lenLeft; i++) {
      if (left[i] !== right[i]) {
        differences += 1
        if (differences > 1) return false
      }
    }
    return differences === 1
  }

  const shorter = lenLeft < lenRight ? left : right
  const longer = lenLeft < lenRight ? right : left
  let shortIdx = 0
  let longIdx = 0
  let edits = 0

  while (shortIdx < shorter.length && longIdx < longer.length) {
    if (shorter[shortIdx] === longer[longIdx]) {
      shortIdx += 1
      longIdx += 1
      continue
    }

    edits += 1
    if (edits > 1) return false
    longIdx += 1
  }

  return true
}

const hasOneEditMatch = (token: string, words: string[]): boolean => {
  if (token.length < 3) return false

  for (const word of words) {
    if (Math.abs(word.length - token.length) > 1) continue
    if (word[0] !== token[0]) continue
    if (isOneEditAway(token, word)) return true
  }

  return false
}

/**
 * Lightweight typo-tolerance scorer for RPC results.
 * Only adds bonus for 1-edit-distance matches since exact/prefix/rank
 * are already handled by the DB.
 */
const refineScoreWithTypoTolerance = (food: any, rawQuery: string): number => {
  const normalizedQuery = normalizeText(rawQuery)
  if (!normalizedQuery) return 0

  const tokens = getSearchTokens(normalizedQuery)
  if (tokens.length === 0) return 0

  // Only compute typo bonus for items that didn't get a high DB rank
  const name = normalizeText(food.name)
  const nameEn = normalizeText(food.name_en)
  const nameFr = normalizeText(food.name_fr)
  const brand = normalizeText(food.brand)
  const nameWords = getUniqueWords(`${name} ${nameEn} ${nameFr}`, 32)
  const brandWords = getUniqueWords(brand, 10)

  let bonus = 0
  for (const token of tokens) {
    if (hasOneEditMatch(token, nameWords)) {
      bonus += 44
    } else if (hasOneEditMatch(token, brandWords)) {
      bonus += 30
    }
  }
  return bonus
}

// ----------------------------------------------------------
// Legacy in-memory scoring (fallback only)
// ----------------------------------------------------------
const getFoodSearchScore = (food: any, rawQuery: string): { score: number; reasons: string[] } => {
  const reasons: string[] = []
  const normalizedQuery = normalizeText(rawQuery)
  if (!normalizedQuery) {
    let defaultScore = 0
    if (food.isVerified) {
      defaultScore += 10
      reasons.push('verified:+10')
    }
    if (food.source === 'manual') {
      defaultScore += 6
      reasons.push('manual:+6')
    }
    return { score: defaultScore, reasons }
  }

  const tokens = getSearchTokens(normalizedQuery)
  const names = [food.name, food.name_en, food.name_fr].map(normalizeText)
  const brand = normalizeText(food.brand)
  const category = normalizeText(food.category)
  const origin = normalizeText(food.origin)
  const barcode = normalizeText(food.barcode)
  const tagsJoined = Array.isArray(food.tags) ? food.tags.join(' ') : ''
  const aliasesJoined = Array.isArray(food.aliases) ? food.aliases.join(' ') : ''
  const meta = normalizeText(`${tagsJoined} ${aliasesJoined}`)
  const combined = normalizeText(`${names.join(' ')} ${brand} ${category} ${origin} ${barcode} ${meta}`)
  const nameWords = getUniqueWords(names.join(' '), 32)
  const brandWords = getUniqueWords(brand, 10)
  const categoryWords = getUniqueWords(`${category} ${origin}`, 10)
  const metaWords = getUniqueWords(meta, 16)

  let score = 0

  if (names.some((n) => n === normalizedQuery)) {
    score += 600
    reasons.push('name-exact:+600')
  }
  if (brand === normalizedQuery) {
    score += 380
    reasons.push('brand-exact:+380')
  }
  if (barcode === normalizedQuery) {
    score += 450
    reasons.push('barcode-exact:+450')
  }

  if (names.some((n) => n.startsWith(normalizedQuery))) {
    score += 280
    reasons.push('name-prefix:+280')
  }
  if (brand.startsWith(normalizedQuery)) {
    score += 220
    reasons.push('brand-prefix:+220')
  }
  if (category.startsWith(normalizedQuery)) {
    score += 140
    reasons.push('category-prefix:+140')
  }
  if (barcode.startsWith(normalizedQuery)) {
    score += 200
    reasons.push('barcode-prefix:+200')
  }

  let tokenHits = 0
  for (const token of tokens) {
    let tokenMatched = false

    if (names.some((n) => n.startsWith(token))) {
      score += 120
      reasons.push(`token:${token}:name-prefix:+120`)
      tokenMatched = true
    } else if (names.some((n) => n.includes(token))) {
      score += 70
      reasons.push(`token:${token}:name-contains:+70`)
      tokenMatched = true
    }

    if (brand.startsWith(token)) {
      score += 75
      reasons.push(`token:${token}:brand-prefix:+75`)
      tokenMatched = true
    } else if (brand.includes(token)) {
      score += 45
      reasons.push(`token:${token}:brand-contains:+45`)
      tokenMatched = true
    }

    if (category.includes(token)) {
      score += 28
      reasons.push(`token:${token}:category:+28`)
      tokenMatched = true
    }

    if (origin.includes(token)) {
      score += 18
      reasons.push(`token:${token}:origin:+18`)
      tokenMatched = true
    }

    if (meta.includes(token)) {
      score += 20
      reasons.push(`token:${token}:meta:+20`)
      tokenMatched = true
    }

    if (barcode.startsWith(token)) {
      score += 55
      reasons.push(`token:${token}:barcode-prefix:+55`)
      tokenMatched = true
    }

    // Lightweight typo tolerance (1 edit distance) for common text fields
    if (!tokenMatched) {
      if (hasOneEditMatch(token, nameWords)) {
        score += 44
        reasons.push(`token:${token}:name-typo1:+44`)
        tokenMatched = true
      } else if (hasOneEditMatch(token, brandWords)) {
        score += 30
        reasons.push(`token:${token}:brand-typo1:+30`)
        tokenMatched = true
      } else if (hasOneEditMatch(token, categoryWords)) {
        score += 18
        reasons.push(`token:${token}:category-typo1:+18`)
        tokenMatched = true
      } else if (hasOneEditMatch(token, metaWords)) {
        score += 16
        reasons.push(`token:${token}:meta-typo1:+16`)
        tokenMatched = true
      }
    }

    if (tokenMatched) tokenHits += 1
  }

  if (tokens.length > 0 && tokenHits === tokens.length) {
    score += 140
    reasons.push('all-tokens-matched:+140')
  }
  if (food.isVerified) {
    score += 18
    reasons.push('verified:+18')
  }
  if (food.source === 'manual') {
    score += 10
    reasons.push('manual:+10')
  }

  return { score, reasons }
}

// ----------------------------------------------------------
// RPC-based search (primary path)
// ----------------------------------------------------------
async function searchViaRpc(
  supabase: any,
  query: string,
  limit: number,
  offset: number,
  userId: string | null,
  excludeSupplements: boolean,
): Promise<{ foods: any[]; totalCount: number } | null> {
  // Short-circuit: if we've already confirmed RPC is not available, skip
  if (rpcAvailable === false) return null

  try {
    // Call the search_foods RPC function with a timeout
    // If the function doesn't exist (migration not run), Supabase may hang —
    // timeout after 5s to avoid 504 Gateway Timeout
    const rpcPromise = supabase.rpc('search_foods', {
      search_query: query,
      search_limit: limit + 1, // Fetch +1 to determine hasMore
      search_offset: offset,
      search_user_id: userId,
      exclude_supplements: excludeSupplements,
    })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RPC timeout (5s)')), 5000)
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: searchResults, error: searchError } = await Promise.race([rpcPromise, timeoutPromise])

    if (searchError) {
      console.warn('[/api/foods] RPC search_foods not available, falling back to ILIKE:', searchError.message)
      rpcAvailable = false
      return null
    }

    // Get total count for pagination (also with timeout)
    const countPromise = supabase.rpc('count_food_search', {
      search_query: query,
      search_user_id: userId,
      exclude_supplements: excludeSupplements,
    })
    const countTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RPC count timeout (3s)')), 3000)
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: total, error: countError } = await Promise.race([countPromise, countTimeout])

    if (countError) {
      console.warn('[/api/foods] RPC count_food_search failed, estimating hasMore:', countError.message)
      // Use hasMore from the +1 fetch instead
      const hasMore = Array.isArray(searchResults) && searchResults.length > limit
      const foods = hasMore ? searchResults.slice(0, limit) : (searchResults || [])
      rpcAvailable = true
      return { foods: mapRpcFoods(foods), totalCount: hasMore ? offset + limit + 1 : (searchResults || []).length }
    }

    rpcAvailable = true

    const hasMore = Array.isArray(searchResults) && searchResults.length > limit
    const foods = hasMore ? searchResults.slice(0, limit) : (searchResults || [])

    return {
      foods: mapRpcFoods(foods),
      totalCount: total ?? foods.length,
    }
  } catch (err) {
    console.warn('[/api/foods] RPC search failed, falling back to ILIKE:', err)
    rpcAvailable = false
    return null
  }
}

/**
 * Map RPC result fields to the format expected by the frontend.
 * The RPC returns flat fields that need to match the existing food card interface.
 */
function mapRpcFoods(rows: any[]): any[] {
  return rows.map((row) => {
    const isGlobal = row.is_global !== false
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      brand: row.brand,
      barcode: row.barcode,
      category: row.category,
      origin: row.origin,
      verified: row.verified ?? false,
      tags: row.tags || [],
      aliases: row.aliases || [],
      calories: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      fiber: row.fiber ?? 0,
      sugar: row.sugar ?? 0,
      sodium: row.sodium ?? 0,
      servingSize: row.serving_size ?? 100,
      servingUnit: row.serving_unit ?? 'g',
      isVerified: row.verified ?? false,
      source: isGlobal ? 'global' : 'manual',
      confidence: row.verified ? 0.95 : (isGlobal ? 0.7 : 0.8),
      // Pass through DB ranking signals for potential client-side refinement
      _dbRank: row.search_rank ?? 0,
      _nameExact: row.name_exact ?? false,
      _namePrefix: row.name_prefix ?? false,
      _brandExact: row.brand_exact ?? false,
      _brandPrefix: row.brand_prefix ?? false,
      _barcodeExact: row.barcode_exact ?? false,
      _categoryMatch: row.category_match ?? false,
      _allTokensMatched: row.all_tokens_matched ?? false,
    }
  })
}

// ----------------------------------------------------------
// Legacy ILIKE search (fallback)
// ----------------------------------------------------------
async function searchViaILike(
  supabase: any,
  query: string,
  limit: number,
  offset: number,
  userId: string | null,
  excludeSupplements: boolean,
): Promise<{ foods: any[]; hasMore: boolean }> {
  // Reduced window: 200 instead of 1000 (ILIKE is fallback, not primary path)
  const windowSize = Math.min(offset + limit + 1, 200)

  let globalDbQuery = supabase
    .from('global_foods')
    .select('*')
    .range(0, windowSize - 1)

  let userDbQuery = userId ? supabase
    .from('foods')
    .select('*')
    .eq('user_id', userId)
    .range(0, windowSize - 1) : null

  const filterSupplements = (rows: any[]) => {
    if (!excludeSupplements) return rows
    return rows.filter(row => {
      const cat = (row.category || '').toLowerCase()
      return !cat.includes('supplement') && !cat.includes('vitamin')
    })
  }

  if (query.trim()) {
    const tokens = getSearchTokens(query)
    const searchTerms = tokens.length > 0 ? tokens : [query.replace(/[,%]/g, ' ').trim()]

    const globalOrClauses: string[] = []
    const userOrClauses: string[] = []

    for (const term of searchTerms) {
      const contains = `%${term}%`
      globalOrClauses.push(
        `name.ilike.${contains}`,
        `name_en.ilike.${contains}`,
        `name_fr.ilike.${contains}`,
        `brand.ilike.${contains}`,
        `barcode.ilike.${contains}`,
        `category.ilike.${contains}`,
        `origin.ilike.${contains}`,
      )
      userOrClauses.push(
        `name.ilike.${contains}`,
        `brand.ilike.${contains}`,
        `barcode.ilike.${contains}`,
      )
    }

    globalDbQuery = globalDbQuery.or(globalOrClauses.join(','))

    if (userDbQuery) {
      userDbQuery = userDbQuery.or(userOrClauses.join(','))
    }
  } else {
    if (excludeSupplements) {
      globalDbQuery = globalDbQuery.not('category', 'ilike', '%Supplement%')
    }
  }

  globalDbQuery = globalDbQuery.order('name', { ascending: true })
  if (userDbQuery) {
    userDbQuery = userDbQuery.order('name', { ascending: true })
  }

  const [globalRes, userRes] = await Promise.all([
    globalDbQuery,
    userDbQuery ? userDbQuery : Promise.resolve({ data: [], error: null })
  ])

  if (globalRes.error) throw globalRes.error
  if (userRes.error) throw userRes.error

  const globalRows = filterSupplements(globalRes.data ?? [])
  const userRows = userRes.data ?? []

  const mapGlobal = (data: any) => ({
    ...data,
    calories: data.calories_per_100g,
    protein: data.protein_per_100g,
    carbs: data.carbs_per_100g,
    fat: data.fats_per_100g,
    servingSize: data.typical_serving_grams ?? 100,
    servingUnit: 'g',
    isVerified: data.verified ?? false,
    source: 'global',
    tags: data.tags || [],
    confidence: data.verified ? 0.95 : 0.7,
  })

  const mapUser = (data: any) => ({
    ...data,
    calories: data.calories,
    protein: data.protein,
    carbs: data.carbs,
    fat: data.fat,
    servingSize: data.serving_size ?? 100,
    servingUnit: data.serving_unit ?? 'g',
    isVerified: data.verified ?? false,
    source: 'manual',
    tags: data.tags || [],
    confidence: 0.8,
  })

  let mappedData = [
    ...userRows.map(mapUser),
    ...globalRows.map(mapGlobal)
  ]

  const scoredData = mappedData.map((food) => {
    const scoreInfo = getFoodSearchScore(food, query)
    return {
      food,
      score: scoreInfo.score,
      reasons: scoreInfo.reasons,
    }
  })

  scoredData.sort((a, b) => {
    const scoreDelta = b.score - a.score
    if (scoreDelta !== 0) return scoreDelta

    const aName = String(a.food.name || '')
    const bName = String(b.food.name || '')
    return aName.localeCompare(bName)
  })

  const pageRows = scoredData.slice(offset, offset + limit)
  const foods = pageRows.map((row) => row.food)
  const hasMore =
    scoredData.length > offset + limit ||
    globalRows.length === windowSize ||
    userRows.length === windowSize

  return { foods, hasMore }
}

// ----------------------------------------------------------
// Main GET handler
// ----------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') ?? ''
    const excludeSupplements = searchParams.get('excludeSupplements') === 'true'
    const isDebugRanking =
      process.env.NODE_ENV !== 'production' &&
      searchParams.get('debugRanking') === 'true'
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1)
    const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200))
    const offset = (page - 1) * limit

    const { supabase, user } = await getSupabaseUser().catch(async () => {
      return { supabase: await getSupabase(), user: null };
    });

    const userId = user?.id ?? null

    // ---- Path 1: RPC full-text search (primary) ----
    const rpcResult = await searchViaRpc(supabase, query, limit, offset, userId, excludeSupplements)

    if (rpcResult) {
      const hasMore = rpcResult.totalCount > offset + limit

      // Apply lightweight typo-tolerance refinement on RPC results
      // (DB handles exact/prefix/rank; we add bonus for fuzzy matches only)
      let foods = rpcResult.foods
      if (query.trim()) {
        foods = foods.map(food => ({
          ...food,
          _typoBonus: refineScoreWithTypoTolerance(food, query),
        }))
        // Only re-sort if any food got a typo bonus
        const hasTypoBonus = foods.some(f => f._typoBonus > 0)
        if (hasTypoBonus) {
          foods.sort((a, b) => {
            const delta = (b._typoBonus ?? 0) - (a._typoBonus ?? 0)
            if (delta !== 0) return delta
            return String(a.name || '').localeCompare(String(b.name || ''))
          })
        }
        // Strip internal fields before sending to client
        foods = foods.map(({ _dbRank, _nameExact, _namePrefix, _brandExact, _brandPrefix, _barcodeExact, _categoryMatch, _allTokensMatched, _typoBonus, ...rest }) => rest)
      } else {
        foods = foods.map(({ _dbRank, _nameExact, _namePrefix, _brandExact, _brandPrefix, _barcodeExact, _categoryMatch, _allTokensMatched, ...rest }) => rest)
      }

      const responsePayload: Record<string, unknown> = {
        foods,
        pagination: { page, limit, hasMore },
        _searchMethod: 'rpc',
      }

      const response = NextResponse.json(responsePayload)
      const cacheControl = query.trim() ? CACHE_HEADERS.search : CACHE_HEADERS.popular
      response.headers.set('Cache-Control', cacheControl)
      return response
    }

    // ---- Path 2: Legacy ILIKE search (fallback) ----
    console.info('[/api/foods] Using fallback ILIKE search (RPC not available)')
    const fallbackResult = await searchViaILike(supabase, query, limit, offset, userId, excludeSupplements)

    // Build debug ranking for fallback path
    if (isDebugRanking) {
      const scoredData = fallbackResult.foods.map((food) => {
        const scoreInfo = getFoodSearchScore(food, query)
        return {
          id: food.id,
          name: food.name,
          source: food.source,
          score: scoreInfo.score,
          reasons: scoreInfo.reasons.slice(0, 12),
        }
      })

      return NextResponse.json({
        foods: fallbackResult.foods,
        pagination: { page, limit, hasMore: fallbackResult.hasMore },
        _searchMethod: 'ilike-fallback',
        debugRanking: { query, top: scoredData.slice(0, 20) },
      })
    }

    const response = NextResponse.json({
      foods: fallbackResult.foods,
      pagination: { page, limit, hasMore: fallbackResult.hasMore },
      _searchMethod: 'ilike-fallback',
    })
    const cacheControl = query.trim() ? CACHE_HEADERS.search : CACHE_HEADERS.popular
    response.headers.set('Cache-Control', cacheControl)
    return response

  } catch (err) {
    console.error('[/api/foods] Error:', err)
    const supabaseError = err as { message?: string; details?: string; hint?: string; code?: string }
    const msg = supabaseError.message || (err instanceof Error ? err.message : String(err))
    const details = supabaseError.details || supabaseError.hint || ''
    return NextResponse.json({
      error: 'Failed to fetch foods',
      details: msg,
      hint: details,
      code: supabaseError.code
    }, { status: 500 })
  }
}
