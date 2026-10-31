import 'server-only';
import { eq } from 'drizzle-orm';
import {
  COOKIE_BANNER_REQUIRED_COOKIE,
  isCookieBannerRequired,
} from '@/lib/cookies/consent-regions';
import { parseConsentCookieValue } from '@/lib/cookies/consent-state';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { TrackingVisitor } from './eligibility';

/** Deliberately uncached: queued events and cached HTML cannot grant permission. */
export async function readTrackingProfile(artistId: string) {
  const [profile] = await db
    .select({ youngAudience: creatorProfiles.youngAudience })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, artistId))
    .limit(1);
  return profile;
}

export function trackingVisitorFromHeaders(headers?: Headers): TrackingVisitor {
  const cookies = new Map<string, string>();
  for (const part of (headers?.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    try {
      cookies.set(
        part.slice(0, index).trim(),
        decodeURIComponent(part.slice(index + 1).trim())
      );
    } catch {
      /* Invalid cookie is absent consent. */
    }
  }
  return {
    gpc: headers?.get('sec-gpc') === '1',
    dnt: headers?.get('dnt') === '1',
    optOut: cookies.get('jv_tracking_consent') === 'rejected',
    consentRequired:
      !headers ||
      cookies.get(COOKIE_BANNER_REQUIRED_COOKIE) === '1' ||
      isCookieBannerRequired(
        headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry'),
        headers.get('x-vercel-ip-country-region')
      ),
    consent: parseConsentCookieValue(cookies.get('jv_cc')),
  };
}

export function trackingVisitorFromRequest(request: Request): TrackingVisitor {
  return trackingVisitorFromHeaders(request.headers);
}
