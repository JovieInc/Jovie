import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { authorizeHud } from '@/lib/auth/hud';
import { publicEnv } from '@/lib/env-public';
import { getHudMetrics } from '@/lib/hud/metrics';
import { HudDashboardClient } from './HudDashboardClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

async function getHudAbsoluteUrl(kioskToken: string | null): Promise<string> {
  const headerStore = await headers();

  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const protoHeader = headerStore.get('x-forwarded-proto');

  // Validate and normalize protocol - http or https only
  const proto =
    protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https';

  // Validate host header to prevent injection attacks
  const isValidHost = (hostValue: string | null): boolean => {
    if (!hostValue) return false;
    return /^[a-zA-Z0-9.-]+(:\d+)?$/.test(hostValue);
  };

  // In production, host should be available from reverse proxy
  if (host && isValidHost(host)) {
    const base = `${proto}://${host}`;
    const url = new URL('/hud', base);
    if (kioskToken) {
      url.searchParams.set('kiosk', kioskToken);
    }
    return url.toString();
  }

  // Use validated env for fallback URL (includes protocol)
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  Sentry.captureMessage('HUD: host header invalid or missing, using fallback', {
    level: 'warning',
    extra: { host, fallback: base },
  });
  const url = new URL('/hud', base);
  if (kioskToken) {
    url.searchParams.set('kiosk', kioskToken);
  }
  return url.toString();
}

export default async function HudPage({
  searchParams,
}: Readonly<{
  searchParams: SearchParams;
}>) {
  const kioskTokenRaw = searchParams.kiosk;
  const kioskToken = typeof kioskTokenRaw === 'string' ? kioskTokenRaw : null;

  const auth = await authorizeHud(kioskToken);

  if (!auth.ok) {
    const message =
      auth.reason === 'not_configured'
        ? 'This HUD is not configured for kiosk access. Sign in as an admin to view it, or set HUD_KIOSK_TOKEN to enable kiosk mode.'
        : 'Unauthorized. Sign in as an admin, or provide a valid kiosk token.';

    return (
      <StandaloneProductPage width='md' centered>
        <ContentSurfaceCard surface='details' className='overflow-hidden'>
          <ContentSectionHeader
            density='compact'
            title='HUD access'
            subtitle='Admin sign-in or a valid kiosk token is required.'
          />

          <div className='space-y-4 px-5 py-5 sm:px-6'>
            <p className='text-[13px] leading-6 text-secondary-token'>
              {message}
            </p>
            <div className='rounded-[12px] border border-subtle bg-surface-0 px-4 py-3 text-[12px] leading-5 text-tertiary-token'>
              Tip: open{' '}
              <span className='font-mono text-[11px] text-primary-token'>
                /hud?kiosk=YOUR_TOKEN
              </span>{' '}
              on the TV.
            </div>
          </div>
        </ContentSurfaceCard>
      </StandaloneProductPage>
    );
  }

  const metrics = await getHudMetrics(auth.mode);
  const hudUrl = await getHudAbsoluteUrl(kioskToken);

  return (
    <main className='min-h-screen bg-page text-primary-token'>
      <HudDashboardClient
        initialMetrics={metrics}
        hudUrl={hudUrl}
        kioskToken={kioskToken}
      />
    </main>
  );
}
