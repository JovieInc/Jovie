import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { publicEnv } from '@/lib/env-public';
import { authorizeHud } from '@/lib/hud/auth';
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
    return (
      <main className='min-h-screen bg-black text-white flex items-center justify-center p-10'>
        <div className='max-w-2xl w-full space-y-4'>
          <div className='text-3xl font-semibold tracking-tight'>
            HUD access
          </div>
          <div className='text-white/70 text-lg'>
            {auth.reason === 'not_configured'
              ? 'This HUD is not configured for kiosk access. Sign in as an admin to view it, or set HUD_KIOSK_TOKEN to enable kiosk mode.'
              : 'Unauthorized. Sign in as an admin, or provide a valid kiosk token.'}
          </div>
          <div className='text-white/50 text-sm'>
            Tip: load this page as /hud?kiosk=YOUR_TOKEN on the TV.
          </div>
        </div>
      </main>
    );
  }

  const metrics = await getHudMetrics(auth.mode);
  const hudUrl = await getHudAbsoluteUrl(kioskToken);

  return (
    <main className='min-h-screen bg-black text-white'>
      <HudDashboardClient
        initialMetrics={metrics}
        hudUrl={hudUrl}
        kioskToken={kioskToken}
      />
    </main>
  );
}
