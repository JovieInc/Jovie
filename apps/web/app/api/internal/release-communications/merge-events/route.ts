/**
 * Verified merge-event ingestion for canonical release communications.
 *
 * Source: the merge automation (Production Verified job / repository merge
 * webhook) pushes a signed event for every merged PR — no polling or
 * inference. A registered source-repository adapter (`lib/release-
 * communications/sources.ts`) normalizes the payload for the canonical
 * contract; unknown repositories are rejected. The body must carry
 * `verified: true` plus the merge identity; storage-level idempotency
 * (`release_merge_events.event_key` unique) makes replay safe.
 *
 * Security: HMAC-SHA256 over the raw request body, hex digest in the
 * `x-jovie-signature-256` header as `sha256=<digest>`, verified with
 * `RELEASE_COMMUNICATIONS_WEBHOOK_SECRET` and a timing-safe compare. The
 * route fails closed when the secret is not configured.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { DrizzleReleaseCommunicationsAdapter } from '@/lib/release-communications/drizzle-adapter';
import { sourceAdapterForRepository } from '@/lib/release-communications/sources';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const SIGNATURE_HEADER = 'x-jovie-signature-256';
const MAX_BODY_BYTES = 64 * 1024;

function signatureValid(secret: string, body: string, header: string | null) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(header.slice('sha256='.length), 'hex');
  } catch {
    return false;
  }
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export async function POST(request: NextRequest) {
  const secret = env.RELEASE_COMMUNICATIONS_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('release-communications merge-events: signing secret missing');
    return NextResponse.json(
      { error: 'not configured' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'payload too large' },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }
  if (!signatureValid(secret, body, request.headers.get(SIGNATURE_HEADER))) {
    return NextResponse.json(
      { error: 'invalid signature' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'invalid json' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const repository =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).repository
      : null;
  const source = sourceAdapterForRepository(repository);
  const event = source?.toVerifiedMergeEvent(payload) ?? null;
  if (!event) {
    return NextResponse.json(
      { error: 'invalid merge event' },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const post = await new DrizzleReleaseCommunicationsAdapter().ingest(event);
    return NextResponse.json(
      {
        postId: post.id,
        localDate: post.localDate,
        entryCount: post.entries.length,
        materialCount: post.entries.filter(entry => entry.material).length,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'release-communications merge event ingest failed',
      error,
      { route: 'POST /api/internal/release-communications/merge-events' }
    );
    return NextResponse.json(
      { error: 'ingest failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
