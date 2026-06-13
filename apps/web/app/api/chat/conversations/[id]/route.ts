import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { getCreatorConversationDetail } from '@/lib/chat/conversation-queries';
import {
  sanitizeConversationTitle,
  withSanitizedConversationTitle,
} from '@/lib/chat/title';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { getSessionErrorResponse } from '../../session-error-response';

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
      Math.max(Number.parseInt(limitParam ?? '100', 10) || 100, 1),
      200
    );
    const before = url.searchParams.get('before');

    let detail;
    try {
      detail = await getCreatorConversationDetail({
        conversationId: id,
        creatorProfileId: profile.id,
        limit,
        before,
      });
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message === 'INVALID_BEFORE_CURSOR'
      ) {
        return NextResponse.json(
          { error: 'Invalid "before" cursor' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      throw error;
    }

    if (!detail) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const messages = detail.messages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      clientMessageId: message.clientMessageId,
      turnId: message.turnId,
      createdAt: message.createdAt,
      toolCalls: message.toolCalls.length > 0 ? message.toolCalls : null,
    }));

    return NextResponse.json(
      {
        conversation: withSanitizedConversationTitle(detail.conversation),
        messages,
        hasMore: detail.hasMore,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error fetching conversation:', error);

    const sessionErrorResponse = getSessionErrorResponse(
      error,
      NO_STORE_HEADERS
    );
    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    await captureError('Failed to fetch conversation', error, {
      route: '/api/chat/conversations/[id]',
      method: 'GET',
    });

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
    const sanitizedTitle = sanitizeConversationTitle(title);

    // Update the conversation, ensuring it belongs to the user's profile
    const [updated] = await db
      .update(chatConversations)
      .set({
        title: sanitizedTitle,
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
      {
        conversation: withSanitizedConversationTitle(updated),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error updating conversation:', error);

    const sessionErrorResponse = getSessionErrorResponse(
      error,
      NO_STORE_HEADERS
    );
    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    await captureError('Failed to update conversation', error, {
      route: '/api/chat/conversations/[id]',
      method: 'PATCH',
    });

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

    const sessionErrorResponse = getSessionErrorResponse(
      error,
      NO_STORE_HEADERS
    );
    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    await captureError('Failed to delete conversation', error, {
      route: '/api/chat/conversations/[id]',
      method: 'DELETE',
    });

    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
