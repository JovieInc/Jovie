import { count, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

/** Maximum message length for initial messages */
const MAX_INITIAL_MESSAGE_LENGTH = 4000;

/** Maximum conversations per user */
const MAX_CONVERSATIONS_PER_USER = 200;

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
    const parsed = limitParam ? parseInt(limitParam, 10) : 20;
    const limit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 50)
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

    if (!(error instanceof TypeError && error.message === 'User not found')) {
      await captureError('Failed to list conversations', error, {
        route: '/api/chat/conversations',
        method: 'GET',
      });
    }

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

    // Check conversation count limit
    const [{ value: conversationCount }] = await db
      .select({ value: count() })
      .from(chatConversations)
      .where(eq(chatConversations.creatorProfileId, profile.id));

    if (conversationCount >= MAX_CONVERSATIONS_PER_USER) {
      return NextResponse.json(
        {
          error: `Maximum of ${MAX_CONVERSATIONS_PER_USER} conversations reached. Please delete old conversations.`,
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    let body: { title?: string; initialMessage?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine - we'll create a conversation without a title
    }

    const { title, initialMessage } = body;

    // Validate initial message length
    if (
      initialMessage &&
      initialMessage.trim().length > MAX_INITIAL_MESSAGE_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `Initial message too long. Maximum is ${MAX_INITIAL_MESSAGE_LENGTH} characters.`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

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

    if (!(error instanceof TypeError && error.message === 'User not found')) {
      await captureError('Failed to create conversation', error, {
        route: '/api/chat/conversations',
        method: 'POST',
      });
    }

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
