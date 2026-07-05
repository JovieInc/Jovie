import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import { humanizePrTitle } from '@/lib/hud/humanize-pr-title';
import { logger } from '@/lib/utils/logger';

/**
 * Server-side PR title humanizer for the /hud What Shipped feed.
 *
 * POST { number, title } -> { title } (emoji + plain-English text).
 *
 * The LLM is called at most once per PR number — results are cached in Redis
 * with no expiry, portable with the Python sidecar's per-PR cache. Model
 * failures degrade to the raw title so the feed never breaks.
 */

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const requestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().trim().min(1).max(300),
  })
  .strict();

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const kioskToken = new URL(request.url).searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);

    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Expected { number: positive int, title: string }' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await humanizePrTitle(parsed.data);

    return NextResponse.json(
      { title: result.title, source: result.source },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[ops/humanize-pr-title] Failed to humanize title', error);
    await captureError('PR title humanize failed', error, {
      route: '/api/ops/humanize-pr-title',
      method: 'POST',
    });

    return NextResponse.json(
      { error: 'Failed to humanize PR title' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
