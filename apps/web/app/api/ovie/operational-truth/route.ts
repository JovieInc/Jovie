import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { env } from '@/lib/env-server';
import {
  OVIE_SHIPPING_STATE_SCHEMA,
  ovieShippingProjectionSchema,
  projectOperationalTruthForRead,
} from '@/lib/ovie/operational-truth';
import {
  readOperationalTruth,
  storeOperationalTruth,
} from '@/lib/ovie/operational-truth-store';
import { logger } from '@/lib/utils/logger';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
function secureEqual(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
function authorizePublisher(request: NextRequest): 'ok' | 'missing' | 'denied' {
  const expected = env.HERMES_HUD_API_KEY?.trim();
  if (!expected) return 'missing';
  const provided = request.headers.get('authorization') ?? '';
  return secureEqual(provided, `Bearer ${expected}`) ? 'ok' : 'denied';
}
export async function GET(request: NextRequest) {
  const publisherAuth = authorizePublisher(request);
  if (publisherAuth !== 'ok') {
    const kioskToken = request.nextUrl.searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);
    if (!auth.ok) return json({ error: 'Unauthorized' }, 401);
  }
  try {
    return json(projectOperationalTruthForRead(await readOperationalTruth()));
  } catch (error) {
    logger.error('Ovie operational truth read failed', error);
    return json({ error: 'Operational truth unavailable' }, 503);
  }
}
export async function POST(request: NextRequest) {
  const auth = authorizePublisher(request);
  if (auth === 'missing') {
    return json({ error: 'Operational truth publisher unavailable' }, 503);
  }
  if (auth === 'denied') return json({ error: 'Unauthorized' }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = ovieShippingProjectionSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: `Expected ${OVIE_SHIPPING_STATE_SCHEMA} projection` },
      400
    );
  }
  try {
    const receipt = await storeOperationalTruth(parsed.data);
    const current = receipt.current;
    return json(
      {
        schemaVersion: 'ovie.shipping-state-receipt.v1',
        result: receipt.result,
        projectionId: parsed.data.projectionId,
        sequence: parsed.data.sequence,
        currentProjectionId: current?.projectionId ?? null,
        currentSequence: current?.sequence ?? null,
        correlationId: parsed.data.correlationId,
      },
      receipt.result === 'conflict' ? 409 : 200
    );
  } catch (error) {
    logger.error('Ovie operational truth write failed', error);
    return json({ error: 'Operational truth unavailable' }, 503);
  }
}
