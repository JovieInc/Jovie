'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieShippingStateCard.test.tsx
import { Ship } from 'lucide-react';
import { useEffect } from 'react';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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

function formatCount(count: ShippingStateView['queued']): string {
  return count.value === null ? '\u2014' : count.value.toLocaleString('en-US');
}

function formatMeaning(meaning: ShippingMeaningView): string {
  if (meaning.value === null) return '\u2014';
  return meaning.value ? 'Yes' : 'No';
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
  const rows = [
    ['Queued', formatCount(view.queued)],
    ['In Flight', formatCount(view.inFlight)],
    ['Merged', formatMeaning(view.merged)],
    ['CI Green', formatMeaning(view.ciGreen)],
    ['Production Verified', formatMeaning(view.productionVerified)],
    ['Exact Live Build', formatMeaning(view.exactLiveBuild)],
  ] as const;

  return (
    <>
      <div className='grid min-h-28 gap-2 sm:grid-cols-2'>
        {rows.map(([label, value]) => (
          <ContentMetricRow key={label} label={label} value={value} />
        ))}
      </div>
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
      className='min-h-40 space-y-3 p-3'
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
    </ContentSurfaceCard>
  );
}
