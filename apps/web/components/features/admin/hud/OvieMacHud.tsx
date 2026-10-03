'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { APP_ROUTES } from '@/constants/routes';
import { type OvieMacHudSnapshot, ycBarLabel } from '@/lib/hud/ovie-mac-hud';
import { getDefaultStatusTone } from '@/lib/hud/tone-determination';

function formatUsd(value: number | null): string {
  if (value == null) return '\u2014';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString('en-US', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  })}%`;
}

function aliveLabel(status: OvieMacHudSnapshot['alive']['status']): string {
  if (status === 'alive') return 'Default alive';
  if (status === 'dead') return 'Default dead';
  return 'Default unknown';
}

const VALUE_CLASS =
  'min-h-8 text-3xl font-semibold leading-none tracking-tight';
const REFRESH_INTERVAL_MS = 30_000;

function formatGeneratedAt(generatedAtIso: string): string {
  return new Date(generatedAtIso).toISOString().slice(11, 19);
}

export function OvieMacHud({
  snapshot,
  fullscreen = false,
}: Readonly<{
  readonly snapshot: OvieMacHudSnapshot;
  readonly fullscreen?: boolean;
}>) {
  const router = useRouter();
  const { alive, growth, shipping } = snapshot;
  const growthValue = growth.available ? formatPercent(growth.rate) : '\u2014';
  const shippingValue = shipping.available
    ? shipping.shipsThisWeek.toLocaleString('en-US')
    : '\u2014';
  const status = aliveLabel(alive.status);

  useEffect(() => {
    const refreshTimer = globalThis.setInterval(() => {
      const refreshUrl = new URL(globalThis.location.href);
      refreshUrl.searchParams.set('ovie_refresh', Date.now().toString());
      router.replace(
        `${refreshUrl.pathname}${refreshUrl.search}${refreshUrl.hash}`,
        { scroll: false }
      );
      router.refresh();
    }, REFRESH_INTERVAL_MS);

    return () => globalThis.clearInterval(refreshTimer);
  }, [router]);

  return (
    <div
      className='flex h-full min-h-0 flex-col overflow-y-auto bg-page text-primary-token'
      data-generated-at={snapshot.generatedAtIso}
      data-presentation-mode={fullscreen ? 'fullscreen' : 'shell'}
      data-testid='ovie-mac-hud'
    >
      <main className='mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6'>
        <header className='flex min-h-10 flex-wrap items-center justify-between gap-3'>
          <h1 className='text-lg font-semibold tracking-tight'>Ovie</h1>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <Button asChild className='gap-1.5' size='sm' variant='tertiary'>
              <Link href={APP_ROUTES.CHAT}>
                <ArrowLeft className='h-3.5 w-3.5' aria-hidden='true' />
                Back to Jovie
              </Link>
            </Button>
            <HudFullscreenControl fullscreen={fullscreen} />
            <time
              className='w-36 text-right text-2xs tabular-nums text-tertiary-token'
              dateTime={snapshot.generatedAtIso}
              data-testid='ovie-mac-refresh-receipt'
            >
              Updated {formatGeneratedAt(snapshot.generatedAtIso)} UTC
            </time>
            <HudStatusPill
              label={status}
              tone={getDefaultStatusTone(alive.status)}
            />
          </div>
        </header>
        <div className='grid min-h-40 gap-3 md:grid-cols-3'>
          <ContentMetricCard
            className='h-full'
            label='Default Alive'
            value={status}
            valueClassName={VALUE_CLASS}
            subtitleClassName='min-h-52'
            data-testid='ovie-mac-hud-alive'
            aria-label={status}
            subtitle={
              <div className='grid gap-1.5'>
                <ContentMetricRow
                  label='Cash'
                  value={formatUsd(alive.cashUsd)}
                />
                <ContentMetricRow
                  label='Weekly Burn'
                  value={formatUsd(alive.weeklyBurnUsd)}
                />
                <ContentMetricRow
                  label='Weekly Revenue'
                  value={formatUsd(alive.weeklyRevenueUsd)}
                />
                <p>{alive.detail}</p>
              </div>
            }
          />
          <ContentMetricCard
            className='h-full'
            label='Week-over-week Growth'
            value={growthValue}
            valueClassName={VALUE_CLASS}
            subtitleClassName='min-h-52'
            data-testid='ovie-mac-hud-growth'
            aria-label={`Week over week growth ${growthValue}`}
            subtitle={
              <div className='grid gap-1.5'>
                <ContentMetricRow
                  label={
                    growth.source === 'revenue' ? 'Revenue' : 'Active Users'
                  }
                  value={
                    !growth.available
                      ? '\u2014'
                      : growth.source === 'revenue'
                        ? formatUsd(growth.thisWeek)
                        : growth.thisWeek.toLocaleString('en-US')
                  }
                />
                <p>
                  {growth.available
                    ? ycBarLabel(growth.ycBar)
                    : 'Revenue and active-user inputs are unavailable. Reload Jovie to retry.'}
                </p>
              </div>
            }
          />
          <ContentMetricCard
            className='h-full'
            label='Shipping Throughput'
            value={shippingValue}
            valueClassName={VALUE_CLASS}
            subtitleClassName='min-h-52'
            data-testid='ovie-mac-hud-shipping'
            aria-label={`Shipping throughput ${shippingValue} ships this week`}
            subtitle={<p>{shipping.detail}</p>}
          />
        </div>
      </main>
    </div>
  );
}
