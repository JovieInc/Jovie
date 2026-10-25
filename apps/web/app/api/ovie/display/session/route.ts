import { type NextRequest, NextResponse } from 'next/server';
import {
  allowDisplayExchangeAttempt,
  claimDisplayProof,
  clientAddress,
  displayConfig,
} from '@/lib/ovie/display/server';
import {
  DISPLAY_COOKIE,
  DISPLAY_SESSION_TTL_SECONDS,
  mintDisplaySession,
  verifyDeviceProof,
} from '@/lib/ovie/display/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });
const deny = () => json({ error: 'denied' }, 401);

/**
 * Exchange a device proof for a read-only display session cookie. POST only,
 * JSON only, same origin only: the proof never travels in a URL (the Air opens
 * `/display/connect#<proof>` and that page POSTs it). One generic 401 for every
 * verification failure (unknown device, bad proof, stale clock, replay,
 * unconfigured). 429 over the per-address-and-device cap, 503 when the store
 * cannot answer (retryable; the proof is not spent). Proofs are single use.
 */
export async function POST(request: NextRequest) {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(type))
    return json({ error: 'unsupported' }, 415);
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== request.nextUrl.origin)
    return json({ error: 'forbidden' }, 403);

  const { devices, key } = displayConfig();
  if (devices.length === 0 || key.length < 32) return deny();

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Falls through: counted against the "none" device, then denied.
  }
  const nowMs = Date.now();
  const attempt = await allowDisplayExchangeAttempt({
    nowMs,
    address: clientAddress(request.headers),
    deviceHint: body.device,
  });
  if (attempt === 'denied') return json({ error: 'slow-down' }, 429);
  if (attempt === 'unavailable') return json({ error: 'unavailable' }, 503);

  const device = verifyDeviceProof({
    devices,
    deviceId: body.device,
    ts: body.ts,
    proof: body.proof,
    nowMs,
  });
  if (!device) return deny();
  // Spend the proof only after it verified, so garbage cannot burn real ones.
  const claim = await claimDisplayProof(device.id, body.ts as number);
  if (claim === 'unavailable') return json({ error: 'unavailable' }, 503);
  if (claim === 'denied') return deny();

  const { token } = mintDisplaySession({ device, key, nowMs });
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        ...NO_STORE,
        'Set-Cookie': `${DISPLAY_COOKIE}=${token}; Path=/; Max-Age=${DISPLAY_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
      },
    }
  );
}
