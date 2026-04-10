import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';

/**
 * GET /api/iron-coach/history
 * Load chat history for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    // Get Supabase client
    const { supabase } = await getSupabaseUser();
    const sb = supabase as any;

    // Get the most recent conversation or a specific one
    let conversation;
    if (conversationId) {
      const { data, error } = await sb
        .from('ai_conversations')
        .select('id, title, created_at, updated_at')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();
      conversation = data;
    } else {
      const { data, error } = await sb
        .from('ai_conversations')
        .select('id, title, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      conversation = data;
    }

    if (!conversation?.id) {
      return NextResponse.json({
        conversation: null,
        messages: [],
      });
    }

    // Get messages for this conversation
    const { data: messages, error: msgError } = await sb
      .from('ai_messages')
      .select('id, role, content, created_at, source, confidence')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (msgError) {
      console.error('Error loading messages:', msgError);
      return NextResponse.json({
        conversation,
        messages: [],
      });
    }

    // Parse message content (some might be JSON wrapped)
    const parsedMessages = (messages || []).map((msg: any) => {
      let content = msg.content;
      
      // Try to parse JSON content
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.text) {
          content = parsed.text;
        }
      } catch {
        // Content is plain text, keep as is
      }

      return {
        id: msg.id,
        role: msg.role,
        content,
        timestamp: msg.created_at,
        source: msg.source,
        confidence: msg.confidence,
      };
    });

    return NextResponse.json({
      conversation,
      messages: parsedMessages,
    });
  } catch (error) {
    // Handle authentication errors specifically
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error loading chat history:', error);
    return NextResponse.json(
      { error: 'Failed to load chat history' },
      { status: 500 }
    );
  }
}
