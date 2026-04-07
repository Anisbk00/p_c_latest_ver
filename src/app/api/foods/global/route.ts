/**
 * Global Foods Search API
 * 
 * Search the global food database (Tunisian foods, etc.)
 * Requires authentication to prevent abuse / data scraping.
 * 
 * GET /api/foods/global?search=lablabi&category=soups
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const supabase = await createClient();
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const origin = searchParams.get('origin') || '';
    
    // Validate and clamp pagination
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    // SECURITY FIX: Sanitize search input — strip Supabase PostgREST operators
    // Characters like . * ( ) could be used to manipulate the OR clause
    const sanitizedSearch = search
      .replace(/[.*()']/g, '')
      .slice(0, 100);
    
    const sanitizedCategory = category.replace(/[.*()']/g, '').slice(0, 64);
    const sanitizedOrigin = origin.replace(/[.*()']/g, '').slice(0, 64);

    // Build query
    let query = supabase
      .from('global_foods')
      .select('*', { count: 'exact' })
      .order('name')
      .range(offset, offset + limit - 1);

    // Apply filters — use parameterized ilike instead of raw OR clause
    if (sanitizedSearch) {
      const pattern = `%${sanitizedSearch}%`;
      query = query.or(`name.ilike.${pattern},name_en.ilike.${pattern},name_ar.ilike.${pattern}`);
    }

    if (sanitizedCategory) {
      query = query.eq('category', sanitizedCategory);
    }

    if (sanitizedOrigin) {
      query = query.eq('origin', sanitizedOrigin);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Error searching global foods', error);
      return NextResponse.json(
        { error: 'Failed to search foods' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      foods: data,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Global foods search error', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
