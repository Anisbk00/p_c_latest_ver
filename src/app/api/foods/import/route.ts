/**
 * Global Foods Import API
 * 
 * Imports food data into the global_foods table.
 * Used to populate the Tunisian food database.
 * 
 * POST /api/foods/import
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

interface FoodItem {
  name: string;
  nameEn: string;
  nameFr: string;
  nameAr: string;
  category: string;
  origin: string;
  brand: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatsPer100g: number;
  typicalServingGrams: number;
  aliases: string; // JSON string
}

interface ImportRequest {
  foods: FoodItem[];
  clearExisting?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Check for service role key for authorization
    const authHeader = request.headers.get('authorization');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // SECURITY FIX: Compare FULL service key, not just first 20 chars
    // Only allow in development with full key, or production with full key
    const isAuthorized = serviceKey && authHeader === `Bearer ${serviceKey}`;
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }


    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // Strict Zod validation
    const { FoodImportSchema } = await import('@/lib/validation')
    const parseResult = FoodImportSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      }, { status: 400 })
    }
    body = parseResult.data
    // Extra: sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    const { foods, clearExisting = false } = body;

    const adminClient = createAdminClient();

    // Clear existing foods if requested
    if (clearExisting) {
      const { error: deleteError } = await adminClient
        .from('global_foods')
        .delete()
        .eq('origin', 'tunisian');
      
      if (deleteError) {
        console.error('Error clearing existing foods:', deleteError);
      }
    }

    // Transform foods to database format
    const foodsToInsert = foods.map((food) => ({
      name: food.name,
      name_en: food.nameEn || food.name,
      name_fr: food.nameFr || null,
      name_ar: food.nameAr || null,
      category: food.category || 'other',
      origin: food.origin || 'tunisian',
      brand: food.brand || null,
      calories_per_100g: food.caloriesPer100g || 0,
      protein_per_100g: food.proteinPer100g || 0,
      carbs_per_100g: food.carbsPer100g || 0,
      fats_per_100g: food.fatsPer100g || 0,
      typical_serving_grams: food.typicalServingGrams || 100,
      aliases: food.aliases ? JSON.parse(food.aliases) : [],
      verified: true,
    }));

    // Insert in batches of 50 to avoid request size limits
    const BATCH_SIZE = 50;
    const results = {
      total: foodsToInsert.length,
      inserted: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < foodsToInsert.length; i += BATCH_SIZE) {
      const batch = foodsToInsert.slice(i, i + BATCH_SIZE);
      
      const { data, error } = await adminClient
        .from('global_foods')
        .insert(batch)
        .select('id');

      if (error) {
        console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error);
        results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      } else {
        results.inserted += data?.length || 0;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${results.inserted} of ${results.total} foods`,
      results,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check import status — requires auth
export async function GET(request: NextRequest) {
  try {
    // SECURITY FIX: Require full service key for GET as well
    const authHeader = request.headers.get('authorization');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isAuthorized = serviceKey && authHeader === `Bearer ${serviceKey}`;
    
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    
    // Count foods by origin
    const { data, error } = await adminClient
      .from('global_foods')
      .select('origin');
    
    if (error) {
      return NextResponse.json({
        imported: false,
        error: error.message,
      });
    }
    
    // Count by origin
    const counts: Record<string, number> = {};
    data?.forEach((item) => {
      counts[item.origin] = (counts[item.origin] || 0) + 1;
    });
    
    return NextResponse.json({
      imported: true,
      totalFoods: data?.length || 0,
      byOrigin: counts,
    });
  } catch (error) {
    return NextResponse.json({
      imported: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
