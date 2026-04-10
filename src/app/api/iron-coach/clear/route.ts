import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';

/**
 * DELETE /api/iron-coach/clear
 * Clear all chat history for the current user
 * 
 * Uses direct user_id-based deletion for reliability.
 * Deletes in correct order: messages first, then conversations/sessions.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const sb = supabase as any;

    console.log('[iron-coach/clear] Starting clear for user:', user.id);

    let deletedMessages = 0;
    let deletedConversations = 0;
    let deletedChatMessages = 0;
    let deletedChatSessions = 0;
    const errors: string[] = [];

    // 1. Delete all ai_messages for this user directly by user_id
    // This is more reliable than using conversation_id IN (...)
    const { data: deletedMsgData, error: msgError } = await sb
      .from('ai_messages')
      .delete()
      .eq('user_id', user.id)
      .select('id');
    
    if (msgError) {
      console.error('[iron-coach/clear] Error deleting ai_messages:', msgError);
      errors.push(`ai_messages: ${msgError.message}`);
    } else {
      deletedMessages = deletedMsgData?.length || 0;
      console.log('[iron-coach/clear] Deleted ai_messages:', deletedMessages);
    }

    // 2. Delete all ai_conversations for this user
    const { data: deletedConvData, error: convError } = await sb
      .from('ai_conversations')
      .delete()
      .eq('user_id', user.id)
      .select('id');
    
    if (convError) {
      console.error('[iron-coach/clear] Error deleting ai_conversations:', convError);
      errors.push(`ai_conversations: ${convError.message}`);
    } else {
      deletedConversations = deletedConvData?.length || 0;
      console.log('[iron-coach/clear] Deleted ai_conversations:', deletedConversations);
    }

    // 3. Delete all chat_messages for this user's sessions
    // First get session IDs, then delete messages
    const { data: sessions } = await sb
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id);

    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map((s: any) => s.id);
      
      const { data: deletedChatMsgData, error: chatMsgError } = await sb
        .from('chat_messages')
        .delete()
        .in('session_id', sessionIds)
        .select('id');
      
      if (chatMsgError) {
        console.error('[iron-coach/clear] Error deleting chat_messages:', chatMsgError);
        errors.push(`chat_messages: ${chatMsgError.message}`);
      } else {
        deletedChatMessages = deletedChatMsgData?.length || 0;
        console.log('[iron-coach/clear] Deleted chat_messages:', deletedChatMessages);
      }
    }

    // 4. Delete all chat_sessions for this user
    const { data: deletedSessData, error: sessError } = await sb
      .from('chat_sessions')
      .delete()
      .eq('user_id', user.id)
      .select('id');
    
    if (sessError) {
      console.error('[iron-coach/clear] Error deleting chat_sessions:', sessError);
      errors.push(`chat_sessions: ${sessError.message}`);
    } else {
      deletedChatSessions = deletedSessData?.length || 0;
      console.log('[iron-coach/clear] Deleted chat_sessions:', deletedChatSessions);
    }

    // 5. Also clear ai_memory for this user (Coach's memory of user)
    const { error: memoryError } = await sb
      .from('ai_memory')
      .delete()
      .eq('user_id', user.id);
    
    if (memoryError) {
      console.error('[iron-coach/clear] Error deleting ai_memory:', memoryError);
      // Don't add to errors - this is optional
    } else {
      console.log('[iron-coach/clear] Cleared ai_memory');
    }

    // Check if we had any critical errors
    if (errors.length > 0) {
      console.error('[iron-coach/clear] Completed with errors:', errors);
      return NextResponse.json({ 
        success: false, 
        message: 'Partial clear - some data could not be deleted',
        errors,
        deleted: {
          aiMessages: deletedMessages,
          aiConversations: deletedConversations,
          chatMessages: deletedChatMessages,
          chatSessions: deletedChatSessions,
        }
      }, { status: 207 }); // 207 Multi-Status
    }

    console.log('[iron-coach/clear] Successfully cleared all chat history for user:', user.id);
    return NextResponse.json({ 
      success: true, 
      message: 'Chat history cleared',
      deleted: {
        aiMessages: deletedMessages,
        aiConversations: deletedConversations,
        chatMessages: deletedChatMessages,
        chatSessions: deletedChatSessions,
      }
    });
  } catch (error) {
    console.error('[iron-coach/clear] Error:', error);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to clear chat history', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
