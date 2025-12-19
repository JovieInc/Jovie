import { NextRequest, NextResponse } from 'next/server';
import { LISTEN_COOKIE } from '@/constants/app';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';
import { clickEvents } from '@/lib/db/schema';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  buildProviderCandidates,
  extractCreatorDefaultProvider,
  findDiscographyEntry,
  getCookieProvider,
  selectProvider,
} from '@/lib/listen-routing';
import { detectPlatformFromUA } from '@/lib/utils';
import { detectBot, getBotSafeHeaders } from '@/lib/utils/bot-detection';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function applySecurityHeaders(response: NextResponse, isBot: boolean) {
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'X-Robots-Tag',
    'noindex, nofollow, nosnippet, noarchive'
  );
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  if (isBot) {
    const botHeaders = getBotSafeHeaders(true);
    Object.entries(botHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
}

function validUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    value
  );
}

async function logClickEvent(options: {
  creatorProfileId: string;
  providerKey: string;
  forcedProviderKey: string | null;
  targetUrl: string;
  targetKind: string;
  releaseCode: string;
  releaseId?: string | null;
  linkId?: string | null;
  request: NextRequest;
  isBot: boolean;
}) {
  const ipAddress = extractClientIPFromRequest(options.request);
  const userAgent = options.request.headers.get('user-agent') || undefined;
  const referrer = options.request.headers.get('referer') ?? undefined;
  const country =
    options.request.headers.get('x-vercel-ip-country') ??
    options.request.headers.get('cf-ipcountry') ??
    undefined;
  const city = options.request.headers.get('x-vercel-ip-city') ?? undefined;
  const deviceType = detectPlatformFromUA(userAgent || undefined) ?? undefined;
  const cookiePreferred = options.request.cookies.get(LISTEN_COOKIE)?.value;

  const linkId = validUuid(options.linkId) ? options.linkId : undefined;

  try {
    await withSystemIngestionSession(async tx => {
      await tx.insert(clickEvents).values({
        creatorProfileId: options.creatorProfileId,
        linkId: linkId ?? null,
        linkType: 'listen',
        ipAddress,
        userAgent,
        referrer,
        country,
        city,
        deviceType,
        isBot: options.isBot,
        metadata: {
          providerKey: options.providerKey,
          forcedProviderKey: options.forcedProviderKey,
          targetKind: options.targetKind,
          releaseCode: options.releaseCode,
          releaseId: options.releaseId ?? null,
          targetUrl: options.targetUrl,
          cookiePreferred,
          source: 'listen_route',
        },
      });
    });
  } catch (error) {
    console.error('[ListenRoute] Failed to log click event', error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; code: string }> }
) {
  try {
    const { username, code } = await params;
    const normalizedUsername = username?.toLowerCase();
    const normalizedCode = code?.trim();

    if (!normalizedUsername || !normalizedCode) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const botResult = detectBot(
      request,
      `/${normalizedUsername}/listen/${normalizedCode}`
    );

    const url = new URL(request.url);
    const forcedProvider = url.searchParams.get('p');
    const cookieProvider = getCookieProvider(request);

    const profile = await getCreatorProfileWithLinks(normalizedUsername);

    if (!profile || profile.isPublic === false) {
      const response = new NextResponse('Not Found', { status: 404 });
      applySecurityHeaders(response, botResult.isBot);
      return response;
    }

    const entry = findDiscographyEntry(profile.settings ?? {}, normalizedCode);
    const candidates = buildProviderCandidates(
      {
        id: profile.id,
        username: profile.username,
        spotifyUrl: profile.spotifyUrl,
        appleMusicUrl: profile.appleMusicUrl,
        youtubeUrl: profile.youtubeUrl,
        spotifyId: profile.spotifyId,
        settings: profile.settings,
        socialLinks: profile.socialLinks,
      },
      { entry, releaseCode: normalizedCode }
    );

    const selection = selectProvider(candidates, {
      forcedProvider,
      creatorDefault: extractCreatorDefaultProvider(profile.settings, entry),
      cookieProvider,
      userAgent: request.headers.get('user-agent'),
    });

    const provider = selection.provider ?? candidates[0];
    if (!provider) {
      const response = new NextResponse('Not Found', { status: 404 });
      applySecurityHeaders(response, botResult.isBot);
      return response;
    }

    const redirectUrl = provider.url;
    const response = NextResponse.redirect(redirectUrl, { status: 302 });
    applySecurityHeaders(response, botResult.isBot);

    logClickEvent({
      creatorProfileId: profile.id,
      providerKey: provider.key,
      forcedProviderKey: selection.forcedProviderKey,
      targetUrl: redirectUrl,
      targetKind: provider.targetKind ?? 'artist',
      releaseCode: normalizedCode,
      releaseId: provider.releaseId ?? entry?.id ?? null,
      linkId: provider.linkId,
      request,
      isBot: botResult.isBot,
    }).catch(console.error);

    return response;
  } catch (error) {
    console.error('[ListenRoute] Unexpected error', error);
    const response = new NextResponse('Internal Server Error', { status: 500 });
    applySecurityHeaders(response, false);
    return response;
  }
}
