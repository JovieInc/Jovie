'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieShippingStateCard.test.tsx
import { Ship } from 'lucide-react';
import { useEffect } from 'react';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { MeasuredValue } from '@/components/molecules/MeasuredValue';
import { computeRatePercent } from '@/lib/analytics/metrics';
import {
  hasKnownMetricText,
  OVIE_METRICS_SYNCING_NOTICE,
  shippingTruthHeaderLabel,
} from '@/lib/ovie/metrics-presentation';
import type {
  CountMeasurement,
  DeliveryLanes,
} from '@/lib/ovie/shipping-state';
import type {
  ShippingMeaningView,
  ShippingStateView,
} from '@/lib/ovie/shipping-state-client';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

type Delivery = ShippingStateView['delivery'];

/** Display name of each delivery source, shown when its metric is unknown. */
const SOURCE_LABEL: Record<string, string> = {
  'lanes-status': 'Lanes feed',
  'lane-pull-requests': 'Lane PRs',
  'github-native-merge-queue': 'Merge queue',
  'github-merges': 'GitHub',
  'exact-sha-ci': 'CI',
  'production-controller': 'Production controller',
  'staging-controller': 'Staging controller',
  'live-build-info': 'Live build',
  'staging-build-info': 'Staging build',
  'summer-runtime': 'Summer runtime',
};

const STALE_STATES = new Set(['stale', 'disconnected', 'degraded']);

/** A metric's reading plus where it comes from; `text` null = no reading. */
function MetricValue({
  view,
  sourceId,
  text,
  stale = false,
  nowMs,
}: Readonly<{
  readonly view: ShippingStateView;
  readonly sourceId: string;
  readonly text: string;
  readonly stale?: boolean;
  readonly nowMs: number;
}>) {
  const evidence = view.sources?.[sourceId] ?? null;
  const lastAt = evidence?.lastSuccessAt
    ? Date.parse(evidence.lastSuccessAt)
    : Number.NaN;
  const ageMs = Number.isFinite(lastAt) ? Math.max(0, nowMs - lastAt) : null;
  const source = SOURCE_LABEL[sourceId] ?? sourceId;
  const isStale =
    stale || (evidence ? STALE_STATES.has(evidence.state) : false);
  return (
    <MeasuredValue
      state={isStale ? 'stale' : 'measured'}
      value={text}
      source={source}
      ageMs={ageMs}
    />
  );
}

function formatCount(count: CountMeasurement): string | null {
  return count.value === null ? null : count.value.toLocaleString('en-US');
}

function formatMeaning(meaning: ShippingMeaningView): string | null {
  if (meaning.value === null) return null;
  return meaning.value ? 'Yes' : 'No';
}

function formatLanes(lanes: Delivery['lanes']): string | null {
  if (lanes.running.value === null || lanes.slots.value === null) return null;
  return `${lanes.running.value}/${lanes.slots.value}`;
}

function formatRepoSplit(byRepo: Delivery['merges']['byRepo']): string | null {
  const parts = [byRepo.Jovie, byRepo.LogYourBody, byRepo['summer-config']];
  const values: string[] = [];
  for (const part of parts) {
    const text = formatCount(part);
    if (text === null) return null;
    values.push(text);
  }
  return values.join(' / ');
}

function formatWeek(merges: Delivery['merges']): string | null {
  const last = merges.last7Days.value;
  const prior = merges.prior7Days.value;
  if (last === null) return null;
  const total = last.toLocaleString('en-US');
  if (prior === null || prior === 0) return total;
  const change = computeRatePercent(last - prior, prior, 0);
  return `${total} (${change >= 0 ? '+' : ''}${change}% WoW)`;
}

function formatProduction(production: Delivery['production']): string | null {
  if (!production.sha) return null;
  const sha = production.sha.slice(0, 7);
  return production.version ? `${production.version} ${sha}` : sha;
}

function formatCertifiedHead(
  certifiedHead: Delivery['certifiedHead']
): string | null {
  return certifiedHead.sha ? certifiedHead.sha.slice(0, 7) : null;
}

function formatProdLag(health: DeliveryLanes['deployHealth']): string | null {
  const lag = health?.lag?.find(row => row.repo === 'JovieInc/Jovie');
  if (!lag || lag.p50Min === null || lag.p95Min === null) return null;
  const target =
    lag.targetP50Min === null || lag.targetP95Min === null
      ? ''
      : ` (target ${lag.targetP50Min} / ${lag.targetP95Min})`;
  return `${Math.round(lag.p50Min)} / ${Math.round(lag.p95Min)} min${target}`;
}

function formatLybDeploy(health: DeliveryLanes['deployHealth']): string | null {
  const lyb = health?.repos.find(repo => repo.repo === 'JovieInc/LogYourBody');
  if (!lyb) return null;
  const behind = lyb.behindMain === null ? null : `${lyb.behindMain} behind`;
  if (lyb.status === 'failing') {
    return [`Failing x${lyb.failedStreak}`, behind].filter(Boolean).join(', ');
  }
  return behind ?? 'Passing';
}

const SUMMER_LABEL = { up: 'Up', down: 'Down', degraded: 'Degraded' } as const;

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
  isPending,
}: Readonly<{
  readonly view: ShippingStateView;
  readonly isPending: boolean;
}>) {
  const freshness =
    view.ageMs === null
      ? null
      : view.ageMs < 60_000
        ? 'Updated just now'
        : view.ageMs < 3_600_000
          ? `Updated ${Math.floor(view.ageMs / 60_000)}m ago`
          : `Updated ${Math.floor(view.ageMs / 3_600_000)}h ago`;
  const { delivery } = view;
  const rows: readonly (readonly [string, string, string | null, boolean?])[] =
    [
      [
        'Lanes Running',
        'lanes-status',
        formatLanes(delivery.lanes),
        delivery.lanes.stale,
      ],
      [
        'Merge Queue',
        'github-native-merge-queue',
        formatCount(delivery.mergeQueueDepth),
      ],
      ['Merged Today', 'github-merges', formatCount(delivery.merges.today)],
      ['In Flight', 'lane-pull-requests', formatCount(delivery.inFlight)],
      [
        'Jovie / LYB / Summer',
        'github-merges',
        formatRepoSplit(delivery.merges.byRepo),
      ],
      ['Merged 7d', 'github-merges', formatWeek(delivery.merges)],
      [
        'Certified HEAD',
        'exact-sha-ci',
        formatCertifiedHead(delivery.certifiedHead),
      ],
      ['Staging', 'staging-build-info', formatProduction(delivery.staging)],
      ['Production', 'live-build-info', formatProduction(delivery.production)],
      [
        'Behind Main',
        'live-build-info',
        formatCount(delivery.production.behindMain),
      ],
      [
        'Merge to Prod',
        'lanes-status',
        formatProdLag(delivery.lanes.deployHealth),
      ],
      [
        'LYB Deploy',
        'lanes-status',
        formatLybDeploy(delivery.lanes.deployHealth),
      ],
      ['CI Green', 'exact-sha-ci', formatMeaning(view.ciGreen)],
      [
        'Summer',
        'summer-runtime',
        delivery.summer.availability
          ? SUMMER_LABEL[delivery.summer.availability]
          : null,
      ],
    ];
  const nowMs = Date.now();
  const measuredRows = rows.filter(
    (row): row is readonly [string, string, string, boolean?] =>
      hasKnownMetricText(row[2])
  );
  const syncingNotice =
    isPending || view.truth === 'unknown' || measuredRows.length < rows.length;

  return (
    <div className='space-y-3' data-testid='hud-shipping-state-body'>
      {syncingNotice ? (
        <p
          className='text-2xs text-tertiary-token'
          data-testid='hud-delivery-metrics-syncing'
        >
          {OVIE_METRICS_SYNCING_NOTICE}
        </p>
      ) : null}
      {measuredRows.length > 0 ? (
        <div
          className='grid gap-3 sm:grid-cols-2'
          data-testid='hud-delivery-metrics'
        >
          {measuredRows.map(([label, sourceId, text, stale]) => (
            <ContentMetricRow
              key={label}
              label={label}
              value={
                <MetricValue
                  view={view}
                  sourceId={sourceId}
                  text={text}
                  stale={stale}
                  nowMs={nowMs}
                />
              }
            />
          ))}
        </div>
      ) : null}
      {freshness ? (
        <p className='text-2xs text-tertiary-token' data-testid='hud-freshness'>
          {freshness}
        </p>
      ) : null}
    </div>
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
      data-flags={[...view.flags].join(',')}
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
          <span
            className='text-2xs font-medium tabular-nums text-secondary-token'
            data-testid='hud-shipping-truth'
          >
            {shippingTruthHeaderLabel(view, isPending)}
          </span>
        </div>
        <ShippingStateBody view={view} isPending={isPending} />
      </div>
    </ContentSurfaceCard>
  );
}
