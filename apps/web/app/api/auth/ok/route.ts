import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Auth handler health probe (Clerk → Better Auth migration, plan Phase 11).
 *
 * The `production-oauth-gate` (ci.yml) and the staging canary probe
 * (canary-health-gate.yml) need a hard HTTP probe that proves the BA
 * handler mounted and the runtime wired up — separate from the Playwright
 * OAuth provider probe (`oauth-providers.spec.ts`), which only catches
 * console-side `redirect_uri_mismatch` regressions.
 *
 * Returns 200 with a tiny JSON body when the handler is reachable. The
 * catch-all `/api/auth/[...all]` route delegates unknown paths to Better
 * Auth, which 404s them — this static route wins on the more-specific path
 * so a canary can rely on a deterministic 200. Safe to expose publicly: it
 * contains no user/session state and is `no-store`.
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
