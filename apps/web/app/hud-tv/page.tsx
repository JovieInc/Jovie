import * as Sentry from '@sentry/nextjs';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { authorizeHud } from '@/lib/auth/hud';
import { publicEnv } from '@/lib/env-public';
import { getHudMetrics } from '@/lib/hud/metrics';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

type SearchParams = Record<string, string | string[] | undefined>;

async function getHudTvAbsoluteUrl(kioskToken: string): Promise<string> {
  const headerStore = await headers();

  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const protoHeader = headerStore.get('x-forwarded-proto');

  const proto =
    protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https';

  const isValidHost = (hostValue: string | null): boolean => {
    if (!hostValue) return false;
    return /^[a-zA-Z0-9.-]+(:\d+)?$/.test(hostValue);
  };

  if (host && isValidHost(host)) {
    const base = `${proto}://${host}`;
    const url = new URL('/hud-tv', base);
    url.searchParams.set('kiosk', kioskToken);
    return url.toString();
  }

  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  Sentry.captureMessage(
    'HUD-TV: host header invalid or missing, using fallback',
    {
      level: 'warning',
      extra: { host, fallback: base },
    }
  );
  const url = new URL('/hud-tv', base);
  url.searchParams.set('kiosk', kioskToken);
  return url.toString();
}

/**
 * Token-only TV/wallboard rendering of the HUD.
 *
 * Mode resolution is fail-closed: any `?kiosk` param means token path. An
 * invalid token returns the access fallback card — admin auth is NOT
 * consulted here because the in-shell Ops surface at `/app/admin/ops` is
 * the canonical admin path. This separation prevents an invalid kiosk
 * URL from silently escalating to admin-rendered content.
 */
export default async function HudTvPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const resolvedSearchParams = await searchParams;
  const kioskTokenRaw = resolvedSearchParams.kiosk;
  const kioskToken =
    typeof kioskTokenRaw === 'string' && kioskTokenRaw.length > 0
      ? kioskTokenRaw
      : null;

  const auth = await authorizeHud(kioskToken);

  // Fail-closed: only token mode is honored on /hud-tv. Even if the request
  // happens to come from a signed-in admin, the dedicated TV route is for
  // physical-display use only — admins should use /app/admin/ops instead.
  const failedToken = !auth.ok || auth.mode !== 'kiosk';
  if (failedToken) {
    const message =
      !auth.ok && auth.reason === 'not_configured'
        ? 'This HUD is not configured for kiosk access. Set HUD_KIOSK_TOKEN to enable kiosk mode, or sign in as an admin and visit /app/admin/ops.'
        : 'Unauthorized. Provide a valid kiosk token, or sign in as an admin and visit /app/admin/ops.';

    return (
      <StandaloneProductPage width='md' centered>
        <ContentSurfaceCard surface='details' className='overflow-hidden'>
          <ContentSectionHeader
            density='compact'
            title='HUD TV access'
            subtitle='A valid kiosk token is required for the TV/wallboard view.'
          />

          <div className='space-y-4 px-5 py-5 sm:px-6'>
            <p className='text-[13px] leading-6 text-secondary-token'>
              {message}
            </p>
            <div className='rounded-[12px] border border-subtle bg-surface-0 px-4 py-3 text-[12px] leading-5 text-tertiary-token'>
              Tip: open{' '}
              <span className='font-mono text-[11px] text-primary-token'>
                /hud-tv?kiosk=YOUR_TOKEN
              </span>{' '}
              on the TV.
            </div>
          </div>
        </ContentSurfaceCard>
      </StandaloneProductPage>
    );
  }

  // Token is valid — render the kiosk wallboard. The non-null assertion is
  // safe because authorizeHud only returns mode==='kiosk' when the token
  // passed (matching expectedToken), so kioskToken is the verified value.
  const verifiedToken = kioskToken as string;
  const metrics = await getHudMetrics('kiosk');
  const hudUrl = await getHudTvAbsoluteUrl(verifiedToken);

  return (
    <main className='hud-kiosk-viewport min-h-screen bg-page text-primary-token'>
      <HudDashboardClient
        initialMetrics={metrics}
        density='kiosk'
        presentationMode='token'
        hudUrl={hudUrl}
        kioskToken={verifiedToken}
      />
    </main>
  );
}
