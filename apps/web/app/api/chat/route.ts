import { gateway } from '@ai-sdk/gateway';
import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { type ModelMessage, streamText, tool } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CORS_HEADERS } from '@/lib/http/headers';
import { checkAiChatRateLimit, createRateLimitHeaders } from '@/lib/rate-limit';

export const maxDuration = 30;

/** Maximum allowed message length (characters) */
const MAX_MESSAGE_LENGTH = 4000;

/** Maximum allowed messages per request */
const MAX_MESSAGES_PER_REQUEST = 50;

/**
 * Editable profile fields by tier:
 * - Tier 1 (Safe): Non-destructive fields that can be freely edited
 * - Tier 2 (Careful): Fields that need confirmation before applying
 * - Tier 3 (Blocked): Cannot be edited via chat - requires settings page
 */
const EDITABLE_FIELDS = {
  tier1: ['displayName', 'bio'] as const,
  tier2: ['genres'] as const,
  blocked: ['username', 'avatarUrl', 'spotifyId'] as const,
};

type EditableField =
  | (typeof EDITABLE_FIELDS.tier1)[number]
  | (typeof EDITABLE_FIELDS.tier2)[number];

const FIELD_DESCRIPTIONS: Record<EditableField, string> = {
  displayName: 'Display name shown on your profile',
  bio: 'Artist bio/description',
  genres: 'Music genres (comma-separated)',
};

interface ArtistContext {
  displayName: string;
  username: string;
  bio: string | null;
  genres: string[];
  spotifyFollowers: number | null;
  spotifyPopularity: number | null;
  profileViews: number;
  hasSocialLinks: boolean;
  hasMusicLinks: boolean;
  tippingStats: {
    tipClicks: number;
    tipsSubmitted: number;
    totalReceivedCents: number;
    monthReceivedCents: number;
  };
}

/**
 * Extracts text content from a message's content field.
 * Handles both string content and array content (with text parts).
 */
function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (p): p is { type: 'text'; text: string } =>
          p.type === 'text' && typeof p.text === 'string'
      )
      .map(p => p.text)
      .join('');
  }
  return '';
}

/**
 * Validates a single message object.
 * Returns an error message string if invalid, null if valid.
 */
function validateMessage(message: unknown): string | null {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('role' in message) ||
    !('content' in message)
  ) {
    return 'Invalid message format';
  }

  const { role, content } = message as { role: unknown; content: unknown };

  if (role !== 'user' && role !== 'assistant') {
    return 'Invalid message role';
  }

  // Validate content length for user messages
  if (role === 'user') {
    const contentStr = extractMessageText(content);
    if (contentStr.length > MAX_MESSAGE_LENGTH) {
      return `Message too long. Maximum is ${MAX_MESSAGE_LENGTH} characters`;
    }
  }

  return null;
}

/**
 * Validates the messages array.
 * Returns an error message string if invalid, null if valid.
 */
function validateMessagesArray(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return 'Messages must be an array';
  }
  if (messages.length === 0) {
    return 'Messages array cannot be empty';
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return `Too many messages. Maximum is ${MAX_MESSAGES_PER_REQUEST}`;
  }

  for (const message of messages) {
    const error = validateMessage(message);
    if (error) {
      return error;
    }
  }

  return null;
}

function buildSystemPrompt(context: ArtistContext): string {
  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return `You are Jovie, an AI music career assistant. You help independent artists understand their data and make smart career decisions.

## About This Artist
- **Name:** ${context.displayName} (@${context.username})
- **Bio:** ${context.bio ?? 'Not set'}
- **Genres:** ${context.genres.length > 0 ? context.genres.join(', ') : 'Not specified'}

## Streaming Stats
- **Spotify Followers:** ${context.spotifyFollowers?.toLocaleString() ?? 'Not connected'}
- **Spotify Popularity:** ${context.spotifyPopularity ?? 'N/A'} / 100

## Profile Analytics
- **Profile Views:** ${context.profileViews.toLocaleString()}
- **Has Social Links:** ${context.hasSocialLinks ? 'Yes' : 'No'}
- **Has Music Links (DSPs):** ${context.hasMusicLinks ? 'Yes' : 'No'}

## Tipping & Monetization
- **Tip Link Clicks:** ${context.tippingStats.tipClicks}
- **Tips Received:** ${context.tippingStats.tipsSubmitted}
- **Total Earned:** ${formatMoney(context.tippingStats.totalReceivedCents)}
- **This Month:** ${formatMoney(context.tippingStats.monthReceivedCents)}

## Your Guidelines

1. **Be specific and data-driven.** Reference the actual numbers above when giving advice. Don't be vague.

2. **Be concise.** Artists are busy. Give clear, actionable advice without fluff.

3. **Be honest about limitations.** If you don't have enough data to answer something, say so. Don't make things up.

4. **Focus on actionable advice.** Every response should give the artist something they can DO.

5. **Understand context.** If they have 0 profile views, they're just starting. If they have 10K Spotify followers, they have momentum.

6. **Don't be sycophantic.** Be a helpful advisor, not a cheerleader. Give real talk.

## What You Cannot Do
- You cannot send emails, post content, or take actions on behalf of the artist
- You cannot access external data or APIs
- You cannot see their actual music or listen to tracks
- You cannot guarantee results or make promises about outcomes

## Response Style
- Use bullet points for lists
- Keep responses under 300 words unless asked for detail
- Use simple language, avoid jargon
- Be encouraging but realistic

## Profile Editing
You have the ability to propose profile edits using the proposeProfileEdit tool. When the artist asks you to update their bio, display name, or genres, use this tool to show them a preview.

**Editable Fields:**
- displayName: Their public display name
- bio: Artist bio/description
- genres: Music genres (as an array)

**Blocked Fields (cannot edit via chat):**
- username: Requires settings page
- avatar/profile image: Requires settings page
- Connected accounts: Requires settings page

When asked to edit a blocked field, explain that they need to visit the settings page to make that change.`;
}

/**
 * Creates the proposeProfileEdit tool for the AI to suggest profile changes.
 * This tool only returns a preview - actual changes require user confirmation.
 */
function createProfileEditTool(context: ArtistContext) {
  const profileEditSchema = z.object({
    field: z
      .enum(['displayName', 'bio', 'genres'])
      .describe('The profile field to edit'),
    newValue: z
      .union([z.string(), z.array(z.string())])
      .describe(
        'The new value for the field. For genres, pass an array of strings.'
      ),
    reason: z
      .string()
      .optional()
      .describe('Brief explanation of why this change was suggested'),
  });

  return tool({
    description:
      'Propose a profile edit for the artist. Returns a preview that the user must confirm before it takes effect. Use this when the artist asks to update their display name, bio, or genres.',
    inputSchema: profileEditSchema,
    execute: async ({ field, newValue, reason }) => {
      // Validate the new value type matches the field
      const isGenres = field === 'genres';
      if (isGenres && !Array.isArray(newValue)) {
        return { success: false, error: 'Genres must be an array of strings' };
      }
      if (!isGenres && typeof newValue !== 'string') {
        return { success: false, error: `${field} must be a string` };
      }

      // Return preview data for the UI to render
      return {
        success: true,
        preview: {
          field,
          fieldLabel: FIELD_DESCRIPTIONS[field],
          currentValue: context[field],
          newValue,
          reason,
        },
      };
    },
  });
}

/**
 * OPTIONS - CORS preflight handler
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: Request) {
  // Auth check - ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  // Rate limiting - protect Anthropic API costs
  const rateLimitResult = await checkAiChatRateLimit(userId);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: rateLimitResult.reason,
        retryAfter: Math.ceil(
          (rateLimitResult.reset.getTime() - Date.now()) / 1000
        ),
      },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  // Parse and validate request body
  let body: { messages?: unknown; artistContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { messages, artistContext } = body;

  // Validate artist context
  if (!artistContext || typeof artistContext !== 'object') {
    return NextResponse.json(
      { error: 'Missing or invalid artist context' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Validate messages array and individual messages
  const messagesError = validateMessagesArray(messages);
  if (messagesError) {
    return NextResponse.json(
      { error: messagesError },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // After validation, we know messages is a valid ModelMessage array
  const validatedMessages = messages as ModelMessage[];

  const systemPrompt = buildSystemPrompt(artistContext as ArtistContext);

  try {
    const result = streamText({
      model: gateway('anthropic:claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: validatedMessages,
      tools: {
        proposeProfileEdit: createProfileEditTool(
          artistContext as ArtistContext
        ),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat' },
      extra: {
        userId,
        messageCount: validatedMessages.length,
      },
    });

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    return NextResponse.json(
      { error: 'Failed to process chat request', message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
