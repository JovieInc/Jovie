import { NextResponse } from 'next/server';
import {
  isValidProfileModeAliasRequest,
  resolveProfileModeAliasDecision,
} from '@/app/[username]/_lib/profile-mode-alias-resolution';
import { logger } from '@/lib/utils/logger';

/**
 * Edge-cacheable decision endpoint for legacy profile-mode aliases
 * (`/<username>/<alias>`), consumed by the proxy's alias fast path
 * (lib/routing/profile-alias-edge.ts) so the common `mode` redirect is served
 * from the CDN without invoking the catch-all resolver function.
 *
 * The decision JSON is visitor-independent public routing state, so it is
 * CDN-cacheable. The fresh window must cover a complete staged-build alias
 * measurement: the exact-build performance gate measures every reserved
 * alias (listen, music, subscribe, tip, tour, releases) with three discarded
 * shared-context warmups plus five timed samples, and a fresh deployment
 * serves each alias decision cold — the proxy's 250ms response budget then
 * declines and the hop pays the catch-all resolver page instead, which
 * pushed /subscribe over the usable-alias-result budget on staged build
 * e494d86 (Production Controller 39919971407: hop1 307 phases
 * 219/1816/547/540/689ms). `s-maxage=120` keeps one cold fill (the proxy's
 * waitUntil cache-fill from #22734) fresh through that whole per-route
 * measurement, and `stale-while-revalidate` keeps every refresh off the
 * request path. Fresh + stale = 300s, aligned with the resolver's inner
 * unstable_cache (300s, smartlink-content tags) so this endpoint's servable
 * window never exceeds the data freshness the resolver itself already
 * tolerates. Any failure returns a non-cacheable 503 and the proxy falls
 * through to the historical resolver page — this endpoint can only make
 * aliases faster, never change their outcome.
 */

const DECISION_CACHE_CONTROL =
  'public, s-maxage=120, stale-while-revalidate=180';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = (url.searchParams.get('username') ?? '').trim();
  const alias = (url.searchParams.get('alias') ?? '').trim();
  const sourceParam = (url.searchParams.get('source') ?? '').trim();
  const source =
    sourceParam === 'link' || sourceParam === 'qr' ? sourceParam : undefined;

  if (!isValidProfileModeAliasRequest(username, alias)) {
    return NextResponse.json(
      { kind: 'missing' },
      { headers: { 'Cache-Control': 'private, no-store' }, status: 400 }
    );
  }

  try {
    const decision = await resolveProfileModeAliasDecision(
      username,
      alias,
      source
    );
    return NextResponse.json(decision, {
      headers: { 'Cache-Control': DECISION_CACHE_CONTROL },
    });
  } catch (error) {
    logger.error(
      'Failed profile-mode alias edge decision',
      {
        alias,
        error,
        helper: 'profile-alias-decision',
        route: '/api/profile-alias-decision',
        username,
      },
      'public-profile'
    );
    return NextResponse.json(
      { kind: 'unavailable' },
      { headers: { 'Cache-Control': 'private, no-store' }, status: 503 }
    );
  }
}
