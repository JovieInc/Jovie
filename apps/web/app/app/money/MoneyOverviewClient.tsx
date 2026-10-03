'use client';

import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { EmptyState } from '@/components/molecules/EmptyState';
import type { MoneyMetric, MoneyOverview } from '@/lib/finance/metrics';
import { Money } from '@/lib/workspace-lock/money-visibility';
import { MoneyTrendChart } from './MoneyTrendChart';

const currency = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
});

function formatValue(metric: MoneyMetric): string {
  if (metric.value === null) return '—';
  if (metric.unit === 'days') {
    return `${Math.round(metric.value)} days`;
  }
  return currency.format(metric.value);
}

function formatSigned(metric: MoneyMetric, value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const abs =
    metric.unit === 'days'
      ? `${Math.round(Math.abs(value))} days`
      : currency.format(Math.abs(value));
  return `${sign}${abs}`;
}

const TARGET_LABEL: Record<MoneyMetric['target'], string | null> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'no-target': null,
  unknown: null,
};

function MetricCard({
  metric,
  reconciledAt,
}: {
  readonly metric: MoneyMetric;
  readonly reconciledAt: string | null;
}) {
  const favorableClass =
    metric.favorable === null
      ? 'text-tertiary-token'
      : metric.favorable
        ? 'text-success'
        : 'text-error';
  const arrow =
    metric.deltaAbs === null || metric.deltaAbs === 0
      ? null
      : metric.deltaAbs > 0
        ? '▲'
        : '▼';
  const targetLabel = TARGET_LABEL[metric.target];

  return (
    <ContentSurfaceCard
      surface='nested'
      data-testid={`money-metric-${metric.id}`}
    >
      <div className='p-4'>
        <div className='flex items-start justify-between gap-2'>
          <p className='text-xs font-medium text-secondary-token'>
            {metric.label}
          </p>
          {targetLabel && (
            <span
              className={`rounded px-1.5 py-0.5 text-2xs font-medium ${
                metric.target === 'at-risk'
                  ? 'bg-error/10 text-error'
                  : 'bg-success/10 text-success'
              }`}
            >
              {targetLabel}
            </span>
          )}
        </div>
        <p className='mt-2 text-2xl font-semibold tracking-tight text-primary-token'>
          <Money>{formatValue(metric)}</Money>
        </p>
        <p className={`mt-1 min-h-5 text-xs ${favorableClass}`}>
          {metric.deltaAbs !== null ? (
            <>
              <span aria-hidden>{arrow} </span>
              <span className='sr-only'>
                {metric.favorable === null
                  ? 'No change: '
                  : metric.favorable
                    ? 'Favorable change: '
                    : 'Unfavorable change: '}
              </span>
              {formatSigned(metric, metric.deltaAbs)}
              {metric.deltaPct !== null &&
                ` (${metric.deltaPct >= 0 ? '+' : ''}${metric.deltaPct.toFixed(1)}%)`}
              {metric.comparisonDays !== null &&
                ` vs prior ${metric.comparisonDays} days`}
            </>
          ) : (
            'No prior comparison'
          )}
        </p>
        <details className='mt-2 text-2xs text-tertiary-token'>
          <summary className='cursor-pointer select-none'>
            Details
            {metric.confidence !== 'high' && (
              <span className='ml-1 text-warning'>
                · {metric.confidence} confidence
              </span>
            )}
          </summary>
          <dl className='mt-1 space-y-0.5'>
            <div className='flex justify-between'>
              <dt>Direction</dt>
              <dd>
                {metric.desiredDirection === 'up'
                  ? 'Higher is better'
                  : 'Lower is better'}
              </dd>
            </div>
            <div className='flex justify-between'>
              <dt>Confidence</dt>
              <dd>{metric.confidence}</dd>
            </div>
            <div className='flex justify-between'>
              <dt>Reconciled</dt>
              <dd>{reconciledAt ?? 'Never'}</dd>
            </div>
          </dl>
        </details>
      </div>
    </ContentSurfaceCard>
  );
}

function ScopeSection({
  title,
  metrics,
  reconciledAt,
  note,
}: {
  readonly title: string;
  readonly metrics: MoneyMetric[];
  readonly reconciledAt: string | null;
  readonly note?: string;
}) {
  return (
    <section aria-label={title} className='mt-6'>
      <h2 className='line-clamp-2 text-sm font-semibold text-secondary-token'>
        {title}
      </h2>
      {note && <p className='mt-0.5 text-xs text-tertiary-token'>{note}</p>}
      <div className='mt-2 grid gap-3 sm:grid-cols-3'>
        {metrics.map(m => (
          <MetricCard key={m.id} metric={m} reconciledAt={reconciledAt} />
        ))}
      </div>
    </section>
  );
}

export function MoneyOverviewClient({
  overview,
}: {
  readonly overview: MoneyOverview | null;
}) {
  if (!overview) {
    return (
      <EmptyState
        variant='error'
        heading='Money could not be loaded.'
        description='Nothing was exposed. Try again in a moment.'
        testId='money-error'
      />
    );
  }

  const o = overview;

  if (o.state === 'no-connections') {
    return (
      <EmptyState
        heading={o.conclusion.headline}
        description={o.conclusion.detail}
        testId='money-empty'
      />
    );
  }

  const bannerTone =
    o.conclusion.tone === 'positive'
      ? 'border-success/30 bg-success/5'
      : o.conclusion.tone === 'negative'
        ? 'border-error/30 bg-error/5'
        : 'border-subtle bg-surface-1';
  const nextAction =
    o.state === 'provider-error'
      ? 'Reconnect the failing institution.'
      : o.state === 'syncing'
        ? 'Wait for the initial sync to finish.'
        : o.reviewCount > 0
          ? `Review ${o.reviewCount} unclassified transaction${o.reviewCount === 1 ? '' : 's'}.`
          : o.anomalies.includes('stale-data')
            ? 'Refresh your connections — data is stale.'
            : null;

  return (
    <div data-testid='money-overview'>
      <header>
        <h1 className='line-clamp-2 text-xl font-semibold text-primary-token'>
          Money
        </h1>
        <p className='mt-1 text-xs text-tertiary-token'>
          Private to you · Last reconciled {o.reconciledAt ?? 'never'}
          {o.counts.excludedAccounts > 0 &&
            ` · ${o.counts.excludedAccounts} account${o.counts.excludedAccounts === 1 ? '' : 's'} excluded`}
        </p>
      </header>

      <div
        className={`mt-4 rounded-lg border p-4 ${bannerTone}`}
        role='status'
        data-testid='money-conclusion'
      >
        <p className='text-base font-semibold text-primary-token'>
          {o.conclusion.headline}
        </p>
        <p className='mt-1 text-sm text-secondary-token'>
          {o.conclusion.detail}
        </p>
        {nextAction && (
          <p className='mt-2 text-xs font-medium text-secondary-token'>
            Next: {nextAction}
          </p>
        )}
      </div>

      {o.anomalies.length > 0 && (
        <ul
          className='mt-3 space-y-1 text-xs text-warning'
          data-testid='money-anomalies'
        >
          {o.anomalies.includes('stale-data') && (
            <li>Data is stale — transactions have not synced recently.</li>
          )}
          {o.anomalies.includes('missing-balance') && (
            <li>Some accounts are missing a balance.</li>
          )}
          {o.anomalies.includes('reconciliation-gap') && (
            <li>New transactions arrived after the last balance update.</li>
          )}
        </ul>
      )}

      <section aria-label='Combined' className='mt-6'>
        <h2 className='line-clamp-2 text-sm font-semibold text-secondary-token'>
          Sustainability
        </h2>
        <div className='mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
          {o.cards.map(m => (
            <MetricCard key={m.id} metric={m} reconciledAt={o.reconciledAt} />
          ))}
        </div>
      </section>

      <ScopeSection
        title='Personal'
        metrics={[o.personal.income, o.personal.expenses, o.personal.net]}
        reconciledAt={o.reconciledAt}
      />
      <ScopeSection
        title='Creator'
        metrics={[o.creator.income, o.creator.expenses, o.creator.net]}
        reconciledAt={o.reconciledAt}
        note={
          o.creator.hasIncome
            ? undefined
            : 'No creator income recorded yet in this window.'
        }
      />

      <section aria-label='Trend' className='mt-6'>
        <h2 className='line-clamp-2 text-sm font-semibold text-secondary-token'>
          Trend
        </h2>
        {o.trend.length > 1 ? (
          <MoneyTrendChart points={o.trend} />
        ) : (
          <p className='mt-2 text-sm text-tertiary-token'>
            Not enough history to plot yet.
          </p>
        )}
      </section>

      {o.reviewCount > 0 && (
        <p
          className='mt-4 text-xs text-secondary-token'
          data-testid='money-review'
        >
          {o.reviewCount} transaction{o.reviewCount === 1 ? '' : 's'} awaiting
          classification review — totals above already include them.
        </p>
      )}
    </div>
  );
}
