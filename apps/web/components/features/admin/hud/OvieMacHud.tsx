import { Button } from '@jovie/ui';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { DesktopTitlebar } from '@/components/atoms/DesktopTitlebar';
import { DesignProposalReviewPanel } from '@/components/features/admin/design-lab';
import { OvieLauncherRail } from '@/components/features/admin/hud/OvieLauncherRail';
import { SymphonyCodexAccountControl } from '@/components/features/admin/hud/SymphonyCodexAccountControl';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import {
  type OvieMacHudInFlightPrStatus,
  type OvieMacHudSnapshot,
  ycBarLabel,
} from '@/lib/hud/ovie-mac-hud';
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

function prStatusTone(
  status: OvieMacHudInFlightPrStatus
): 'good' | 'warning' | 'bad' | 'neutral' {
  if (status === 'merge_queue') return 'good';
  if (status === 'blocked') return 'bad';
  if (status === 'in_review') return 'warning';
  return 'neutral';
}

function prListSummary(
  snapshot: OvieMacHudSnapshot['inFlightPullRequests']
): string {
  if (snapshot.availability === 'not_configured') return 'No GitHub Signal';
  if (snapshot.availability === 'error') return 'Signal Error';
  if (snapshot.totalOpen === 0) return '0 Open';
  const visible = snapshot.items.length.toLocaleString('en-US');
  const total = snapshot.totalOpen.toLocaleString('en-US');
  return snapshot.truncated ? `${visible} / ${total} Open` : `${total} Open`;
}

function InFlightPullRequestsPanel({
  pullRequests,
}: Readonly<{
  readonly pullRequests: OvieMacHudSnapshot['inFlightPullRequests'];
}>) {
  const showList =
    pullRequests.availability === 'available' && pullRequests.items.length > 0;

  return (
    <ContentSurfaceCard
      className='flex h-full min-h-40 flex-col p-3.5'
      data-testid='ovie-mac-hud-inflight-prs'
    >
      <div className='flex min-h-6 items-center justify-between gap-3'>
        <p className='truncate text-2xs font-semibold tracking-normal text-tertiary-token'>
          In-flight PRs
        </p>
        <span className='shrink-0 text-2xs font-medium text-secondary-token'>
          {prListSummary(pullRequests)}
        </span>
      </div>

      <div className='mt-3 min-h-52'>
        {showList ? (
          <ol className='grid max-h-96 gap-1 overflow-auto pr-1'>
            {pullRequests.items.map(pr => (
              <li key={pr.number}>
                <a
                  className='block rounded-lg px-2 py-2 text-left outline-none transition-colors duration-subtle hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset'
                  href={pr.url}
                  rel='noreferrer'
                  target='_blank'
                >
                  <div className='flex min-h-6 items-start justify-between gap-2'>
                    <p className='min-w-0 flex-1 truncate text-app font-medium text-primary-token'>
                      <span className='font-normal text-tertiary-token'>
                        #{pr.number}
                      </span>{' '}
                      {pr.title}
                    </p>
                    <HudStatusPill
                      label={pr.statusLabel}
                      tone={prStatusTone(pr.status)}
                    />
                  </div>
                  <p className='mt-1 truncate text-2xs text-tertiary-token'>
                    {pr.headRefName} · {pr.statusDetail}
                  </p>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <div className='flex min-h-52 items-center text-app leading-5 text-secondary-token'>
            {pullRequests.availability === 'available'
              ? 'No in-flight PRs.'
              : (pullRequests.errorMessage ?? 'GitHub PR signal unavailable.')}
          </div>
        )}
      </div>
    </ContentSurfaceCard>
  );
}

export function OvieMacHud({
  snapshot,
}: Readonly<{ readonly snapshot: OvieMacHudSnapshot }>) {
  const { alive, growth, inFlightPullRequests, shipping } = snapshot;
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
      <main className='mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-6 py-6'>
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
        <SymphonyCodexAccountControl />
        <section className='grid min-h-40 gap-3 xl:grid-cols-4'>
          <div className='grid gap-3 md:grid-cols-3 xl:col-span-3'>
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
          <InFlightPullRequestsPanel pullRequests={inFlightPullRequests} />
        </section>
        <DesignProposalReviewPanel />
      </main>
    </div>
  );
}
