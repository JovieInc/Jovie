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
 * CDN-cacheable with a short window: `s-maxage=15` keeps newly created
 * smart-link content at a reserved alias slug at most ~15s away from its
 * canonical URL, and `stale-while-revalidate` keeps every refresh off the
 * request path. Inner data reads reuse the resolver's unstable_cache (300s,
 * smartlink-content tags). Any failure returns a non-cacheable 503 and the
 * proxy falls through to the historical resolver page — this endpoint can
 * only make aliases faster, never change their outcome.
 */

const DECISION_CACHE_CONTROL =
  'public, s-maxage=15, stale-while-revalidate=285';

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
