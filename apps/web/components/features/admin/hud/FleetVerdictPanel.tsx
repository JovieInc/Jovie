'use client';

import { useQuery } from '@tanstack/react-query';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { type FleetVerdict, fleetVerdict } from '@/lib/ovie/home/fleet-verdict';
import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { shippingStateQueryOptions } from '@/lib/queries/shipping-state';

const LEVEL_TONE = {
  healthy: 'good',
  degraded: 'warning',
  down: 'bad',
  unknown: 'neutral',
} as const;

const LEVEL_LABEL = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Not reporting',
  unknown: 'Not measured',
} as const;

function reasonCounts(lanes: DeliveryLanes): readonly [string, number][] {
  return [
    ...Object.entries(lanes.heldByReason),
    ...Object.entries(lanes.failedByReason).map(
      ([reason, n]) => [`failed: ${reason}`, n] as [string, number]
    ),
  ].sort((a, b) => b[1] - a[1]);
}

/** Presentational: one verdict, every reason behind it, the lane roster. */
export function FleetVerdictPanelView({
  verdict,
  lanes,
}: Readonly<{ verdict: FleetVerdict; lanes: DeliveryLanes | null }>) {
  const counts = lanes ? reasonCounts(lanes) : [];
  return (
    <ContentSurfaceCard surface='details' data-testid='fleet-verdict-panel'>
      <div className='flex flex-col gap-3 p-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
            Fleet health
          </p>
          <HudStatusPill
            label={LEVEL_LABEL[verdict.level]}
            tone={LEVEL_TONE[verdict.level]}
          />
          {verdict.capacity ? (
            <span className='text-2xs text-secondary-token'>
              {verdict.capacity}
            </span>
          ) : null}
        </div>
        <p className='text-app font-semibold text-primary-token'>
          {verdict.headline}
        </p>
        {verdict.reasons.length > 0 ? (
          <ul className='flex flex-col gap-1 text-2xs text-secondary-token'>
            {verdict.reasons.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {counts.length > 0 ? (
          <dl className='flex flex-col gap-1 text-2xs'>
            {counts.map(([reason, n]) => (
              <div key={reason} className='flex justify-between gap-4'>
                <dt className='min-w-0 text-secondary-token'>{reason}</dt>
                <dd className='tabular-nums text-primary-token'>{n}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

export function FleetVerdictPanel() {
  const query = useQuery(shippingStateQueryOptions);
  const lanes = query.data?.delivery?.lanes ?? null;
  if (query.isPending) {
    return (
      <ContentSurfaceCard surface='details' data-testid='fleet-verdict-panel'>
        <p className='p-3 text-2xs text-secondary-token'>
          Loading fleet health…
        </p>
      </ContentSurfaceCard>
    );
  }
  if (!lanes) {
    return (
      <FleetVerdictPanelView
        verdict={{
          level: 'unknown',
          headline: query.isError
            ? 'Fleet health unavailable: the shipping read failed. Refresh to retry.'
            : 'Fleet health not measured',
          reasons: [],
          capacity: null,
        }}
        lanes={null}
      />
    );
  }
  return <FleetVerdictPanelView verdict={fleetVerdict(lanes)} lanes={lanes} />;
}
