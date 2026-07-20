import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Static auth-namespace liveness response.
 *
 * This route is intentionally independent of Better Auth's catch-all and must
 * never be used as proof that Better Auth is mounted or can start OAuth. The
 * release gate clicks the deployed provider buttons and requires the real
 * `POST /api/auth/sign-in/social` before inspecting provider navigation.
 *
 * Returns 200 with a tiny JSON body when the handler is reachable. The
 * Safe to expose publicly: it contains no user/session state and is `no-store`.
 */
export function GET(_req: NextRequest) {
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
