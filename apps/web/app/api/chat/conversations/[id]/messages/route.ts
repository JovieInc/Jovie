import { gateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

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
 * Auto-generate a conversation title using a cheap AI model via the AI gateway.
 * Falls back to truncating the first user message on failure.
 * Uses a guarded UPDATE (isNull check) to prevent race conditions.
 */
async function maybeGenerateTitle(
  conversationId: string,
  messages: z.infer<typeof messageSchema>[]
): Promise<void> {
  const userMessage = messages.find(m => m.role === 'user');
  if (!userMessage?.content) return;

  try {
    const context = messages
      .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const { text } = await generateText({
      model: gateway('google:gemini-2.0-flash'),
      system:
        'Generate a short, descriptive title (2-6 words) for this conversation. Return only the title text, no quotes or extra punctuation.',
      prompt: context,
      maxOutputTokens: 30,
    });

    const title = text
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 80);

    if (!title) throw new Error('Empty title generated');

    await db
      .update(chatConversations)
      .set({ title })
      .where(
        and(
          eq(chatConversations.id, conversationId),
          isNull(chatConversations.title)
        )
      );
  } catch (error) {
    logger.error('AI title generation failed, using fallback:', error);
    const fallback = userMessage.content.slice(0, 50).trim();
    if (!fallback) return;
    const suffix = fallback.length >= 50 ? '...' : '';
    await db
      .update(chatConversations)
      .set({ title: fallback + suffix })
      .where(
        and(
          eq(chatConversations.id, conversationId),
          isNull(chatConversations.title)
        )
      );
  }
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
        { status: 404, headers: NO_CACHE_HEADERS }
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
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_CACHE_HEADERS }
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
        { status: 400, headers: NO_CACHE_HEADERS }
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

    // Auto-generate title with AI (fire-and-forget to avoid blocking response)
    const hasUserMessage = messagesToInsert.some(m => m.role === 'user');
    if (hasUserMessage) {
      maybeGenerateTitle(conversationId, messagesToInsert).catch(error => {
        logger.error('Title generation error:', error);
      });
    }

    return NextResponse.json(
      { messages: insertedMessages },
      { status: 201, headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('Error adding message:', error);

    if (error instanceof TypeError && error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add message' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
