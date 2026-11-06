'use client';

import { Button, Input } from '@jovie/ui';
import { type FormEvent, useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type {
  FleetAuditCorrelation,
  FleetAuditEvent,
  FleetAuditResult,
  FleetAuditSummary,
  FleetAuditWho,
} from '@/lib/ovie/fleet-audit';
import { cn } from '@/lib/utils';

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ok'; readonly who: FleetAuditWho };

function EventRows({
  events,
}: Readonly<{ events: readonly FleetAuditEvent[] }>) {
  return (
    <ul className='divide-y divide-(--app-shell-border)'>
      {events.map(event => (
        <li
          key={event.id}
          className='flex flex-col gap-x-3 gap-y-0.5 px-4 py-2 text-2xs sm:flex-row'
        >
          <span className='tabular-nums text-tertiary-token sm:w-36 sm:shrink-0'>
            {event.ts.slice(0, 16).replace('T', ' ')}
          </span>
          <span className='truncate text-primary-token sm:w-40 sm:shrink-0'>
            {event.actor_agent}
            {event.host ? (
              <span className='text-tertiary-token'> @ {event.host}</span>
            ) : null}
          </span>
          <span className='min-w-0 break-words text-secondary-token'>
            <span
              className={cn(event.danger ? 'text-error' : 'text-primary-token')}
            >
              {event.danger ? 'Dangerous: ' : ''}
              {event.action}
            </span>{' '}
            {event.target}
            {event.reason ? (
              <span className='text-tertiary-token'> · {event.reason}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UnattributedRows({
  items,
}: Readonly<{ items: readonly FleetAuditCorrelation[] }>) {
  return (
    <ul className='divide-y divide-(--app-shell-border)'>
      {items.map(item => (
        <li
          key={item.id}
          className='flex flex-col gap-x-3 gap-y-0.5 px-4 py-2 text-2xs sm:flex-row'
        >
          <span className='tabular-nums text-tertiary-token sm:w-36 sm:shrink-0'>
            {item.observed_at.slice(0, 16).replace('T', ' ')}
          </span>
          <span className='min-w-0 break-words text-secondary-token'>
            <span className='text-warning'>{item.change}</span> {item.target}
            <span className='text-tertiary-token'>
              {' '}
              · by {item.github_actor ?? 'unknown'}, no agent record
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  empty,
  count,
  children,
}: Readonly<{
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}>) {
  return (
    <div>
      <p className='px-4 pt-3 text-2xs font-medium text-tertiary-token'>
        {title}
      </p>
      {count ? (
        children
      ) : (
        <p className='px-4 py-2 text-2xs text-tertiary-token'>{empty}</p>
      )}
    </div>
  );
}

function Budget({ budget }: Readonly<{ budget: FleetAuditSummary['budget'] }>) {
  const pct = Math.min(100, Math.max(0, budget.pct));
  const tone =
    pct >= 90 ? 'text-error' : pct >= 70 ? 'text-warning' : 'text-success';
  return (
    <div className='min-w-0'>
      <p className='text-2xs text-tertiary-token'>Storage budget this month</p>
      <div
        role='img'
        aria-label={`Fleet audit storage ${pct.toFixed(1)} percent of monthly budget`}
        className='mt-1 h-2.5 w-full overflow-hidden rounded-full bg-surface-0'
      >
        <div
          className={cn('h-full bg-current', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className='mt-1 text-2xs tabular-nums text-tertiary-token'>
        {pct.toFixed(1)}% · {budget.bytes_month.toLocaleString()} of{' '}
        {budget.limit_bytes.toLocaleString()} bytes
      </p>
    </div>
  );
}

export function FleetAuditPanel({
  initial,
}: Readonly<{ initial: FleetAuditResult<FleetAuditSummary> }>) {
  const [target, setTarget] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const query = target.trim();
    if (!query) return setSearch({ kind: 'idle' });
    setSearch({ kind: 'loading' });
    try {
      const response = await fetch(
        `/api/ovie/fleet-audit?${new URLSearchParams({ target: query, since: new Date(Date.now() - 30 * 86_400_000).toISOString() })}`,
        { cache: 'no-store' }
      );
      if (!response.ok) return setSearch({ kind: 'error' });
      const body = (await response.json()) as
        | ({ state: 'ok' } & FleetAuditWho)
        | { state: 'not_configured' };
      setSearch(
        body.state === 'ok'
          ? { kind: 'ok', who: body }
          : { kind: 'not_configured' }
      );
    } catch {
      setSearch({ kind: 'error' });
    }
  }

  return (
    <ContentSurfaceCard surface='details' data-testid='fleet-audit-panel'>
      <ContentSectionHeader
        title='Fleet audit'
        subtitle='Which agent did what on GitHub. All agents share one GitHub identity, so this is the only attribution.'
      />
      {initial.state === 'not_configured' ? (
        <p
          className='p-4 text-app text-secondary-token'
          data-testid='fleet-audit-not-configured'
        >
          Not configured. Set FLEET_AUDIT_READ_TOKEN for this deployment to read
          the fleet audit trail.
        </p>
      ) : initial.state === 'unavailable' ? (
        <p
          className='p-4 text-app text-secondary-token'
          data-testid='fleet-audit-unavailable'
        >
          The fleet audit service is unreachable. Try again shortly.
        </p>
      ) : (
        <div className='space-y-1 pb-3'>
          <div className='grid gap-4 p-4 sm:grid-cols-3'>
            <Budget budget={initial.data.budget} />
            <div>
              <p className='text-2xs text-tertiary-token'>Events, last 24h</p>
              <p className='text-lg font-semibold tabular-nums text-primary-token'>
                {initial.data.counts.events_24h}
              </p>
            </div>
            <div>
              <p className='text-2xs text-tertiary-token'>Events, last 7d</p>
              <p className='text-lg font-semibold tabular-nums text-primary-token'>
                {initial.data.counts.events_7d}
              </p>
            </div>
          </div>
          <Section
            title='Dangerous actions, last 7d'
            empty='None.'
            count={initial.data.dangerous.length}
          >
            <EventRows events={initial.data.dangerous} />
          </Section>
          <Section
            title='Unattributed changes, last 7d'
            empty='None. Every observed change matches an agent record.'
            count={initial.data.unattributed.length}
          >
            <UnattributedRows items={initial.data.unattributed} />
          </Section>
          <form onSubmit={onSubmit} className='flex gap-2 px-4 pt-3'>
            <Input
              aria-label='Search Fleet Audit By Target'
              placeholder='Repo, PR URL, or branch'
              value={target}
              onChange={event => setTarget(event.target.value)}
              maxLength={200}
            />
            <Button type='submit' disabled={search.kind === 'loading'}>
              Search
            </Button>
          </form>
          <div aria-live='polite' data-testid='fleet-audit-results'>
            {search.kind === 'loading' ? (
              <p className='px-4 py-2 text-2xs text-tertiary-token'>
                Searching.
              </p>
            ) : search.kind === 'error' ? (
              <p className='px-4 py-2 text-2xs text-error'>
                Search failed. Try again shortly.
              </p>
            ) : search.kind === 'not_configured' ? (
              <p className='px-4 py-2 text-2xs text-tertiary-token'>
                Not configured.
              </p>
            ) : search.kind === 'ok' ? (
              <>
                <Section
                  title='Matching events, last 30d'
                  empty='No audit events match.'
                  count={search.who.events.length}
                >
                  <EventRows events={search.who.events} />
                </Section>
                <Section
                  title='Unattributed matches'
                  empty='None.'
                  count={
                    search.who.correlations.filter(
                      c => c.status === 'unattributed'
                    ).length
                  }
                >
                  <UnattributedRows
                    items={search.who.correlations.filter(
                      c => c.status === 'unattributed'
                    )}
                  />
                </Section>
              </>
            ) : null}
          </div>
        </div>
      )}
    </ContentSurfaceCard>
  );
}
