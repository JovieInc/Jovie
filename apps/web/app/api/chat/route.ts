import { anthropic } from '@ai-sdk/anthropic';
import { auth } from '@clerk/nextjs/server';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';
import { checkAiChatRateLimit, createRateLimitHeaders } from '@/lib/rate-limit';

export const maxDuration = 30;

/** Maximum allowed message length (characters) */
const MAX_MESSAGE_LENGTH = 4000;

/** Maximum allowed messages per request */
const MAX_MESSAGES_PER_REQUEST = 50;

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
- Be encouraging but realistic`;
}

export async function POST(req: Request) {
  // Auth check - ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  }

  // Parse and validate request body
  let body: { messages?: unknown; artistContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, artistContext } = body;

  // Validate artist context
  if (!artistContext || typeof artistContext !== 'object') {
    return NextResponse.json(
      { error: 'Missing or invalid artist context' },
      { status: 400 }
    );
  }

  // Validate messages array
  if (!Array.isArray(messages)) {
    return NextResponse.json(
      { error: 'Messages must be an array' },
      { status: 400 }
    );
  }

  if (messages.length === 0) {
    return NextResponse.json(
      { error: 'Messages array cannot be empty' },
      { status: 400 }
    );
  }

  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many messages. Maximum is ${MAX_MESSAGES_PER_REQUEST}` },
      { status: 400 }
    );
  }

  // Validate individual messages
  for (const message of messages) {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('role' in message) ||
      !('content' in message)
    ) {
      return NextResponse.json(
        { error: 'Invalid message format' },
        { status: 400 }
      );
    }

    const { role, content } = message as { role: unknown; content: unknown };

    if (role !== 'user' && role !== 'assistant') {
      return NextResponse.json(
        { error: 'Invalid message role' },
        { status: 400 }
      );
    }

    // Validate content length for user messages
    if (role === 'user') {
      const contentStr =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .filter(
                  (p): p is { type: 'text'; text: string } =>
                    p.type === 'text' && typeof p.text === 'string'
                )
                .map(p => p.text)
                .join('')
            : '';

      if (contentStr.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          {
            error: `Message too long. Maximum is ${MAX_MESSAGE_LENGTH} characters`,
          },
          { status: 400 }
        );
      }
    }
  }

  const systemPrompt = buildSystemPrompt(artistContext as ArtistContext);

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages,
  });

  return result.toUIMessageStreamResponse();
}
