import Link from 'next/link';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';
import type {
  AccountView,
  CapacityAlert,
  CapacityView,
  ProviderView,
} from '../../../../../../scripts/lib/capacity-registry.mjs';
import {
  CREDIT_COPY,
  FRESHNESS_TONE,
  formatAge,
  formatPercent,
  formatUntil,
  formatUsd,
  PACE_COPY,
  type Tone,
  USAGE_MODEL_LABEL,
} from './capacity-format';

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-error',
  neutral: 'text-tertiary-token',
};

function Dot({ tone }: Readonly<{ tone: Tone }>) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'inline-block h-2 w-2 rounded-full bg-current',
        TONE_TEXT[tone]
      )}
    />
  );
}

function Stat({
  label,
  value,
  hint,
}: Readonly<{ label: string; value: string; hint?: string }>) {
  return (
    <div className='min-w-0'>
      <p className='text-2xs text-tertiary-token'>{label}</p>
      <p className='break-words text-lg font-semibold tabular-nums text-primary-token'>
        {value}
      </p>
      {hint ? <p className='text-2xs text-tertiary-token'>{hint}</p> : null}
    </div>
  );
}

/** Used share of the window as the bar; the tick is how much of the window has elapsed (pace). */
function Meter({
  usedPercent,
  elapsedPercent,
  tone,
  label,
}: Readonly<{
  usedPercent: number | null;
  elapsedPercent: number | null;
  tone: Tone;
  label: string;
}>) {
  const used =
    usedPercent === null ? 0 : Math.min(100, Math.max(0, usedPercent));
  return (
    <div
      role='img'
      aria-label={label}
      className='relative h-2.5 w-full overflow-hidden rounded-full bg-surface-1'
    >
      <div
        className={cn('h-full bg-current', TONE_TEXT[tone])}
        style={{ width: `${used}%` }}
      />
      {elapsedPercent === null ? null : (
        <div
          className='absolute inset-y-0 w-0.5 bg-primary-token'
          style={{ left: `${Math.min(100, Math.max(0, elapsedPercent))}%` }}
        />
      )}
    </div>
  );
}

function Freshness({
  freshness,
  live,
  ageHours,
  source,
}: Readonly<{
  freshness: 'fresh' | 'stale' | 'unknown';
  live: boolean;
  ageHours: number | null;
  source: string;
}>) {
  const tone = FRESHNESS_TONE[freshness];
  return (
    <p className='flex items-center gap-1.5 text-2xs text-tertiary-token'>
      <Dot tone={tone} />
      <span className={TONE_TEXT[tone]}>
        {freshness === 'stale'
          ? 'Stale'
          : freshness === 'unknown'
            ? 'Unread'
            : live
              ? 'Live'
              : 'Fresh'}
      </span>
      <span>read {formatAge(ageHours)}</span>
      <span className='truncate'>· {source}</span>
    </p>
  );
}

function AccountCard({
  account,
  now,
}: Readonly<{ account: AccountView; now: number }>) {
  const { plan, quota, credits } = account;
  const inactive = account.status !== 'active';
  // A lapsed or disabled account is not routable: no pace advice, only the facts.
  const pace = quota && !inactive ? PACE_COPY[quota.verdict] : null;
  const creditCopy = credits ? CREDIT_COPY[credits.verdict] : null;
  return (
    <ContentSurfaceCard
      surface='details'
      data-testid={`capacity-account-${account.id}`}
    >
      <div className='space-y-4 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='min-w-0'>
            <p className='truncate text-app font-semibold text-primary-token'>
              {account.id}
              {account.aliases.length > 0 ? (
                <span className='ml-2 text-2xs font-normal text-tertiary-token'>
                  aka {account.aliases.join(', ')}
                </span>
              ) : null}
            </p>
            <p className='text-2xs text-tertiary-token'>
              {account.emailSha256
                ? `email hash ${account.emailSha256}`
                : 'no identity hash'}
              {account.seats
                ? ` · ${account.seats} ${account.seats === 1 ? 'seat' : 'seats'}`
                : ''}
            </p>
          </div>
          {inactive ? (
            <span className='rounded-full border border-subtle px-2 py-0.5 text-2xs uppercase text-warning'>
              {account.status}
            </span>
          ) : null}
        </div>

        <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
          <Stat
            label='Plan'
            value={plan?.name ?? 'Unknown'}
            hint={plan?.tier ?? undefined}
          />
          <Stat
            label='Cost Per Month'
            value={formatUsd(plan?.effectiveUsdMonthly)}
            hint={
              plan?.promoActive
                ? `list ${formatUsd(plan.listUsdMonthly)}, promo ends ${plan.promoUntil?.slice(0, 10)} (${Math.round(plan.promoDaysLeft ?? 0)}d)`
                : plan?.billing === 'yearly' && plan.usdYearly !== null
                  ? `${formatUsd(plan.usdYearly)} billed yearly`
                  : plan?.listUsdMonthly !== null &&
                      plan?.listUsdMonthly !== undefined
                    ? `list ${formatUsd(plan.listUsdMonthly)}`
                    : undefined
            }
          />
          {quota ? (
            <>
              <Stat
                label='Remaining'
                value={formatPercent(quota.remainingPercent)}
                hint={`${quota.cadence ?? 'window'} quota`}
              />
              <Stat
                label='Resets'
                value={formatUntil(quota.resetsAt, now)}
                hint={quota.resetsAt?.slice(0, 16).replace('T', ' ')}
              />
            </>
          ) : null}
          {credits ? (
            <>
              <Stat
                label='Credits Left'
                value={formatUsd(credits.balanceUsd)}
              />
              <Stat
                label='Expires'
                value={formatUntil(credits.expiresAt, now)}
                hint={credits.expiresAt?.slice(0, 10)}
              />
            </>
          ) : null}
        </div>

        {quota ? (
          <div className='space-y-2' data-testid='capacity-quota'>
            <Meter
              usedPercent={quota.usedPercent}
              elapsedPercent={quota.elapsedPercent}
              tone={pace?.tone ?? 'neutral'}
              label={`${formatPercent(quota.usedPercent)} used, ${formatPercent(quota.elapsedPercent)} of the window elapsed`}
            />
            <div className='flex flex-wrap justify-between gap-2 text-2xs text-tertiary-token'>
              <span>Used {formatPercent(quota.usedPercent)}</span>
              <span>
                Window elapsed {formatPercent(quota.elapsedPercent)} (tick)
              </span>
            </div>
            {pace ? (
              <p className={cn('text-app font-medium', TONE_TEXT[pace.tone])}>
                {pace.text(quota.paceDeltaPercent)}
              </p>
            ) : (
              <p className='text-app text-secondary-token'>
                {inactive ? `${account.status}: not routable` : 'No pace'}
              </p>
            )}
            <Freshness {...quota} />
            {quota.note ? (
              <p className='text-2xs text-tertiary-token'>{quota.note}</p>
            ) : null}
          </div>
        ) : null}

        {credits ? (
          <div className='space-y-2' data-testid='capacity-credits'>
            <div className='grid grid-cols-3 gap-4'>
              <Stat
                label='Burn Per Day'
                value={formatUsd(credits.burnPerDayUsd)}
              />
              <Stat
                label='Needed Per Day'
                value={formatUsd(credits.requiredPerDayUsd)}
                hint='to use it by expiry'
              />
              <Stat
                label='Runway'
                value={
                  credits.runwayDays === null
                    ? 'Unknown'
                    : `${Math.round(credits.runwayDays)}d`
                }
                hint={
                  credits.daysLeft === null
                    ? undefined
                    : `${Math.round(credits.daysLeft)}d to expiry`
                }
              />
            </div>
            {creditCopy ? (
              <p
                className={cn(
                  'text-app font-medium',
                  TONE_TEXT[creditCopy.tone]
                )}
              >
                {creditCopy.text}
              </p>
            ) : null}
            <Freshness {...credits} />
          </div>
        ) : null}

        {!quota && !credits ? (
          <p className='text-app text-secondary-token'>
            No quota or balance recorded for this account.
          </p>
        ) : null}
        {plan ? (
          <p className='text-2xs text-tertiary-token'>
            Plan source: {plan.source} (as of {plan.asOf})
          </p>
        ) : null}
        {account.notes ? (
          <p className='text-2xs text-tertiary-token'>{account.notes}</p>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

function LimitsList({ limits }: Readonly<{ limits: Record<string, unknown> }>) {
  const entries = Object.entries(limits).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string'
  );
  if (entries.length === 0) return null;
  return (
    <dl className='flex flex-wrap gap-x-6 gap-y-1 text-2xs text-tertiary-token'>
      {entries.map(([key, value]) => (
        <div key={key} className='flex gap-1.5'>
          <dt>{key}</dt>
          <dd className='font-medium tabular-nums text-secondary-token'>
            {String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ValueCard({
  provider,
  meta,
}: Readonly<{
  provider: ProviderView;
  meta: CapacityView['metricsMeta'];
}>) {
  const metrics = provider.metrics;
  let body: string;
  if (!meta) {
    body = 'Not measured here: needs the live overlay from the lanes host.';
  } else if (meta.incomplete) {
    body = `Merge window unreadable (${meta.incomplete}); no counts are shown rather than partial ones.`;
  } else if (!metrics) {
    body = 'No lane runs recorded for this provider.';
  } else if (metrics.mergedCreated === 0) {
    body = `No lane-receipted merges in ${metrics.windowDays} days (${metrics.runs} runs). Work started outside the lanes, such as agent threads, is not in lane receipts.`;
  } else {
    body = `${metrics.mergedCreated} merged PRs created, ${metrics.mergedRepaired} repaired, in ${metrics.windowDays} days.`;
  }
  return (
    <ContentSurfaceCard surface='details' data-testid='capacity-value'>
      <div className='space-y-3 p-4'>
        <p className='text-xs font-caption text-tertiary-token'>
          Value (lane receipts and merged PRs)
        </p>
        {metrics && meta && !meta.incomplete ? (
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
            <Stat
              label='Merged Created'
              value={String(metrics.mergedCreated)}
            />
            <Stat
              label='Merged Repaired'
              value={String(metrics.mergedRepaired)}
            />
            <Stat
              label='Cost In Window'
              value={formatUsd(metrics.costUsd)}
              hint={metrics.costBasis}
            />
            <Stat
              label='Cost Per Merge'
              value={formatUsd(metrics.costPerMergedUsd)}
              hint={
                metrics.costPerMergedUsd === null
                  ? 'no merges to divide by'
                  : 'created PRs'
              }
            />
          </div>
        ) : null}
        <p className='text-app text-secondary-token'>{body}</p>
      </div>
    </ContentSurfaceCard>
  );
}

function AlertBanner({
  alerts,
}: Readonly<{ alerts: readonly CapacityAlert[] }>) {
  if (alerts.length === 0) return null;
  return (
    <ul className='space-y-2' data-testid='capacity-alerts'>
      {alerts.map(alert => (
        <li
          key={alert.id}
          role={alert.severity === 'alarm' ? 'alert' : undefined}
          className={cn(
            'rounded-lg border border-subtle bg-surface-0 p-3 text-app',
            alert.severity === 'alarm' ? 'text-error' : 'text-secondary-token'
          )}
        >
          <span className='mr-2 text-2xs font-semibold uppercase'>
            {alert.severity === 'alarm' ? 'Alarm' : 'Note'}
          </span>
          {alert.message}
        </li>
      ))}
    </ul>
  );
}

function ProviderScreen({
  provider,
  now,
  meta,
}: Readonly<{
  provider: ProviderView;
  now: number;
  meta: CapacityView['metricsMeta'];
}>) {
  return (
    <section
      className='space-y-4'
      data-testid={`capacity-provider-${provider.id}`}
    >
      <ContentSurfaceCard surface='details'>
        <div className='space-y-3 p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='text-lg font-semibold text-primary-token'>
              {provider.label}
            </h2>
            <span className='rounded-full border border-subtle px-2 py-0.5 text-2xs text-secondary-token'>
              {USAGE_MODEL_LABEL[provider.usageModel] ?? provider.usageModel}
            </span>
          </div>
          <div>
            <p className='text-2xs text-tertiary-token'>
              Policy: {provider.policy.id}
            </p>
            <p className='text-app text-primary-token'>
              {provider.policy.rule}
            </p>
            {provider.policy.delegation ? (
              <p className='mt-1 text-app text-secondary-token'>
                Delegation: {provider.policy.delegation}
              </p>
            ) : null}
          </div>
          <LimitsList limits={provider.limits} />
          <p className='text-2xs text-tertiary-token'>
            Agents: {provider.agents.join(', ') || 'none'}
            {provider.joinedSpend.length > 0
              ? ` · spend rows: ${provider.joinedSpend.map(s => s.id).join(', ')}`
              : ''}
          </p>
          {provider.decision ? (
            <p className='rounded-md border border-subtle bg-surface-0 p-2 text-app text-secondary-token'>
              Decision pending ({provider.decision.decideBy}):{' '}
              {provider.decision.option}. {provider.decision.rule}
            </p>
          ) : null}
        </div>
      </ContentSurfaceCard>
      {provider.lane ? <ValueCard provider={provider} meta={meta} /> : null}
      <div className='grid gap-4 lg:grid-cols-2'>
        {provider.accounts.map(account => (
          <AccountCard key={account.id} account={account} now={now} />
        ))}
      </div>
    </section>
  );
}

function providerHeadline(provider: ProviderView): string {
  const first =
    provider.accounts.find(a => a.status === 'active') ?? provider.accounts[0];
  if (first?.quota && first.quota.remainingPercent !== null) {
    return provider.accounts.length > 1
      ? provider.accounts
          .filter(a => a.quota && a.status === 'active')
          .map(a => formatPercent(a.quota?.remainingPercent))
          .join(' / ')
      : `${formatPercent(first.quota.remainingPercent)} left`;
  }
  if (first?.credits) return `${formatUsd(first.credits.balanceUsd)} left`;
  return USAGE_MODEL_LABEL[provider.usageModel] ?? provider.usageModel;
}

export function CapacityBoard({
  view,
  order,
  selectedId,
  basePath,
  now,
  registryUpdatedAt,
  liveOverlay,
}: Readonly<{
  view: CapacityView;
  order: readonly { id: string; rank: number }[];
  selectedId: string | null;
  basePath: string;
  now: number;
  registryUpdatedAt: string;
  liveOverlay: 'applied' | 'none';
}>) {
  const selected =
    view.providers.find(p => p.id === selectedId) ?? view.providers[0];
  const stale = view.providers.filter(p => p.freshness !== 'fresh');
  return (
    <div className='space-y-4' data-testid='capacity-board'>
      <AlertBanner alerts={view.alerts} />
      <ContentSurfaceCard surface='details'>
        <div className='grid grid-cols-2 gap-4 p-4 sm:grid-cols-4'>
          <Stat
            label='Plan Spend Per Month'
            value={formatUsd(view.totals.monthlyUsd)}
            hint='active accounts, effective price'
          />
          <Stat label='Providers' value={String(view.providers.length)} />
          <Stat
            label='Needs A Fresh Read'
            value={String(stale.length)}
            hint={
              stale.length > 0 ? stale.map(p => p.id).join(', ') : 'all fresh'
            }
          />
          <Stat
            label='Source'
            value={
              liveOverlay === 'applied' ? 'Live overlay' : 'Registry snapshot'
            }
            hint={`registry updated ${registryUpdatedAt.slice(0, 10)}`}
          />
        </div>
      </ContentSurfaceCard>

      <nav aria-label='Providers' className='flex flex-wrap gap-2'>
        {view.providers.map(provider => {
          const active = provider.id === selected?.id;
          return (
            <Link
              key={provider.id}
              href={`${basePath}?provider=${provider.id}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-primary-token bg-surface-1'
                  : 'border-subtle bg-surface-0 hover:bg-surface-1'
              )}
            >
              <Dot tone={FRESHNESS_TONE[provider.freshness]} />
              <span className='min-w-0'>
                <span className='block truncate text-app font-medium text-primary-token'>
                  {provider.label}
                </span>
                <span className='block truncate text-2xs text-tertiary-token'>
                  {providerHeadline(provider)}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      {selected ? (
        <ProviderScreen provider={selected} now={now} meta={view.metricsMeta} />
      ) : null}

      <ContentSurfaceCard surface='details'>
        <div className='space-y-2 p-4'>
          <p className='text-xs font-caption text-tertiary-token'>
            Delegation order for agents (uncapped own model, then capped quota
            under pace, then the shared pool, then credits)
          </p>
          <ol className='flex flex-wrap gap-x-4 gap-y-1 text-app text-secondary-token'>
            {order.map((row, index) => (
              <li key={row.id} className='tabular-nums'>
                {index + 1}. {row.id}
              </li>
            ))}
          </ol>
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
