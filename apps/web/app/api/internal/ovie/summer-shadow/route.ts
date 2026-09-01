import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCronRequest } from '@/lib/cron/auth';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVE_SHADOW_ORIGIN = 'https://jovie-eve-shadow.vercel.app';
const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const ovieSummerShadowInputSchema = z
  .object({
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
    message: z.string().trim().min(1).max(4000),
    evidence: z.array(z.string().url().max(2048)).max(16).default([]),
  })
  .strict();

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

async function readInput(request: Request): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw new RangeError('body_too_large');
  }
  return JSON.parse(text);
}

/**
 * Jovie production is the signed Ovie origin for the read-only Eve shadow.
 * The existing cron verifier protects this internal bridge. Vercel supplies
 * the short-lived production OIDC token from the Function request context.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/internal/ovie/summer-shadow',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  if (process.env.VERCEL_ENV !== 'production') {
    return json({ ok: false, code: 'production_origin_required' }, 503);
  }

  let rawInput: unknown;
  try {
    rawInput = await readInput(request);
  } catch (error) {
    return json(
      {
        ok: false,
        code: error instanceof RangeError ? 'body_too_large' : 'invalid_json',
      },
      error instanceof RangeError ? 413 : 400
    );
  }

  const parsed = ovieSummerShadowInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return json({ ok: false, code: 'invalid_event' }, 422);
  }

  let oidcToken: string;
  try {
    oidcToken = await getVercelOidcToken();
  } catch {
    logger.error('[ovie-summer-shadow] Vercel OIDC token unavailable');
    return json({ ok: false, code: 'signed_origin_unavailable' }, 503);
  }

  let upstream: Response;
  try {
    // Do not retry an uncertain submission. The caller can inspect the Eve
    // receipt by event ID, while Eve's immutable path rejects a duplicate.
    upstream = await fetch(
      new URL('/ovie/v1/summer-shadow/events', EVE_SHADOW_ORIGIN),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${oidcToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          schema: 'jovie.ovie-summer-shadow.event/v1',
          eventId: parsed.data.eventId,
          occurredAt: new Date().toISOString(),
          message: parsed.data.message,
          evidence: parsed.data.evidence,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch {
    return json({ ok: false, code: 'eve_shadow_unavailable' }, 503);
  }

  let upstreamBody: unknown;
  try {
    upstreamBody = await upstream.json();
  } catch {
    return json({ ok: false, code: 'invalid_eve_response' }, 502);
  }

  if (upstream.status === 409) {
    return json({ ok: false, code: 'replay_rejected', eve: upstreamBody }, 409);
  }
  if (!upstream.ok) {
    logger.error('[ovie-summer-shadow] Eve rejected the signed origin', {
      status: upstream.status,
    });
    return json({ ok: false, code: 'eve_shadow_rejected' }, 502);
  }

  return json({ ok: true, eve: upstreamBody }, 202);
}
