import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(50000),
  toolCalls: z.array(z.record(z.string(), z.unknown())).optional(),
});

const batchMessageSchema = z.object({
  messages: z.array(messageSchema).min(1).max(100),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Auto-generate a title from the first user message if no title exists.
 * Uses a single guarded UPDATE to eliminate round-trip and prevent race conditions.
 */
async function maybeGenerateTitle(
  conversationId: string,
  messageContent: string
): Promise<void> {
  const autoTitle = messageContent.slice(0, 50).trim();
  const suffix = autoTitle.length >= 50 ? '...' : '';
  await db
    .update(chatConversations)
    .set({ title: autoTitle + suffix })
    .where(
      and(
        eq(chatConversations.id, conversationId),
        isNull(chatConversations.title)
      )
    );
}

/**
 * POST /api/chat/conversations/[id]/messages
 * Add one or more messages to a conversation
 * Supports both single message and batch insert
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id: conversationId } = await params;
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Verify the conversation belongs to the user's profile
    const [conversation] = await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Try to parse as batch first, then as single message
    const batchResult = batchMessageSchema.safeParse(body);
    const singleResult = messageSchema.safeParse(body);

    let messagesToInsert: z.infer<typeof messageSchema>[];

    if (batchResult.success) {
      messagesToInsert = batchResult.data.messages;
    } else if (singleResult.success) {
      messagesToInsert = [singleResult.data];
    } else {
      return NextResponse.json(
        { error: 'Invalid message format', details: singleResult.error.issues },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Insert all messages
    const insertedMessages = await db
      .insert(chatMessages)
      .values(
        messagesToInsert.map(msg => ({
          conversationId,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls ?? null,
        }))
      )
      .returning();

    // Update conversation's updatedAt timestamp
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, conversationId));

    // Auto-generate title from first user message if no title exists
    const firstUserMessage = messagesToInsert.find(m => m.role === 'user');
    if (firstUserMessage) {
      await maybeGenerateTitle(conversationId, firstUserMessage.content);
    }

    return NextResponse.json(
      { messages: insertedMessages },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error adding message:', error);

    if (error instanceof TypeError && error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add message' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
