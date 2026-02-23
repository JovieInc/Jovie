import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { providerLinks } from '@/lib/db/schema/content';
import { checkGate, FEATURE_FLAG_KEYS } from '@/lib/feature-flags/server';
import { buildSpotifyAuthorizeUrl } from '@/lib/pre-save/spotify';
import { encodeSpotifyPreSaveState } from '@/lib/pre-save/state';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const releaseId = searchParams.get('releaseId');
  const trackId = searchParams.get('trackId');
  const username = searchParams.get('username');
  const slug = searchParams.get('slug');

  if (!releaseId || !username || !slug) {
    return NextResponse.json(
      { error: 'Missing required params' },
      { status: 400 }
    );
  }

  const isEnabled = await checkGate(
    null,
    FEATURE_FLAG_KEYS.SMARTLINK_PRE_SAVE,
    true
  );

  if (!isEnabled) {
    return NextResponse.json(
      { error: 'Pre-save is not enabled' },
      { status: 403 }
    );
  }

  const [spotifyLink] = await db
    .select({ id: providerLinks.id })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.providerId, 'spotify'),
        eq(providerLinks.ownerType, trackId ? 'track' : 'release'),
        trackId
          ? eq(providerLinks.trackId, trackId)
          : eq(providerLinks.releaseId, releaseId)
      )
    )
    .limit(1);

  if (!spotifyLink) {
    return NextResponse.json(
      { error: 'This release is not linked to Spotify yet' },
      { status: 404 }
    );
  }

  const state = encodeSpotifyPreSaveState({
    releaseId,
    trackId,
    username,
    slug,
  });

  const redirectUri = `${origin}/api/pre-save/spotify/callback`;
  const authorizeUrl = buildSpotifyAuthorizeUrl(state, redirectUri);

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
