import { type NextRequest, NextResponse } from 'next/server';
import { displayConfig } from '@/lib/ovie/display/server';
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
 * Exchange a device proof for a read-only display session cookie. One generic
 * 401 for every failure (unknown device, bad proof, stale clock, disabled,
 * unconfigured) so the response teaches nothing.
 */
function exchange(
  deviceId: unknown,
  ts: unknown,
  proof: unknown
): { readonly cookie: string } | null {
  const { devices, key } = displayConfig();
  if (devices.length === 0 || key.length < 32) return null;
  const nowMs = Date.now();
  const device = verifyDeviceProof({ devices, deviceId, ts, proof, nowMs });
  if (!device) return null;
  const { token } = mintDisplaySession({ device, key, nowMs });
  return {
    cookie: `${DISPLAY_COOKIE}=${token}; Path=/; Max-Age=${DISPLAY_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  };
}

/** Browser launch: the Air's helper opens a URL carrying a fresh 60 second proof. */
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const result = exchange(q.get('device'), Number(q.get('ts')), q.get('proof'));
  if (!result)
    return NextResponse.json(DENIED, { status: 401, headers: NO_STORE });
  const response = NextResponse.redirect(new URL('/display', request.url), 303);
  response.headers.set('Set-Cookie', result.cookie);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Falls through to the generic denial.
  }
  const result = exchange(body.device, body.ts, body.proof);
  if (!result)
    return NextResponse.json(DENIED, { status: 401, headers: NO_STORE });
  return NextResponse.json(
    { ok: true },
    { headers: { ...NO_STORE, 'Set-Cookie': result.cookie } }
  );
}
