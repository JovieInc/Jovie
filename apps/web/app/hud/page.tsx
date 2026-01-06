import Image from 'next/image';
import { authorizeHud } from '@/lib/hud/auth';
import { getHudMetrics } from '@/lib/hud/metrics';
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

  const defaultTone =
    metrics.overview.defaultStatus === 'alive' ? 'good' : 'bad';
  const opsTone = metrics.operations.status === 'ok' ? 'good' : 'warning';

  const deploymentsTone =
    metrics.deployments.availability === 'not_configured'
      ? 'neutral'
      : metrics.deployments.current?.status === 'success'
        ? 'good'
        : metrics.deployments.current?.status === 'in_progress'
          ? 'warning'
          : metrics.deployments.current?.status === 'failure'
            ? 'bad'
            : 'neutral';

  const deploymentLabel =
    metrics.deployments.availability === 'not_configured'
      ? 'Deploy: not configured'
      : metrics.deployments.availability === 'error'
        ? 'Deploy: error'
        : metrics.deployments.current
          ? `Deploy: ${metrics.deployments.current.status}`
          : 'Deploy: unknown';

  return (
    <main className='min-h-screen bg-black text-white'>
      <HudAutoRefreshClient intervalMs={30_000} />

      <div className='mx-auto max-w-[1800px] px-10 py-10'>
        <header className='flex items-center justify-between gap-8'>
          <div className='flex items-center gap-4'>
            {metrics.branding.logoUrl ? (
              <div className='relative h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-white/5'>
                <Image
                  src={metrics.branding.logoUrl}
                  alt={metrics.branding.startupName}
                  fill
                  sizes='56px'
                  className='object-contain p-2'
                  priority
                />
              </div>
            ) : null}
            <div>
              <div className='text-sm uppercase tracking-[0.25em] text-white/60'>
                {metrics.accessMode === 'kiosk' ? 'Kiosk' : 'Admin'} HUD
              </div>
              <h1 className='text-4xl font-semibold tracking-tight'>
                {metrics.branding.startupName}
              </h1>
            </div>
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

        <section className='mt-10 grid grid-cols-12 gap-6'>
          <div className='col-span-12 xl:col-span-7 grid grid-cols-2 gap-6'>
            <div className='rounded-3xl border border-white/10 bg-white/5 p-8'>
              <div className='flex items-start justify-between gap-6'>
                <div>
                  <div className='text-sm uppercase tracking-[0.2em] text-white/60'>
                    MRR
                  </div>
                  <div className='mt-2 text-6xl font-semibold tracking-tight'>
                    {formatUsd(metrics.overview.mrrUsd)}
                  </div>
                  <div className='mt-2 text-white/60 text-lg'>
                    {metrics.overview.activeSubscribers.toLocaleString('en-US')}{' '}
                    subscribers
                  </div>
                </div>
                <HudStatusPill label={deploymentLabel} tone={deploymentsTone} />
              </div>
            </div>

            <div className='rounded-3xl border border-white/10 bg-white/5 p-8'>
              <div className='text-sm uppercase tracking-[0.2em] text-white/60'>
                Runway
              </div>
              <div className='mt-2 text-6xl font-semibold tracking-tight'>
                {formatRunway(metrics.overview.runwayMonths)}
              </div>
              <div className='mt-3 grid grid-cols-2 gap-4 text-lg text-white/70'>
                <div>
                  <div className='text-white/50 text-sm uppercase tracking-widest'>
                    Cash
                  </div>
                  <div className='mt-1 text-white'>
                    {formatUsd(metrics.overview.balanceUsd)}
                  </div>
                </div>
                <div>
                  <div className='text-white/50 text-sm uppercase tracking-widest'>
                    Burn (30d)
                  </div>
                  <div className='mt-1 text-white'>
                    {formatUsd(metrics.overview.burnRateUsd)}
                  </div>
                </div>
              </div>
            </div>

            <div className='rounded-3xl border border-white/10 bg-white/5 p-8'>
              <div className='flex items-start justify-between gap-6'>
                <div>
                  <div className='text-sm uppercase tracking-[0.2em] text-white/60'>
                    Default status
                  </div>
                  <div className='mt-2 text-5xl font-semibold tracking-tight'>
                    {metrics.overview.defaultStatus.toUpperCase()}
                  </div>
                </div>
                <HudStatusPill
                  label={
                    metrics.overview.defaultStatus === 'alive'
                      ? 'Alive'
                      : 'Dead'
                  }
                  tone={defaultTone}
                />
              </div>
              <div className='mt-4 text-white/70 text-lg leading-snug'>
                {metrics.overview.defaultStatusDetail}
              </div>
            </div>

            <div className='rounded-3xl border border-white/10 bg-white/5 p-8'>
              <div className='flex items-start justify-between gap-6'>
                <div>
                  <div className='text-sm uppercase tracking-[0.2em] text-white/60'>
                    Operations
                  </div>
                  <div className='mt-2 text-5xl font-semibold tracking-tight'>
                    {metrics.operations.status === 'ok'
                      ? 'Healthy'
                      : 'Degraded'}
                  </div>
                  <div className='mt-2 text-white/60 text-lg'>
                    DB latency{' '}
                    {metrics.operations.dbLatencyMs != null
                      ? `${metrics.operations.dbLatencyMs.toFixed(0)}ms`
                      : '—'}
                  </div>
                </div>
                <HudStatusPill
                  label={metrics.operations.status === 'ok' ? 'OK' : 'Degraded'}
                  tone={opsTone}
                />
              </div>
            </div>
          </div>

          <div className='col-span-12 xl:col-span-5 grid gap-6'>
            <div className='rounded-3xl border border-white/10 bg-white/5 p-8'>
              <div className='flex items-start justify-between gap-6'>
                <div>
                  <div className='text-sm uppercase tracking-[0.2em] text-white/60'>
                    Reliability
                  </div>
                  <div className='mt-2 text-5xl font-semibold tracking-tight'>
                    {metrics.reliability.errorRatePercent.toFixed(2)}%
                  </div>
                  <div className='mt-2 text-white/60 text-lg'>
                    p95 latency{' '}
                    {metrics.reliability.p95LatencyMs != null
                      ? `${metrics.reliability.p95LatencyMs.toFixed(0)}ms`
                      : '—'}
                  </div>
                </div>
                <HudStatusPill
                  label={`${metrics.reliability.incidents24h.toLocaleString('en-US')} incidents (24h)`}
                  tone={
                    metrics.reliability.incidents24h > 0 ? 'warning' : 'good'
                  }
                />
              </div>
              <div className='mt-4 text-white/60 text-lg'>
                Last incident{' '}
                {metrics.reliability.lastIncidentAtIso
                  ? new Date(
                      metrics.reliability.lastIncidentAtIso
                    ).toLocaleDateString('en-US')
                  : '—'}
              </div>
            </div>

            <div className='rounded-3xl border border-white/10 bg-white/5 p-8'>
              <div className='flex items-start justify-between gap-6'>
                <div>
                  <div className='text-sm uppercase tracking-[0.2em] text-white/60'>
                    Deployments
                  </div>
                  <div className='mt-2 text-4xl font-semibold tracking-tight'>
                    {metrics.deployments.current
                      ? `#${metrics.deployments.current.runNumber}`
                      : '—'}
                  </div>
                  <div className='mt-2 text-white/60 text-lg'>
                    {metrics.deployments.current?.branch
                      ? `Branch ${metrics.deployments.current.branch}`
                      : metrics.deployments.availability === 'not_configured'
                        ? 'Configure HUD_GITHUB_* env vars'
                        : (metrics.deployments.errorMessage ?? '—')}
                  </div>
                </div>
                <HudStatusPill label={deploymentLabel} tone={deploymentsTone} />
              </div>

              {metrics.deployments.recent.length > 0 ? (
                <div className='mt-6 grid gap-3'>
                  {metrics.deployments.recent.slice(0, 4).map(run => (
                    <div
                      key={run.id}
                      className='flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-5 py-4'
                    >
                      <div className='text-lg font-semibold tracking-tight'>
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
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
