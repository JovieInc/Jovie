import { headers } from 'next/headers';
import Image from 'next/image';
import { QRCode } from '@/components/atoms/QRCode';
import { publicEnv } from '@/lib/env-public';
import { authorizeHud } from '@/lib/hud/auth';
import { getHudMetrics } from '@/lib/hud/metrics';
import {
  getDefaultStatusTone,
  getDeploymentLabel,
  getDeploymentTone,
} from '@/lib/hud/tone-determination';
import { HudAutoRefreshClient } from './HudAutoRefreshClient';
import { HudClockClient } from './HudClockClient';
import { HudStatusPill } from './HudStatusPill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatRunway(runwayMonths: number | null): string {
  if (runwayMonths == null) return '∞';
  if (!Number.isFinite(runwayMonths)) return '∞';
  if (runwayMonths < 0) return '0';
  return `${runwayMonths.toFixed(1)} mo`;
}

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
    // Allow alphanumerics, dots, hyphens, and optional port
    // This regex prevents suspicious characters for header injection
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
  if (host) {
    console.warn(
      '[HUD] Invalid host header detected:',
      host,
      '- using fallback:',
      base
    );
  } else {
    console.warn('[HUD] Missing host header, using fallback:', base);
  }
  const url = new URL('/hud', base);
  if (kioskToken) {
    url.searchParams.set('kiosk', kioskToken);
  }
  return url.toString();
}

export default async function HudPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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

  const defaultTone = getDefaultStatusTone(metrics.overview.defaultStatus);
  const deploymentsTone = getDeploymentTone(metrics.deployments);
  const deploymentLabel = getDeploymentLabel(metrics.deployments);

  return (
    <main className='min-h-screen bg-black text-white'>
      <HudAutoRefreshClient intervalMs={30_000} />

      <div className='mx-auto max-w-[1800px] px-10 py-10'>
        <header className='flex items-center justify-between gap-8'>
          <div className='flex items-center gap-4'>
            <div className='relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-white/5'>
              <Image
                src='/brand/Jovie-Logo-Icon-White.svg'
                alt='Jovie'
                fill
                sizes='48px'
                className='object-contain p-2'
                priority
              />
            </div>

            <h1 className='text-4xl font-semibold tracking-tight'>
              {metrics.branding.startupName}
            </h1>
          </div>

          <div className='flex flex-col items-end gap-2'>
            <div className='text-3xl font-semibold tracking-tight'>
              <HudClockClient />
            </div>
            <div className='text-sm text-white/50'>
              Updated{' '}
              {new Date(metrics.generatedAtIso).toLocaleTimeString('en-US')}
            </div>
          </div>
        </header>

        <section className='mt-10'>
          <div className='grid grid-cols-12 gap-10'>
            <div className='col-span-12 xl:col-span-8'>
              <div className='flex items-start justify-between gap-10'>
                <div>
                  <div className='text-sm uppercase tracking-[0.25em] text-white/50'>
                    MRR
                  </div>
                  <div className='mt-3 text-7xl font-semibold tracking-tight'>
                    {formatUsd(metrics.overview.mrrUsd)}
                  </div>
                  <div className='mt-3 text-2xl text-white/70'>
                    {metrics.overview.activeSubscribers.toLocaleString('en-US')}{' '}
                    subscribers
                  </div>
                </div>

                <div className='flex flex-col items-end gap-4'>
                  <HudStatusPill
                    label={deploymentLabel}
                    tone={deploymentsTone}
                  />
                  <div className='text-right text-lg text-white/50'>
                    {(() => {
                      if (metrics.deployments.current?.branch) {
                        return `Branch ${metrics.deployments.current.branch}`;
                      }
                      if (
                        metrics.deployments.availability === 'not_configured'
                      ) {
                        return 'Deploy not configured';
                      }
                      return metrics.deployments.errorMessage ?? '—';
                    })()}
                  </div>
                </div>
              </div>

              <div className='mt-10 grid grid-cols-12 gap-10 border-t border-white/10 pt-10'>
                <div className='col-span-12 xl:col-span-5'>
                  <div className='text-sm uppercase tracking-[0.25em] text-white/50'>
                    Runway
                  </div>
                  <div className='mt-3 text-5xl font-semibold tracking-tight'>
                    {formatRunway(metrics.overview.runwayMonths)}
                  </div>

                  <div className='mt-8 grid gap-5 text-xl'>
                    <div className='flex items-baseline justify-between gap-8'>
                      <div className='text-white/60'>Cash</div>
                      <div className='font-semibold tracking-tight'>
                        {formatUsd(metrics.overview.balanceUsd)}
                      </div>
                    </div>
                    <div className='flex items-baseline justify-between gap-8'>
                      <div className='text-white/60'>Burn (30d)</div>
                      <div className='font-semibold tracking-tight'>
                        {formatUsd(metrics.overview.burnRateUsd)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className='col-span-12 xl:col-span-7'>
                  <div className='grid grid-cols-2 gap-10'>
                    <div>
                      <div className='text-sm uppercase tracking-[0.25em] text-white/50'>
                        Operations
                      </div>
                      <div className='mt-3 text-4xl font-semibold tracking-tight'>
                        {metrics.operations.status === 'ok'
                          ? 'Healthy'
                          : 'Degraded'}
                      </div>
                      <div className='mt-3 text-xl text-white/70'>
                        DB latency{' '}
                        {metrics.operations.dbLatencyMs === null
                          ? '—'
                          : `${metrics.operations.dbLatencyMs.toFixed(0)}ms`}
                      </div>
                    </div>

                    <div>
                      <div className='text-sm uppercase tracking-[0.25em] text-white/50'>
                        Reliability
                      </div>
                      <div className='mt-3 text-4xl font-semibold tracking-tight'>
                        {metrics.reliability.errorRatePercent.toFixed(2)}%
                      </div>
                      <div className='mt-3 text-xl text-white/70'>
                        p95{' '}
                        {metrics.reliability.p95LatencyMs === null
                          ? '—'
                          : `${metrics.reliability.p95LatencyMs.toFixed(0)}ms`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className='col-span-12 xl:col-span-4 xl:col-start-9'>
              <div className='flex items-start justify-between gap-8 border-b border-white/10 pb-8'>
                <div>
                  <div className='text-sm uppercase tracking-[0.25em] text-white/50'>
                    Open on phone
                  </div>
                  <div className='mt-3 text-2xl font-semibold tracking-tight'>
                    Scan to view
                  </div>
                </div>
                <QRCode
                  data={hudUrl}
                  size={220}
                  label='HUD link'
                  className='rounded-xl bg-white p-3'
                />
              </div>

              <div className='mt-8'>
                <div className='text-sm uppercase tracking-[0.25em] text-white/50'>
                  Deployments
                </div>

                {metrics.deployments.recent.length > 0 ? (
                  <div className='mt-5 grid gap-4'>
                    {metrics.deployments.recent.slice(0, 5).map(run => (
                      <div
                        key={run.id}
                        className='flex items-center justify-between gap-6'
                      >
                        <div className='text-xl font-semibold tracking-tight'>
                          #{run.runNumber}
                          <span className='ml-3 text-white/60 font-normal'>
                            {run.branch ?? '—'}
                          </span>
                        </div>
                        <div className='text-white/60 text-sm'>
                          {new Date(run.createdAtIso).toLocaleString('en-US', {
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          <span className='ml-3 text-white/80 font-semibold'>
                            {run.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className='mt-4 text-xl text-white/60'>—</div>
                )}
              </div>
            </div>
          </div>

          <div className='mt-10 rounded-3xl border border-white/10 bg-white/5 p-10'>
            <div className='flex items-start justify-between gap-10'>
              <div>
                <div className='text-sm uppercase tracking-[0.25em] text-white/60'>
                  Default status
                </div>
                <div className='mt-3 text-6xl font-semibold tracking-tight'>
                  {metrics.overview.defaultStatus.toUpperCase()}
                </div>
              </div>

              <HudStatusPill
                label={
                  metrics.overview.defaultStatus === 'alive' ? 'Alive' : 'Dead'
                }
                tone={defaultTone}
              />
            </div>
            <div className='mt-5 text-2xl text-white/70 leading-snug'>
              {metrics.overview.defaultStatusDetail}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
