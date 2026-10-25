import { type NextRequest, NextResponse } from 'next/server';
import {
  allowDisplayExchangeAttempt,
  claimDisplayProof,
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
const DENIED = { error: 'denied' } as const;

/**
 * Exchange a device proof for a read-only display session cookie. POST only:
 * the proof never travels in a URL (the Air opens `/display/connect#<proof>`
 * and that page POSTs it). One generic 401 for every failure (unknown device,
 * bad proof, stale clock, replay, rate limit, unconfigured) so the response
 * teaches nothing. Proofs are single use and the endpoint is rate limited;
 * both fail closed when Redis is unavailable.
 */
export async function POST(request: NextRequest) {
  const deny = () =>
    NextResponse.json(DENIED, { status: 401, headers: NO_STORE });
  const { devices, key } = displayConfig();
  if (devices.length === 0 || key.length < 32) return deny();
  const nowMs = Date.now();
  if (!(await allowDisplayExchangeAttempt(nowMs))) return deny();

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return deny();
  }
  const device = verifyDeviceProof({
    devices,
    deviceId: body.device,
    ts: body.ts,
    proof: body.proof,
    nowMs,
  });
  if (!device) return deny();
  // Spend the proof only after it verified, so garbage cannot burn real ones.
  if (!(await claimDisplayProof(device.id, body.ts as number))) return deny();

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
