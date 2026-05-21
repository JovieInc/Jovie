import type { NextRequest, NextResponse } from 'next/server';

import {
  AUDIENCE_ANON_COOKIE,
  AUDIENCE_IDENTIFIED_COOKIE,
  COUNTRY_CODE_COOKIE,
  HOMEPAGE_CITY_COOKIE,
  HOMEPAGE_REGION_COOKIE,
} from '@/constants/app';
import {
  COOKIE_BANNER_REQUIRED_COOKIE,
  isCookieBannerRequired,
} from '@/lib/cookies/consent-regions';
import {
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
} from '@/lib/cookies/consent-state';
import { NONESSENTIAL_PROXY_COOKIE_NAMES } from '@/lib/cookies/registry';
import type { PathCategory } from '@/lib/routing/proxy-routing';
import {
  buildContentSecurityPolicy,
  buildContentSecurityPolicyReportOnly,
  SCRIPT_NONCE_HEADER,
} from '@/lib/security/content-security-policy';
import {
  buildReportingEndpointsHeader,
  buildReportToHeader,
  getCspReportUri,
} from '@/lib/security/csp-reporting';

/**
 * Get geo info preferring Vercel edge headers (x-vercel-ip-*) with fallback
 * to the req.geo object injected by the platform. Matches the original
 * implementation exactly for test and production parity.
 */
function getGeoFromRequest(req: NextRequest): {
  city: string | null;
  region: string | null;
} {
  const geoRequest = req as NextRequest & {
    geo?: { city?: string | null; region?: string | null };
  };

  const rawCity = req.headers.get('x-vercel-ip-city')?.trim() ?? null;
  const cityFromHeader = rawCity ? decodeURIComponent(rawCity) : null;
  const regionFromHeader =
    req.headers.get('x-vercel-ip-country-region')?.trim() ?? null;

  return {
    city: cityFromHeader || geoRequest.geo?.city?.trim() || null,
    region: regionFromHeader || geoRequest.geo?.region?.trim() || null,
  };
}

/**
 * Build the final response with CSP headers and cookies.
 * The nonce is pre-generated and set on request headers for Server Components.
 * Here we set it on response headers for the CSP policy.
 *
 * Extracted so auth routing (proxy.ts) no longer mixes with cookie/CSP
 * decoration concerns.
 */
export function buildFinalResponse(
  req: NextRequest,
  res: NextResponse,
  pathInfo: PathCategory,
  startTime: number,
  userId: string | null,
  nonce: string | null
): NextResponse {
  const pathname = req.nextUrl.pathname;

  // Set CSP headers using the pre-generated nonce
  // The nonce was already set on request headers for Server Components
  if (nonce && pathInfo.needsNonce) {
    const allowTestRuntimeRelaxations = process.env.E2E_ALLOW_DEV_CSP === '1';
    res.headers.set(SCRIPT_NONCE_HEADER, nonce);
    res.headers.set(
      'Content-Security-Policy',
      buildContentSecurityPolicy({ nonce, allowTestRuntimeRelaxations })
    );

    const cspReportUri = getCspReportUri();
    if (cspReportUri) {
      const reportOnlyPolicy = buildContentSecurityPolicyReportOnly({
        nonce,
        allowTestRuntimeRelaxations,
        reportUri: cspReportUri,
      });
      if (reportOnlyPolicy) {
        res.headers.set(
          'Content-Security-Policy-Report-Only',
          reportOnlyPolicy
        );
        res.headers.set('Report-To', buildReportToHeader(cspReportUri));
        res.headers.set(
          'Reporting-Endpoints',
          buildReportingEndpointsHeader(cspReportUri)
        );
      }
    }
  }

  const geo = getGeoFromRequest(req);
  const countryCode =
    req.headers.get('x-vercel-ip-country') ?? req.headers.get('cf-ipcountry');
  const normalizedCountryCode = countryCode?.trim().toUpperCase() ?? null;
  const requiresCookieConsent = isCookieBannerRequired(
    normalizedCountryCode,
    geo.region
  );
  const currentCookieRequirement = req.cookies.get(
    COOKIE_BANNER_REQUIRED_COOKIE
  )?.value;
  const currentCountryCode =
    req.cookies.get(COUNTRY_CODE_COOKIE)?.value ?? null;
  const nextCookieRequirement = requiresCookieConsent ? '1' : '0';
  const canSetAnalyticsProxyCookies =
    !requiresCookieConsent ||
    hasAnalyticsConsent(req.cookies.get(CONSENT_COOKIE_NAME)?.value);

  if (normalizedCountryCode && currentCountryCode !== normalizedCountryCode) {
    res.cookies.set(COUNTRY_CODE_COOKIE, normalizedCountryCode, {
      // httpOnly: false so StaticArtistPage can read country code on mount
      // for DSP geo-sorting, replacing the server-side headers() read that
      // prevented ISR caching of public profile pages.
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  if (currentCookieRequirement !== nextCookieRequirement) {
    res.cookies.set(COOKIE_BANNER_REQUIRED_COOKIE, nextCookieRequirement, {
      httpOnly: false, // Readable by client JS so CookieBannerSection can check without headers()
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  if (requiresCookieConsent && !canSetAnalyticsProxyCookies) {
    for (const cookieName of NONESSENTIAL_PROXY_COOKIE_NAMES) {
      if (req.cookies.get(cookieName)?.value) {
        res.cookies.set(cookieName, '', {
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 0,
          path: '/',
        });
      }
    }
  }

  if (canSetAnalyticsProxyCookies) {
    if (geo.city && req.cookies.get(HOMEPAGE_CITY_COOKIE)?.value !== geo.city) {
      res.cookies.set(HOMEPAGE_CITY_COOKIE, geo.city, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
    }

    if (
      geo.region &&
      req.cookies.get(HOMEPAGE_REGION_COOKIE)?.value !== geo.region
    ) {
      res.cookies.set(HOMEPAGE_REGION_COOKIE, geo.region, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
    }

    // Set audience tracking cookies.
    if (!req.cookies.get(AUDIENCE_ANON_COOKIE)?.value) {
      res.cookies.set(AUDIENCE_ANON_COOKIE, crypto.randomUUID(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }

    if (userId && req.cookies.get(AUDIENCE_IDENTIFIED_COOKIE)?.value !== '1') {
      res.cookies.set(AUDIENCE_IDENTIFIED_COOKIE, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }
  }

  // Performance monitoring
  const duration = Date.now() - startTime;
  res.headers.set('Server-Timing', `middleware;dur=${duration}`);

  if (pathname.startsWith('/api/')) {
    res.headers.set('X-API-Response-Time', `${duration}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${req.method} ${pathname} - ${duration}ms`);
    }
  }

  // Anti-indexing headers for link and API routes
  if (
    pathname.startsWith('/go/') ||
    pathname.startsWith('/out/') ||
    pathname.startsWith('/api/')
  ) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
    res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    res.headers.set('Referrer-Policy', 'no-referrer');
  }

  return res;
}
