import { Button } from '@jovie/ui';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { DesktopTitlebar } from '@/components/atoms/DesktopTitlebar';
import { DesignProposalReviewPanel } from '@/components/features/admin/design-lab';
import { OvieLauncherRail } from '@/components/features/admin/hud/OvieLauncherRail';
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

export function OvieMacHud({
  snapshot,
}: Readonly<{ readonly snapshot: OvieMacHudSnapshot }>) {
  const { alive, growth, shipping } = snapshot;
  const growthValue = growth.available ? formatPercent(growth.rate) : '\u2014';
  const shippingValue = shipping.available
    ? shipping.shipsThisWeek.toLocaleString('en-US')
    : '\u2014';
  const status = aliveLabel(alive.status);

  return (
    <div
      className='flex min-h-svh flex-col bg-page text-primary-token'
      data-testid='ovie-mac-hud'
    >
      <DesktopTitlebar />
      <main className='mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6'>
        <header className='flex min-h-10 items-center justify-between gap-3'>
          <h1 className='text-lg font-semibold tracking-tight'>Ovie</h1>
          <div className='flex min-w-0 items-center gap-2'>
            <Button
              asChild
              variant='secondary'
              size='sm'
              className='min-w-fit gap-1.5'
            >
              <Link href={APP_ROUTES.ADMIN_CHAT} aria-label='Talk To Summer'>
                <MessageCircle className='h-4 w-4' aria-hidden='true' />
                Talk To Summer
              </Link>
            </Button>
            <HudStatusPill
              label={status}
              tone={getDefaultStatusTone(alive.status)}
            />
          </div>
        </header>
        <OvieLauncherRail />
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
                    growth.source === 'revenue'
                      ? formatUsd(growth.thisWeek)
                      : growth.thisWeek.toLocaleString('en-US')
                  }
                />
                <p>{ycBarLabel(growth.ycBar)}</p>
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
        <DesignProposalReviewPanel />
      </main>
    </div>
  );
}
