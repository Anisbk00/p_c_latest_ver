import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getRateLimitHeaders, createRateLimitKey } from '@/lib/rate-limit';

/**
 * POST /api/admin/fix-nutrition-values
 * 
 * Fixes swapped calorie/protein values in global_foods table
 * 
 * This endpoint identifies records where values are physically impossible:
 * 
 * Pattern 1: protein_per_100g > 100 (impossible - can't have more than 100g protein per 100g food)
 *   -> These have calories and protein swapped
 * 
 * Pattern 2: calories_per_100g = 0 AND protein_per_100g > 10
 *   -> Likely data entry error where protein was put in calories field
 * 
 * Only fixes unverified/draft records (verified is null or false) to avoid corrupting verified data
 */
export async function POST(request: NextRequest) {
  // SECURITY: Verify admin access
  const adminSecret = request.headers.get('x-admin-secret');
  const expectedSecret = process.env.AI_WORKER_SECRET;
  if (!adminSecret || adminSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limiting
  const rateLimitKey = createRateLimitKey(request, 'admin');
  const rateLimit = checkRateLimit(rateLimitKey, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    keyPrefix: 'admin-migration',
    message: 'Too many migration requests.',
  });
  
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }
  
  try {
    const supabase = await createClient();
    
    // Get all draft records (unverified) to check for issues
    const { data: allDraftRecords, error: fetchError } = await supabase
      .from('global_foods')
      .select('id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, verified')
      .neq('verified', true); // Get all unverified records
    
    if (fetchError) {
      console.error('Error fetching problem records:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch problem records', details: fetchError.message },
        { status: 500 }
      );
    }
    
    // Identify records with impossible values
    const problemRecords: Array<any> = [];
    const fixedValues: Array<{id: string; name: string; oldCalories: number; oldProtein: number; newCalories: number; newProtein: number; issue: string}> = [];
    
    for (const record of allDraftRecords || []) {
      const calories = record.calories_per_100g || 0;
      const protein = record.protein_per_100g || 0;
      
      // Pattern 1: Protein > 100g per 100g is impossible - values are swapped
      if (protein > 100) {
        problemRecords.push({
          ...record,
          issue: 'protein_exceeds_100',
          newCalories: protein,  // Swap: protein value is actually calories
          newProtein: calories > 0 ? calories : 0, // If there was a calories value, it might be protein
        });
      }
      // Pattern 2: Zero calories but high protein (10+) - likely swapped
      else if (calories === 0 && protein > 10) {
        problemRecords.push({
          ...record,
          issue: 'zero_calories_high_protein',
          newCalories: protein,
          newProtein: 0,
        });
      }
      // Pattern 3: Calories look like protein (between 5-50 and protein is 0)
      else if (calories >= 5 && calories <= 50 && protein === 0) {
        // This could be protein entered in calories field
        // But we need more context - only flag if carbs and fats are also low
        const carbs = record.carbs_per_100g || 0;
        const fats = record.fats_per_100g || 0;
        if (carbs < 5 && fats < 5) {
          problemRecords.push({
            ...record,
            issue: 'calories_look_like_protein',
            newCalories: 0,
            newProtein: calories,
          });
        }
      }
    }
    
    if (problemRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No records need fixing',
        fixedCount: 0,
      }, { headers: getRateLimitHeaders(rateLimit) });
    }
    
    // Fix each record with the appropriate correction
    const fixPromises = problemRecords.map(record => {
      return supabase
        .from('global_foods')
        .update({
          calories_per_100g: record.newCalories,
          protein_per_100g: record.newProtein,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);
    });
    
    const results = await Promise.all(fixPromises);
    
    // Check for errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Some updates failed:', errors);
      return NextResponse.json({
        success: false,
        message: `${errors.length} updates failed`,
        fixedCount: problemRecords.length - errors.length,
        errors: errors.map(e => e.error?.message),
      }, { status: 500, headers: getRateLimitHeaders(rateLimit) });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Successfully fixed swapped nutrition values',
      fixedCount: problemRecords.length,
      fixedRecords: problemRecords.map(r => ({
        id: r.id,
        name: r.name,
        issue: r.issue,
        oldCalories: r.calories_per_100g,
        oldProtein: r.protein_per_100g,
        newCalories: r.newCalories,
        newProtein: r.newProtein,
      })),
    }, { headers: getRateLimitHeaders(rateLimit) });
    
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/fix-nutrition-values
 * 
 * Preview the records that would be fixed without actually fixing them
 */
export async function GET(request: NextRequest) {
  // SECURITY: Verify admin access
  const adminSecret = request.headers.get('x-admin-secret');
  const expectedSecret = process.env.AI_WORKER_SECRET;
  if (!adminSecret || adminSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    
    // Get all draft records (unverified) to check for issues
    const { data: allDraftRecords, error, count } = await supabase
      .from('global_foods')
      .select('id, name, name_en, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, verified, category', { count: 'exact' })
      .neq('verified', true);
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch records', details: error.message },
        { status: 500 }
      );
    }
    
    // Identify records with impossible values
    const problemRecords: Array<any> = [];
    
    for (const record of allDraftRecords || []) {
      const calories = record.calories_per_100g || 0;
      const protein = record.protein_per_100g || 0;
      const carbs = record.carbs_per_100g || 0;
      const fats = record.fats_per_100g || 0;
      
      // Pattern 1: Protein > 100g per 100g is impossible
      if (protein > 100) {
        problemRecords.push({
          ...record,
          issue: 'protein_exceeds_100',
          suggestedFix: { calories: protein, protein: calories > 0 ? calories : 0 },
        });
      }
      // Pattern 2: Zero calories but high protein
      else if (calories === 0 && protein > 10) {
        problemRecords.push({
          ...record,
          issue: 'zero_calories_high_protein',
          suggestedFix: { calories: protein, protein: 0 },
        });
      }
      // Pattern 3: Calories look like protein
      else if (calories >= 5 && calories <= 50 && protein === 0 && carbs < 5 && fats < 5) {
        problemRecords.push({
          ...record,
          issue: 'calories_look_like_protein',
          suggestedFix: { calories: 0, protein: calories },
        });
      }
    }
    
    return NextResponse.json({
      totalDraftRecords: count,
      problemCount: problemRecords.length,
      preview: problemRecords.slice(0, 50),
      description: 'These records have impossible nutrition values. Patterns detected: protein > 100g, zero calories with high protein, or calories that look like protein values.',
    });
    
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Preview failed', details: String(error) },
      { status: 500 }
    );
  }
}
