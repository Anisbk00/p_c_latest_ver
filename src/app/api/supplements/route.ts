import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import {
  getSupplements,
  addSupplement,
  updateSupplement,
  deleteSupplement,
  getOrCreateProfile,
} from '@/lib/supabase/data-service';

const normalizeText = (value: unknown): string => {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
};

const getSearchTokens = (query: string): string[] => {
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
};

const getUniqueWords = (value: string, maxWords = 36): string[] => {
  const words = value.split(/\s+/).filter((word) => word.length >= 2);
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    unique.push(word);
    if (unique.length >= maxWords) break;
  }

  return unique;
};

const isOneEditAway = (left: string, right: string): boolean => {
  if (left === right) return false;
  const lenLeft = left.length;
  const lenRight = right.length;
  const lenDelta = Math.abs(lenLeft - lenRight);
  if (lenDelta > 1) return false;

  if (lenLeft === lenRight) {
    let differences = 0;
    for (let i = 0; i < lenLeft; i++) {
      if (left[i] !== right[i]) {
        differences += 1;
        if (differences > 1) return false;
      }
    }
    return differences === 1;
  }

  const shorter = lenLeft < lenRight ? left : right;
  const longer = lenLeft < lenRight ? right : left;
  let shortIdx = 0;
  let longIdx = 0;
  let edits = 0;

  while (shortIdx < shorter.length && longIdx < longer.length) {
    if (shorter[shortIdx] === longer[longIdx]) {
      shortIdx += 1;
      longIdx += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;
    longIdx += 1;
  }

  return true;
};

const hasOneEditMatch = (token: string, words: string[]): boolean => {
  if (token.length < 3) return false;

  for (const word of words) {
    if (Math.abs(word.length - token.length) > 1) continue;
    if (word[0] !== token[0]) continue;
    if (isOneEditAway(token, word)) return true;
  }

  return false;
};

const getSupplementSearchScore = (supplement: any, rawQuery: string): number => {
  const normalizedQuery = normalizeText(rawQuery);
  if (!normalizedQuery) {
    return supplement.verified ? 12 : 0;
  }

  const tokens = getSearchTokens(normalizedQuery);
  const name = normalizeText(supplement.name);
  const brand = normalizeText(supplement.brand);
  const category = normalizeText(supplement.category);
  const barcode = normalizeText(supplement.barcode);
  const tags = normalizeText(`supplement ${supplement.category ?? ''}`);
  const combined = normalizeText(`${name} ${brand} ${category} ${barcode} ${tags}`);

  const nameWords = getUniqueWords(name, 20);
  const brandWords = getUniqueWords(brand, 10);
  const categoryWords = getUniqueWords(category, 8);
  const tagsWords = getUniqueWords(tags, 8);

  let score = 0;
  if (name === normalizedQuery) score += 600;
  if (brand === normalizedQuery) score += 360;
  if (barcode === normalizedQuery) score += 460;

  if (name.startsWith(normalizedQuery)) score += 260;
  if (brand.startsWith(normalizedQuery)) score += 210;
  if (category.startsWith(normalizedQuery)) score += 120;
  if (barcode.startsWith(normalizedQuery)) score += 180;

  let tokenHits = 0;
  for (const token of tokens) {
    let tokenMatched = false;

    if (name.startsWith(token)) {
      score += 120;
      tokenMatched = true;
    } else if (name.includes(token)) {
      score += 72;
      tokenMatched = true;
    }

    if (brand.startsWith(token)) {
      score += 74;
      tokenMatched = true;
    } else if (brand.includes(token)) {
      score += 45;
      tokenMatched = true;
    }

    if (category.includes(token)) {
      score += 26;
      tokenMatched = true;
    }

    if (tags.includes(token)) {
      score += 16;
      tokenMatched = true;
    }

    if (barcode.startsWith(token)) {
      score += 52;
      tokenMatched = true;
    }

    if (!tokenMatched) {
      if (hasOneEditMatch(token, nameWords)) {
        score += 42;
        tokenMatched = true;
      } else if (hasOneEditMatch(token, brandWords)) {
        score += 30;
        tokenMatched = true;
      } else if (hasOneEditMatch(token, categoryWords) || hasOneEditMatch(token, tagsWords)) {
        score += 18;
        tokenMatched = true;
      }
    }

    if (tokenMatched) tokenHits += 1;
  }

  if (tokens.length > 0 && tokenHits === tokens.length) score += 130;
  if (supplement.verified) score += 16;
  if (combined.length > 0 && normalizedQuery.length > 0 && combined.includes(normalizedQuery)) score += 10;

  return score;
};

// GET /api/supplements - Get supplements for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Support both cookie and Bearer token authentication
    let user;
    try {
      const { data: { user: cookieUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !cookieUser) throw new Error('Cookie auth failed');
      user = cookieUser;
    } catch {
      // Fallback to Bearer token authentication for API testing
      user = await requireAuth(request);
    }

    // Ensure profile exists
    await getOrCreateProfile(user);

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '50', 10), 200));
    const offset = (page - 1) * limit;
    const q = searchParams.get('q') || undefined;

    const pageSize = limit;
    const windowSize = Math.min(offset + pageSize + 1, 1000);
    const supplements = await getSupplements(user.id, { category, limit: windowSize, offset: 0, q });

    const scoredSupplements = supplements
      .map((s) => ({ supplement: s, score: getSupplementSearchScore(s, q || '') }))
      .sort((a, b) => {
        const scoreDelta = b.score - a.score;
        if (scoreDelta !== 0) return scoreDelta;
        return String(a.supplement.name || '').localeCompare(String(b.supplement.name || ''));
      });

    const pageItems = scoredSupplements
      .slice(offset, offset + pageSize)
      .map((row) => row.supplement);

    const hasMore =
      scoredSupplements.length > offset + pageSize ||
      supplements.length === windowSize;

    // Format for compatibility with Food interface
    const formattedSupplements = pageItems.map((s: any) => ({
      id: s.id,
      name: s.name,
      brand: s.brand,
      barcode: s.barcode,
      category: s.category,
      servingSize: s.serving_size,
      servingUnit: s.serving_unit,
      calories: s.calories_per_serving,
      protein: s.protein_per_serving,
      carbs: s.carbs_per_serving,
      fat: s.fat_per_serving,
      // Nutrients
      vitaminA: s.vitamin_a_mcg,
      vitaminC: s.vitamin_c_mg,
      vitaminD: s.vitamin_d_mcg,
      vitaminE: s.vitamin_e_mg,
      vitaminK: s.vitamin_k_mcg,
      thiamin: s.thiamin_mg,
      riboflavin: s.riboflavin_mg,
      niacin: s.niacin_mg,
      b6: s.b6_mg,
      folate: s.folate_mcg,
      b12: s.b12_mcg,
      biotin: s.biotin_mcg,
      pantothenicAcid: s.pantothenic_acid_mg,
      calcium: s.calcium_mg,
      iron: s.iron_mg,
      magnesium: s.magnesium_mg,
      zinc: s.zinc_mg,
      selenium: s.selenium_mcg,
      potassium: s.potassium_mg,
      omega3: s.omega3_mg,
      // Metadata — match Food interface fields
      source: 'supplements',  // Always tag as supplements table
      isVerified: s.verified,
      verified: s.verified,
      tags: ['supplement', s.category].filter(Boolean),
      confidence: 0.95,
      notes: s.notes,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    return NextResponse.json({
      supplements: formattedSupplements,
      pagination: {
        page,
        limit: pageSize,
        hasMore,
      },
    });
  } catch (error) {
    console.error('Error fetching supplements:', error);
    return NextResponse.json({ error: 'Failed to fetch supplements' }, { status: 500 });
  }
}

// POST /api/supplements - Create a new supplement
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Support both cookie and Bearer token authentication
    let user;
    try {
      const { data: { user: cookieUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !cookieUser) throw new Error('Cookie auth failed');
      user = cookieUser;
    } catch {
      // Fallback to Bearer token authentication for API testing
      user = await requireAuth(request);
    }

    // Ensure profile exists
    await getOrCreateProfile(user);


    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { SupplementCreateSchema } = await import('@/lib/validation')
    const parseResult = SupplementCreateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten()
      }, { status: 400 })
    }
    body = parseResult.data
    // Sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    const supplement = await addSupplement(user.id, {
      name: body.name,
      brand: body.brand || null,
      barcode: body.barcode || null,
      category: body.category || 'supplement',
      serving_size: body.servingSize || 1,
      serving_unit: body.servingUnit || 'unit',
      calories_per_serving: body.calories || 0,
      protein_per_serving: body.protein || 0,
      carbs_per_serving: body.carbs || 0,
      fat_per_serving: body.fat || 0,
      // Vitamins
      vitamin_a_mcg: body.vitaminA || null,
      vitamin_c_mg: body.vitaminC || null,
      vitamin_d_mcg: body.vitaminD || null,
      vitamin_e_mg: body.vitaminE || null,
      vitamin_k_mcg: body.vitaminK || null,
      thiamin_mg: body.thiamin || null,
      riboflavin_mg: body.riboflavin || null,
      niacin_mg: body.niacin || null,
      b6_mg: body.b6 || null,
      folate_mcg: body.folate || null,
      b12_mcg: body.b12 || null,
      biotin_mcg: body.biotin || null,
      pantothenic_acid_mg: body.pantothenicAcid || null,
      // Minerals
      calcium_mg: body.calcium || null,
      iron_mg: body.iron || null,
      magnesium_mg: body.magnesium || null,
      zinc_mg: body.zinc || null,
      selenium_mcg: body.selenium || null,
      potassium_mg: body.potassium || null,
      omega3_mg: body.omega3 || null,
      // Metadata
      source: body.source || 'manual',
      verified: body.verified || false,
      notes: body.notes || null,
    });

    if (!supplement) {
      return NextResponse.json(
        { error: 'Failed to create supplement' },
        { status: 500 }
      );
    }

    return NextResponse.json({ supplement });
  } catch (error) {
    console.error('Error creating supplement:', error);
    return NextResponse.json({ error: 'Failed to create supplement' }, { status: 500 });
  }
}

// PUT /api/supplements - Update a supplement
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Supplement ID required' }, { status: 400 });
    }

    // Map update data to database schema
    const dbUpdates: Record<string, unknown> = {};

    if (updateData.name !== undefined) dbUpdates.name = updateData.name;
    if (updateData.brand !== undefined) dbUpdates.brand = updateData.brand;
    if (updateData.barcode !== undefined) dbUpdates.barcode = updateData.barcode;
    if (updateData.category !== undefined) dbUpdates.category = updateData.category;
    if (updateData.servingSize !== undefined) dbUpdates.serving_size = updateData.servingSize;
    if (updateData.servingUnit !== undefined) dbUpdates.serving_unit = updateData.servingUnit;
    if (updateData.calories !== undefined) dbUpdates.calories_per_serving = updateData.calories;
    if (updateData.protein !== undefined) dbUpdates.protein_per_serving = updateData.protein;
    if (updateData.carbs !== undefined) dbUpdates.carbs_per_serving = updateData.carbs;
    if (updateData.fat !== undefined) dbUpdates.fat_per_serving = updateData.fat;
    if (updateData.notes !== undefined) dbUpdates.notes = updateData.notes;
    if (updateData.verified !== undefined) dbUpdates.verified = updateData.verified;

    const supplement = await updateSupplement(user.id, id, dbUpdates);

    if (!supplement) {
      return NextResponse.json({ error: 'Supplement not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ supplement });
  } catch (error) {
    console.error('Error updating supplement:', error);
    return NextResponse.json({ error: 'Failed to update supplement' }, { status: 500 });
  }
}

// DELETE /api/supplements - Delete a supplement
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Supplement ID required' }, { status: 400 });
    }

    const success = await deleteSupplement(user.id, id);

    if (!success) {
      return NextResponse.json({ error: 'Supplement not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting supplement:', error);
    return NextResponse.json({ error: 'Failed to delete supplement' }, { status: 500 });
  }
}
