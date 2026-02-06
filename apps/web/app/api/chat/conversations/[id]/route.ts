import { and, desc, eq, lt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/chat/conversations/[id]
 * Get a conversation with all its messages
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Parse pagination params
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(
      Math.max(parseInt(limitParam ?? '100', 10) || 100, 1),
      200
    );
    const before = url.searchParams.get('before');

    // Get the conversation, ensuring it belongs to the user's profile
    const [conversation] = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, id),
          eq(chatConversations.creatorProfileId, profile.id)
        )
      )
      .limit(1);

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Build where conditions for messages
    const conditions = [eq(chatMessages.conversationId, id)];
    if (before) {
      const beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid "before" cursor' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      conditions.push(lt(chatMessages.createdAt, beforeDate));
    }

    // Fetch the most recent N messages (DESC + limit), then reverse to chronological order
    const rows = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        toolCalls: chatMessages.toolCalls,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    rows.reverse();

    return NextResponse.json(
      { conversation, messages: rows, hasMore },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error fetching conversation:', error);

    if (error instanceof TypeError && error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * PATCH /api/chat/conversations/[id]
 * Update conversation title
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    let body: { title?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { title } = body;

    // Update the conversation, ensuring it belongs to the user's profile
    const [updated] = await db
      .update(chatConversations)
      .set({
        title: title ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatConversations.id, id),
          eq(chatConversations.creatorProfileId, profile.id)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { conversation: updated },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error updating conversation:', error);

    if (error instanceof TypeError && error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * DELETE /api/chat/conversations/[id]
 * Delete a conversation and all its messages
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Delete the conversation (messages cascade automatically)
    const [deleted] = await db
      .delete(chatConversations)
      .where(
        and(
          eq(chatConversations.id, id),
          eq(chatConversations.creatorProfileId, profile.id)
        )
      )
      .returning({ id: chatConversations.id });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error deleting conversation:', error);

    if (error instanceof TypeError && error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
