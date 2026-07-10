/**
 * Social shortcut redirects: jov.ie/{username}/s/{platform}
 *
 * Found social link → 301 to the artist's URL.
 * Profile exists but platform missing/unknown → 302 to /{username} (no 404s for fans).
 * Unknown username → 404.
 *
 * Click demand is recorded best-effort (does not block the redirect).
 *
 * @see JOV-3924
 */

import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { after, type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordClickEvent } from '@/lib/db/queries/analytics';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { publicClickLimiter } from '@/lib/rate-limit';
import { resolveSocialShortcutPlatforms } from '@/lib/social/shortcut-platforms';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';

export const runtime = 'nodejs';

const NO_STORE = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Robots-Tag': 'noindex, nofollow, nosnippet, noarchive',
  'Referrer-Policy': 'no-referrer',
} as const;

function isSafeRedirectDestination(url: string): boolean {
  const validation = validateSocialLinkUrl(url);
  if (!validation.valid) return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return !url.toLowerCase().includes('javascript:');
  } catch {
    return false;
  }
}

function profileRedirect(request: NextRequest, username: string): NextResponse {
  const dest = new URL(`/${username}`, request.url);
  return NextResponse.redirect(dest, { status: 302, headers: NO_STORE });
}

function notFoundResponse(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: NO_STORE,
  });
}

async function recordShortcutAnalytics(input: {
  readonly creatorProfileId: string;
  readonly socialLinkId: string;
  readonly platform: string;
  readonly slug: string;
  readonly destinationUrl: string;
  readonly isBot: boolean;
  readonly clientIP: string;
  readonly userAgent: string | null;
  readonly referrer: string | null;
}): Promise<void> {
  await Promise.all([
    db
      .update(socialLinks)
      .set({
        clicks: drizzleSql`${socialLinks.clicks} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(socialLinks.id, input.socialLinkId)),
    recordClickEvent(input.creatorProfileId, 'social', input.socialLinkId, {
      isBot: input.isBot,
      ipAddress: input.clientIP,
      userAgent: input.userAgent,
      referrer: input.referrer,
      metadata: {
        source: 'social_shortcut',
        slug: input.slug,
        platform: input.platform,
        destinationUrl: input.destinationUrl,
      },
    }),
  ]);
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    readonly params: Promise<{
      readonly username: string;
      readonly platform: string;
    }>;
  }
) {
  const { username: rawUsername, platform: rawPlatform } = await params;
  const username = rawUsername?.trim() ?? '';
  if (!username) return notFoundResponse();

  const usernameNormalized = username.toLowerCase();
  const platformKey = rawPlatform?.trim() ?? '';
  const platforms = resolveSocialShortcutPlatforms(platformKey);

  try {
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
      .limit(1);

    if (!profile) {
      return notFoundResponse();
    }

    // Soft-degrade: unknown slug or missing configured link → profile page.
    if (!platforms || platforms.length === 0) {
      return profileRedirect(request, profile.username);
    }

    const [link] = await db
      .select({
        id: socialLinks.id,
        platform: socialLinks.platform,
        url: socialLinks.url,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profile.id),
          inArray(socialLinks.platform, [...platforms]),
          eq(socialLinks.isActive, true),
          eq(socialLinks.state, 'active')
        )
      )
      .limit(1);

    if (!link || !isSafeRedirectDestination(link.url)) {
      return profileRedirect(request, profile.username);
    }

    const clientIP = extractClientIP(request.headers);
    const userAgent = request.headers.get('user-agent');
    const referrer = request.headers.get('referer');
    const botDetection = detectBot(
      request,
      `/${profile.usernameNormalized}/s/${platformKey}`
    );

    const rateLimitResult = await publicClickLimiter.limit(clientIP);
    if (rateLimitResult.success) {
      after(() =>
        recordShortcutAnalytics({
          creatorProfileId: profile.id,
          socialLinkId: link.id,
          platform: link.platform,
          slug: platformKey.toLowerCase(),
          destinationUrl: link.url,
          isBot: botDetection.isBot,
          clientIP,
          userAgent,
          referrer,
        }).catch(error =>
          captureError('Social shortcut analytics failed', error, {
            route: '/[username]/s/[platform]',
            username: profile.usernameNormalized,
            platform: platformKey,
            socialLinkId: link.id,
          })
        )
      );
    }

    return NextResponse.redirect(link.url, {
      status: 301,
      headers: NO_STORE,
    });
  } catch (error) {
    await captureError('Social shortcut redirect failed', error, {
      route: '/[username]/s/[platform]',
      username: usernameNormalized,
      platform: platformKey,
    });
    // Prefer soft degrade over 500 for fans.
    return profileRedirect(request, username);
  }
}
