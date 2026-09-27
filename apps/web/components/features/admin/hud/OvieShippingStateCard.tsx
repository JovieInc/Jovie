'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieShippingStateCard.test.tsx
import { Ship } from 'lucide-react';
import { useEffect } from 'react';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { CountMeasurement } from '@/lib/ovie/shipping-state';
import type {
  ShippingMeaningView,
  ShippingStateView,
} from '@/lib/ovie/shipping-state-client';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

const TRUTH_LABEL: Record<ShippingStateView['truth'], string> = {
  fresh: 'Fresh',
  stale: 'Connected Stale',
  disconnected: 'Disconnected',
  unavailable: 'Unavailable',
  unauthorized: 'Unauthorized',
  degraded: 'Degraded',
  unknown: 'Unknown',
  failure: 'Error',
  recovery: 'Recovery',
};

const NOT_MEASURED = 'n/a';

type Delivery = ShippingStateView['delivery'];

function formatCount(count: CountMeasurement): string {
  return count.value === null
    ? NOT_MEASURED
    : count.value.toLocaleString('en-US');
}

function formatMeaning(meaning: ShippingMeaningView): string {
  if (meaning.value === null) return NOT_MEASURED;
  return meaning.value ? 'Yes' : 'No';
}

function formatLanes(lanes: Delivery['lanes']): string {
  if (lanes.running.value === null || lanes.slots.value === null) {
    return NOT_MEASURED;
  }
  const value = `${lanes.running.value}/${lanes.slots.value}`;
  return lanes.stale ? `${value} stale` : value;
}

function formatWeek(merges: Delivery['merges']): string {
  const last = merges.last7Days.value;
  const prior = merges.prior7Days.value;
  if (last === null) return NOT_MEASURED;
  const total = last.toLocaleString('en-US');
  if (prior === null || prior === 0) return total;
  const change = Math.round(((last - prior) / prior) * 100);
  return `${total} (${change >= 0 ? '+' : ''}${change}% WoW)`;
}

function formatProduction(production: Delivery['production']): string {
  if (!production.sha) return NOT_MEASURED;
  const sha = production.sha.slice(0, 7);
  return production.version ? `${production.version} ${sha}` : sha;
}

const SUMMER_LABEL = { up: 'Up', down: 'Down', degraded: 'Degraded' } as const;

function formatAge(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function lanesLine(lanes: Delivery['lanes']): string {
  const landing = formatAge(lanes.lastLandingAgeSeconds.value);
  return [
    ...lanes.lanes.map(lane => `${lane.name} ${lane.running}/${lane.slots}`),
    lanes.pool.value === null ? null : `pool ${lanes.pool.value}`,
    landing ? `last landing ${landing}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function truthLabel(view: ShippingStateView): string {
  return view.truth === 'stale' && view.connection !== 'connected'
    ? TRUTH_LABEL.disconnected
    : TRUTH_LABEL[view.truth];
}

function compactMetaValue(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 28) return value;
  return `${value.slice(0, 14)}...${value.slice(-10)}`;
}

function useOvieShippingStateQuery(kioskToken: string | null) {
  const query = useHudShippingStateQuery(kioskToken);
  const refetch = query.refetch;
  useEffect(() => {
    function onResume(event: Event) {
      if (
        event.type === 'pageshow' &&
        !(event as PageTransitionEvent).persisted
      ) {
        return;
      }
      if (document.visibilityState === 'visible') void refetch();
    }
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [refetch]);
  return {
    view: query.view,
    isPending: query.isPending,
  };
}

function ShippingStateBody({
  view,
}: Readonly<{ readonly view: ShippingStateView }>) {
  const age =
    view.ageMs === null
      ? null
      : view.ageMs < 1000
        ? 'Just now'
        : `${Math.floor(view.ageMs / 1000)}s ago`;
  const fullSourceLine = [view.sourceIdentity, view.revision, age]
    .filter(Boolean)
    .join(' / ');
  const sourceLine = [
    compactMetaValue(view.sourceIdentity),
    compactMetaValue(view.revision),
    age,
  ]
    .filter(Boolean)
    .join(' / ');
  const { delivery } = view;
  const byRepo = delivery.merges.byRepo;
  const rows = [
    ['Lanes Running', formatLanes(delivery.lanes)],
    ['Merge Queue', formatCount(delivery.mergeQueueDepth)],
    ['Merged Today', formatCount(delivery.merges.today)],
    ['In Flight', formatCount(delivery.inFlight)],
    [
      'Jovie / LYB / Summer',
      [byRepo.Jovie, byRepo.LogYourBody, byRepo['summer-config']]
        .map(formatCount)
        .join(' / '),
    ],
    ['Merged 7d', formatWeek(delivery.merges)],
    ['Production', formatProduction(delivery.production)],
    ['Behind Main', formatCount(delivery.production.behindMain)],
    ['CI Green', formatMeaning(view.ciGreen)],
    [
      'Summer',
      delivery.summer.availability
        ? SUMMER_LABEL[delivery.summer.availability]
        : NOT_MEASURED,
    ],
  ] as const;
  const lanesDetail = lanesLine(delivery.lanes);

  return (
    <>
      <div
        className='grid gap-2 sm:grid-cols-2'
        data-testid='hud-delivery-metrics'
      >
        {rows.map(([label, value]) => (
          <ContentMetricRow key={label} label={label} value={value} />
        ))}
      </div>
      <p
        className='min-h-4 truncate text-2xs leading-4 text-secondary-token'
        title={lanesDetail || undefined}
      >
        {lanesDetail || 'Lanes feed not measured'}
      </p>
      <p className='min-h-4 truncate text-2xs leading-4 text-secondary-token'>
        {delivery.lanes.alerts.join(' · ')}
      </p>
      <p
        className='min-h-4 break-words text-2xs leading-4 text-tertiary-token'
        title={fullSourceLine || undefined}
      >
        {sourceLine || 'No successful source yet'}
      </p>
      <p className='min-h-5 text-app leading-5 text-secondary-token'>
        {view.lastError ?? ''}
      </p>
    </>
  );
}

export function OvieShippingStateCard({
  kioskToken = null,
}: Readonly<{
  readonly kioskToken?: string | null;
}>) {
  const { view, isPending } = useOvieShippingStateQuery(kioskToken);

  return (
    <ContentSurfaceCard
      surface='details'
      data-testid='hud-shipper-status-panel'
      data-ovie-shipping-state='true'
      data-truth={view.truth}
      data-connection={view.connection}
      data-revision={view.revision ?? ''}
      data-entity={view.entityId ?? ''}
      data-correlation={view.correlationEventId ?? view.projectionId ?? ''}
      data-source-time={view.sourceTime ?? ''}
      data-sequence={view.sequence ?? ''}
      role='status'
      aria-live='polite'
      aria-label='Ubuntu Shipping State'
    >
      <div
        className='min-h-40 space-y-3 p-3'
        data-testid='hud-shipper-status-geometry'
      >
        <div className='flex min-h-5 items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <Ship className='h-4 w-4 text-secondary-token' aria-hidden='true' />
            <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
              Delivery
            </p>
          </div>
          <span className='text-2xs font-medium text-secondary-token'>
            {isPending ? 'Unknown' : truthLabel(view)}
          </span>
        </div>
        <ShippingStateBody view={view} />
      </div>
    </ContentSurfaceCard>
  );
}
