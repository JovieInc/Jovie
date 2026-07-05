import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { env } from '@/lib/env-server';
import { setHermesEventsPayload } from '@/lib/hud/hermes-events-store';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function authorizePost(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const expected = env.HERMES_HUD_API_KEY?.trim();
  return Boolean(expected && token === expected);
}

export async function GET(request: NextRequest) {
  try {
    const kioskToken = request.nextUrl.searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);
    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { getHermesEventsPayload } = await import(
      '@/lib/hud/hermes-events-store'
    );
    const payload = getHermesEventsPayload();
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('HUD Hermes events GET failed', error);
    return NextResponse.json(
      { error: 'Failed to retrieve Hermes events' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!authorizePost(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('events' in body)) {
      return NextResponse.json(
        { error: 'Expected JSON body { events: [...] }' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const record = body as {
      events?: unknown;
      generatedAt?: unknown;
    };
    if (!Array.isArray(record.events)) {
      return NextResponse.json(
        { error: 'events must be an array' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const events = record.events.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );

    setHermesEventsPayload({
      events,
      generatedAt:
        typeof record.generatedAt === 'string' ? record.generatedAt : null,
    });

    return NextResponse.json(
      { stored: events.length },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('HUD Hermes events POST failed', error);
    return NextResponse.json(
      { error: 'Failed to ingest Hermes events' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
