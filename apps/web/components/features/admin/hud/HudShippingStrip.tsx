'use client';

// @coverage-via apps/web/tests/unit/app/ops-cockpit.test.tsx

import { ArrowRight } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { computeRatePercent } from '@/lib/analytics/metrics';
import type { ShippingStateView } from '@/lib/ovie/shipping-state-client';

const NOT_MEASURED = '—';

function count(value: number | null): string {
  return value === null ? NOT_MEASURED : value.toLocaleString('en-US');
}

const LYB_REPO = 'JovieInc/LogYourBody';

/** LogYourBody production: commits behind main, or Failing when its deploys are red (deploy-health feed block). */
function lybBehind(view: ShippingStateView): {
  readonly value: string;
  readonly tone: 'neutral' | 'bad';
} {
  const lyb = view.delivery.lanes.deployHealth?.repos.find(
    repo => repo.repo === LYB_REPO
  );
  if (!lyb) return { value: NOT_MEASURED, tone: 'neutral' };
  if (lyb.status === 'failing')
    return {
      value: `Failing, ${count(lyb.behindMain)} behind`,
      tone: 'bad',
    };
  return { value: count(lyb.behindMain), tone: 'neutral' };
}

const JOVIE_REPO = 'JovieInc/Jovie';

/** Jovie merge-to-production lag p95 against its target; bad when over target. */
function prodLag(view: ShippingStateView): {
  readonly value: string;
  readonly tone: 'neutral' | 'bad';
} {
  const lag = view.delivery.lanes.deployHealth?.lag?.find(
    row => row.repo === JOVIE_REPO
  );
  if (!lag || lag.p95Min === null)
    return { value: NOT_MEASURED, tone: 'neutral' };
  const target = lag.targetP95Min === null ? '' : ` / ${lag.targetP95Min}m`;
  return {
    value: `p95 ${Math.round(lag.p95Min)}m${target}`,
    tone:
      lag.targetP95Min !== null && lag.p95Min > lag.targetP95Min
        ? 'bad'
        : 'neutral',
  };
}

function ciLabel(view: ShippingStateView): string {
  if (view.ciGreen.value === null) return NOT_MEASURED;
  return view.ciGreen.value ? 'Green' : 'Failing';
}

function mergeRate(view: ShippingStateView): string {
  const last = view.delivery.merges.last7Days.value;
  if (last === null) return NOT_MEASURED;
  const prior = view.delivery.merges.prior7Days.value;
  if (prior === null || prior === 0) return last.toLocaleString('en-US');
  const change = computeRatePercent(last - prior, prior, 0);
  return `${last.toLocaleString('en-US')} (${change >= 0 ? '+' : ''}${change}%)`;
}

function Chip({
  label,
  value,
  tone = 'neutral',
}: Readonly<{
  readonly label: string;
  readonly value: string;
  readonly tone?: 'neutral' | 'good' | 'bad';
}>) {
  const valueClass =
    tone === 'good'
      ? 'text-success'
      : tone === 'bad'
        ? 'text-error'
        : 'text-primary-token';
  return (
    <span className='inline-flex items-baseline gap-1.5'>
      <span className='text-2xs text-tertiary-token'>{label}</span>
      <span
        className={`text-app font-semibold tabular-nums ${valueClass}`}
        data-testid={`hud-shipping-chip-${label.toLowerCase().replaceAll(' ', '-')}`}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * Compact shipping strip: queue depth, in-flight PRs, CI state, and merge
 * rate, with click-through to the dedicated Shipping dashboard.
 */
export function HudShippingStrip({
  view,
}: Readonly<{ readonly view: ShippingStateView }>) {
  const { delivery } = view;
  const ciTone =
    view.ciGreen.value === null
      ? 'neutral'
      : view.ciGreen.value
        ? 'good'
        : 'bad';
  const queueTone =
    (delivery.mergeQueueDepth.value ?? 0) > 0 ? 'bad' : 'neutral';

  return (
    <ContentSurfaceCard
      surface='details'
      data-testid='hud-shipping-strip'
      className='overflow-hidden'
    >
      <div className='flex flex-wrap items-center gap-x-5 gap-y-2 p-3'>
        <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
          Shipping
        </p>
        <Chip
          label='Queue'
          value={count(delivery.mergeQueueDepth.value)}
          tone={queueTone}
        />
        <Chip label='In Flight' value={count(delivery.inFlight.value)} />
        <Chip label='CI' value={ciLabel(view)} tone={ciTone} />
        <Chip label='Merged 7 Days' value={mergeRate(view)} />
        <Chip
          label='Behind Main'
          value={count(delivery.production.behindMain.value)}
        />
        <Chip
          label='Prod Lag'
          value={prodLag(view).value}
          tone={prodLag(view).tone}
        />
        <Chip
          label='LYB Behind'
          value={lybBehind(view).value}
          tone={lybBehind(view).tone}
        />
        <a
          href={APP_ROUTES.ADMIN_SHIPPING}
          className='ml-auto inline-flex items-center gap-1 text-2xs font-medium text-secondary-token transition-colors hover:text-primary-token'
        >
          Open shipping
          <ArrowRight className='h-3 w-3' aria-hidden='true' />
        </a>
      </div>
    </ContentSurfaceCard>
  );
}
