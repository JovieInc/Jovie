import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  clickEvents,
  creatorProfiles,
  discogReleases,
  discogTracks,
  providerLinks,
  smartLinkTargets,
} from '@/lib/db/schema';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { checkStatsigGateForUser } from '@/lib/statsig/server';
import { detectPlatformFromUA } from '@/lib/utils';
import { extractClientIP } from '@/lib/utils/ip-extraction';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function normalizeKey(input: string | null): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (v.length === 0 || v.length > 64) return null;
  return v;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; code: string }> }
) {
  const { username, code } = await params;
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedCode = code.trim();

  const fallbackUrl = new URL(`/${normalizedUsername}?mode=listen`, request.url);

  if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
    return NextResponse.redirect(fallbackUrl, { status: 302, headers: NO_STORE_HEADERS });
  }

  if (normalizedCode.length < 3 || normalizedCode.length > 64) {
    return NextResponse.redirect(fallbackUrl, { status: 302, headers: NO_STORE_HEADERS });
  }

  const gateEnabled = await checkStatsigGateForUser(
    STATSIG_FLAGS.DISCOG_SMART_LINKS,
    { userID: `smartlink:${normalizedUsername}` }
  );

  if (!gateEnabled) {
    return NextResponse.redirect(fallbackUrl, { status: 302, headers: NO_STORE_HEADERS });
  }

  const forcedProviderKey = normalizeKey(request.nextUrl.searchParams.get('p'));

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, normalizedUsername))
    .limit(1);

  if (!profile) {
    return NextResponse.redirect(fallbackUrl, { status: 302, headers: NO_STORE_HEADERS });
  }

  const [target] = await db
    .select({
      id: smartLinkTargets.id,
      kind: smartLinkTargets.kind,
      trackId: smartLinkTargets.trackId,
      releaseId: smartLinkTargets.releaseId,
      defaultProviderKey: smartLinkTargets.defaultProviderKey,
    })
    .from(smartLinkTargets)
    .where(
      and(
        eq(smartLinkTargets.creatorProfileId, profile.id),
        eq(smartLinkTargets.code, normalizedCode)
      )
    )
    .limit(1);

  if (!target) {
    return NextResponse.redirect(fallbackUrl, { status: 302, headers: NO_STORE_HEADERS });
  }

  const providerKey = forcedProviderKey ?? target.defaultProviderKey ?? null;

  const destinationUrl = await (async (): Promise<string | null> => {
    if (providerKey && target.trackId) {
      const [link] = await db
        .select({ url: providerLinks.url })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.trackId, target.trackId),
            eq(providerLinks.providerKey, providerKey)
          )
        )
        .limit(1);
      if (link?.url) return link.url;
    }

    if (providerKey && target.releaseId) {
      const [link] = await db
        .select({ url: providerLinks.url })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.releaseId, target.releaseId),
            eq(providerLinks.providerKey, providerKey)
          )
        )
        .limit(1);
      if (link?.url) return link.url;
    }

    if (target.trackId) {
      const [track] = await db
        .select({ spotifyUrl: discogTracks.spotifyUrl })
        .from(discogTracks)
        .where(eq(discogTracks.id, target.trackId))
        .limit(1);
      if (track?.spotifyUrl) return track.spotifyUrl;
    }

    if (target.releaseId) {
      const [release] = await db
        .select({ spotifyUrl: discogReleases.spotifyUrl })
        .from(discogReleases)
        .where(eq(discogReleases.id, target.releaseId))
        .limit(1);
      if (release?.spotifyUrl) return release.spotifyUrl;
    }

    return null;
  })();

  if (!destinationUrl) {
    return NextResponse.redirect(fallbackUrl, { status: 302, headers: NO_STORE_HEADERS });
  }

  const userAgent = request.headers.get('user-agent');
  const ipAddress = extractClientIP(request.headers);
  const referrer = request.headers.get('referer') ?? undefined;
  const city = request.headers.get('x-vercel-ip-city') ?? undefined;
  const country =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    undefined;
  const deviceType = detectPlatformFromUA(userAgent || undefined);

  await withSystemIngestionSession(async tx => {
    await tx.insert(clickEvents).values({
      creatorProfileId: profile.id,
      linkType: 'listen',
      linkId: null,
      ipAddress,
      userAgent,
      referrer,
      country,
      city,
      deviceType,
      metadata: {
        source: 'smart_link',
        code: normalizedCode,
        targetKind: target.kind,
        forcedProviderKey,
        providerKey,
      },
    });
  });

  return NextResponse.redirect(destinationUrl, { status: 302, headers: NO_STORE_HEADERS });
}
