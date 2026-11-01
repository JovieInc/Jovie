'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieShippingStateCard.test.tsx
import { Ship } from 'lucide-react';
import { useEffect } from 'react';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { MeasuredValue } from '@/components/molecules/MeasuredValue';
import { computeRatePercent } from '@/lib/analytics/metrics';
import { redactFilesystemPaths } from '@/lib/ovie/home/operator-copy';
import type {
  CapacityHorizonLease,
  CountMeasurement,
  DeliveryLanes,
} from '@/lib/ovie/shipping-state';
import type {
  ShippingFlag,
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

const FLAG_LABEL: Record<ShippingFlag, string> = {
  replay: 'Replay ignored',
  duplicate: 'Duplicate ignored',
  contradictory: 'Contradictory sequence ignored',
  sequenceGap: 'Sequence gap',
  partial: 'Partial source',
  unsupportedSchema: 'Unsupported schema',
  cacheExpired: 'Cache expired',
  clockUncertain: 'Clock uncertain',
};

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
  readonly text: string | null;
  readonly stale?: boolean;
  readonly nowMs: number;
}>) {
  const evidence = view.sources?.[sourceId] ?? null;
  const lastAt = evidence?.lastSuccessAt
    ? Date.parse(evidence.lastSuccessAt)
    : Number.NaN;
  const ageMs = Number.isFinite(lastAt) ? Math.max(0, nowMs - lastAt) : null;
  const source = SOURCE_LABEL[sourceId] ?? sourceId;
  if (text === null) {
    let reason = 'syncing';
    if (evidence) reason = evidence.code ?? evidence.state;
    else if (view.sources) reason = 'not reported';
    return (
      <MeasuredValue
        state='unknown'
        source={source}
        reason={reason}
        ageMs={ageMs}
      />
    );
  }
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
  if (parts.every(part => part.value === null)) return null;
  return parts.map(part => formatCount(part) ?? 'unknown').join(' / ');
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

function formatAge(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'source gap';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function CapacityLeaseRow({ row }: { readonly row: CapacityHorizonLease }) {
  const work = row.route?.selectedJob ?? 'selection source gap';
  const reason = row.route?.reason ?? row.forecast.bottleneck ?? 'no blocker';
  const href = row.route?.selectedJob
    ? `https://linear.app/jovie/issue/${row.route.selectedJob}`
    : null;
  return (
    <div className='border-t border-subtle py-2 first:border-t-0'>
      <p className='text-2xs font-medium text-primary-token'>
        {row.alias} · {row.available ? 'usable' : 'inaccessible'} ·{' '}
        {row.subscriptionStatus} · {row.usableRemaining ?? '?'}% ·{' '}
        {row.bankedCount ?? '?'} banked · {row.event.label}{' '}
        {formatDuration(row.event.countdownSeconds)} · {row.mode}
      </p>
      <p className='mt-0.5 text-2xs text-secondary-token'>
        drain p50 {row.forecast.completionP50At ?? 'source gap'} @{' '}
        {row.forecast.sustainablePercentPerHour ?? '?'}%/h · unused{' '}
        {row.forecast.projectedUnused ?? '?'}% · coverage{' '}
        {row.forecast.qualifiedWork.length} · {row.concurrency ?? '?'}{' '}
        concurrency ·{' '}
        {row.compatibility.cli
          ? row.compatibility.cli.split(/[\\/]/).at(-1)
          : '?'}
        +{row.compatibility.harness ?? '?'} · {row.freshness.status}
      </p>
      {/* axe nested-interactive (WCAG 4.1.2): <summary> is itself a native
          toggle control, so the Linear link must sit outside it rather than
          nested inside — it's a sibling here instead, and the disclosure
          only wraps the plain-text reason. A <div> wrapper (not <p>) because
          <details> is block content a <p> cannot validly contain. */}
      <div className='mt-0.5 text-2xs text-tertiary-token'>
        {href ? (
          <a
            className='text-accent-blue hover:underline'
            href={href}
            target='_blank'
            rel='noreferrer'
          >
            {work}
          </a>
        ) : (
          work
        )}{' '}
        ·{' '}
        <details className='inline'>
          {/* list-none (via `inline`) drops the default disclosure
              triangle, so a text marker replaces it as the toggle
              affordance. */}
          <summary className='inline cursor-pointer list-none' title={reason}>
            <span aria-hidden='true'>▸</span> {reason}
          </summary>
          <p>
            alternatives{' '}
            {row.route?.alternativesConsidered.join(', ') || 'none recorded'} ·
            replan {row.route?.replanConditions.join(', ') || 'source gap'} ·
            gaps {row.route?.sourceGaps.join(', ') || 'none'}
          </p>
        </details>
      </div>
    </div>
  );
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
  const flagLine = [...view.flags].map(flag => FLAG_LABEL[flag]).join(' · ');
  const stateDetail = [view.lastError, flagLine].filter(Boolean).join(' · ');
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
  const lanesDetail = lanesLine(delivery.lanes);

  return (
    <>
      <div
        className='grid gap-2 sm:grid-cols-2'
        data-testid='hud-delivery-metrics'
      >
        {rows.map(([label, sourceId, text, stale]) => (
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
      <p
        className='min-h-4 truncate text-2xs leading-4 text-secondary-token'
        title={lanesDetail || undefined}
      >
        {lanesDetail || 'Lanes feed not measured'}
      </p>
      {delivery.lanes.capacity ? (
        <div
          className='rounded-lg border border-subtle px-3'
          data-testid='capacity-horizon'
        >
          <div className='flex items-center justify-between py-2 text-2xs text-secondary-token'>
            <span>Capacity horizon</span>
            <span>
              {delivery.lanes.capacity.incidents.length} incident · show-only
            </span>
          </div>
          <p className='border-t border-subtle py-2 text-2xs text-secondary-token'>
            {delivery.lanes.capacity.outcomes.useful} useful ·{' '}
            {delivery.lanes.capacity.outcomes.certified} certified ·{' '}
            {delivery.lanes.capacity.outcomes.duplicate} duplicate ·{' '}
            {delivery.lanes.capacity.outcomes.retry} retry ·{' '}
            {delivery.lanes.capacity.outcomes.failed} failed ·{' '}
            {delivery.lanes.capacity.outcomes.unknown} unknown
          </p>
          {delivery.lanes.capacity.leases.map(row => (
            <CapacityLeaseRow key={row.leaseId} row={row} />
          ))}
          <p className='border-t border-subtle py-2 text-2xs text-tertiary-token'>
            Top blocker: {delivery.lanes.capacity.topBlocker ?? 'none'}
          </p>
        </div>
      ) : (
        <p className='min-h-4 text-2xs leading-4 text-tertiary-token'>
          Capacity source gap
        </p>
      )}
      <p className='min-h-4 truncate text-2xs leading-4 text-secondary-token'>
        {delivery.lanes.alerts.map(redactFilesystemPaths).join(' · ')}
      </p>
      <p
        className='min-h-4 break-words text-2xs leading-4 text-tertiary-token'
        title={fullSourceLine || undefined}
      >
        {sourceLine || 'No successful source yet'}
      </p>
      <p
        className='min-h-5 truncate text-app leading-5 text-secondary-token'
        data-testid='hud-shipping-state-detail'
        title={stateDetail || undefined}
      >
        {view.lastError ? <span>{view.lastError}</span> : null}
        {view.lastError && flagLine ? ' · ' : null}
        {flagLine ? <span>{flagLine}</span> : null}
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
          <span className='text-2xs font-medium text-secondary-token'>
            {isPending ? 'Unknown' : truthLabel(view)}
          </span>
        </div>
        <ShippingStateBody view={view} />
      </div>
    </ContentSurfaceCard>
  );
}
