import { desc, eq } from 'drizzle-orm';
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

/**
 * GET /api/chat/conversations
 * List all conversations for the current user's profile
 */
export async function GET(req: Request) {
  try {
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam
      ? Math.min(Number.parseInt(limitParam, 10), 50)
      : 20;

    const conversations = await db
      .select({
        id: chatConversations.id,
        title: chatConversations.title,
        createdAt: chatConversations.createdAt,
        updatedAt: chatConversations.updatedAt,
      })
      .from(chatConversations)
      .where(eq(chatConversations.creatorProfileId, profile.id))
      .orderBy(desc(chatConversations.updatedAt))
      .limit(limit);

    return NextResponse.json(
      { conversations },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error listing conversations:', error);

    if (error instanceof TypeError && error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to list conversations' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * POST /api/chat/conversations
 * Create a new conversation
 */
export async function POST(req: Request) {
  try {
    const { user, profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    let body: { title?: string; initialMessage?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine - we'll create a conversation without a title
    }

    const { title, initialMessage } = body;

    // Create the conversation
    const [conversation] = await db
      .insert(chatConversations)
      .values({
        userId: user.id,
        creatorProfileId: profile.id,
        title: title ?? null,
      })
      .returning();

    // If there's an initial message, create it
    if (initialMessage?.trim()) {
      await db.insert(chatMessages).values({
        conversationId: conversation.id,
        role: 'user',
        content: initialMessage.trim(),
      });
    }

    return NextResponse.json(
      { conversation },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error creating conversation:', error);

    if (error instanceof TypeError && error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
