'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, GitBranch, Loader2, Ship } from 'lucide-react';
import Link from 'next/link';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import type {
  HudGithubRateLimitsPayload,
  HudShipperState,
  HudShipperStatusPayload,
  HudWhatShippedPayload,
} from '@/types/hud-shipper';
import { getAccentCssVars, HUD_TONE_ACCENT } from '@/lib/ui/accent-palette';
import type { HudTone } from '@/lib/hud/tone-determination';
import { cn } from '@/lib/utils';

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function shipperTone(state: HudShipperState): HudTone {
  if (state === 'running') return 'good';
  if (state === 'paused') return 'warning';
  if (state === 'error') return 'bad';
  return 'neutral';
}

function shipperLabel(state: HudShipperState): string {
  if (state === 'running') return 'Running';
  if (state === 'paused') return 'Paused';
  if (state === 'error') return 'Error';
  if (state === 'idle') return 'Idle';
  return 'Not Running';
}

function rateLimitSubtitle(
  bucket: HudGithubRateLimitsPayload['core']
): string {
  if (!bucket) return 'No data';
  return `${bucket.remaining.toLocaleString('en-US')} / ${bucket.limit.toLocaleString('en-US')} remaining`;
}

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function HudStatusPill({
  label,
  tone,
}: Readonly<{ readonly label: string; readonly tone: HudTone }>) {
  const accent = getAccentCssVars(HUD_TONE_ACCENT[tone]);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-2xs font-medium leading-none'
      )}
      style={{
        borderColor: `color-mix(in oklab, ${accent.solid} 26%, var(--linear-app-frame-seam))`,
        backgroundColor: accent.subtle,
        color:
          tone === 'neutral'
            ? 'var(--color-text-secondary-token)'
            : accent.solid,
      }}
    >
      {label}
    </span>
  );
}

function SectionLabel({ children }: Readonly<{ readonly children: string }>) {
  return (
    <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
      {children}
    </p>
  );
}

function ShipperStatusPanel({
  payload,
}: Readonly<{ readonly payload: HudShipperStatusPayload }>) {
  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='hud-shipper-status-panel'
    >
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Ship className='h-4 w-4 text-secondary-token' aria-hidden='true' />
          <SectionLabel>Shipper</SectionLabel>
        </div>
        <HudStatusPill
          label={shipperLabel(payload.state)}
          tone={shipperTone(payload.state)}
        />
      </div>

      <div className='grid gap-2 sm:grid-cols-2'>
        <ContentMetricRow
          label='Dispatchable'
          value={payload.dispatchableCount.toLocaleString('en-US')}
        />
        <ContentMetricRow
          label='In Flight'
          value={payload.inFlightCount.toLocaleString('en-US')}
        />
        <ContentMetricRow
          label='Last Run'
          value={formatTimestamp(payload.lastRunAt)}
        />
        <ContentMetricRow
          label='Last Result'
          value={payload.lastResult ?? '—'}
        />
      </div>

      {payload.inFlightJobs.length > 0 ? (
        <div className='space-y-2 border-t border-subtle pt-3'>
          <SectionLabel>In-flight ledger</SectionLabel>
          <div className='grid gap-2'>
            {payload.inFlightJobs.map(job => (
              <div
                key={`${job.repo}-${job.issue}-${job.startedAt}`}
                className='rounded-md border border-subtle bg-surface-0 px-3 py-2'
              >
                <p className='text-app font-semibold text-primary-token'>
                  #{job.issue}
                  <span className='ml-2 font-normal text-secondary-token'>
                    {job.branch}
                  </span>
                </p>
                <p className='mt-1 text-2xs text-tertiary-token'>
                  PID {job.pid} · {formatTimestamp(job.startedAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {payload.lastError || payload.recentErrors.length > 0 ? (
        <div className='space-y-2 border-t border-subtle pt-3'>
          <div className='flex items-center gap-2'>
            <AlertTriangle
              className='h-3.5 w-3.5 text-destructive'
              aria-hidden='true'
            />
            <SectionLabel>Last errors</SectionLabel>
          </div>
          {payload.lastError ? (
            <p className='text-app leading-5 text-secondary-token'>
              {payload.lastError}
            </p>
          ) : null}
          {payload.recentErrors.length > 0 ? (
            <pre className='max-h-32 overflow-auto rounded-md border border-subtle bg-surface-0 p-3 text-2xs leading-5 text-tertiary-token'>
              {payload.recentErrors.join('\n')}
            </pre>
          ) : null}
        </div>
      ) : null}
    </ContentSurfaceCard>
  );
}

function WhatShippedPanel({
  payload,
}: Readonly<{ readonly payload: HudWhatShippedPayload }>) {
  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='hud-what-shipped-panel'
    >
      <SectionLabel>What shipped</SectionLabel>
      {payload.entries.length > 0 ? (
        <div className='grid gap-2'>
          {payload.entries.map(entry => (
            <div
              key={`${entry.title}-${entry.mergedAt}`}
              className='rounded-md border border-subtle bg-surface-0 px-3 py-2'
            >
              <p className='text-app font-semibold text-primary-token'>
                {entry.title}
              </p>
              <p className='mt-1 text-2xs text-tertiary-token'>
                {formatTimestamp(entry.mergedAt)}
                {entry.issueNumber ? ` · #${entry.issueNumber}` : ''}
              </p>
              {entry.url ? (
                <Link
                  href={entry.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='mt-1 inline-flex text-2xs text-secondary-token underline-offset-2 hover:underline'
                >
                  View PR
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className='text-app text-secondary-token'>
          {payload.availability === 'available'
            ? 'No recent shipments recorded.'
            : 'Ship log unavailable on this host.'}
        </p>
      )}
    </ContentSurfaceCard>
  );
}

function GithubRateLimitsPanel({
  payload,
}: Readonly<{ readonly payload: HudGithubRateLimitsPayload }>) {
  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='hud-github-rate-limits-panel'
    >
      <div className='flex items-center gap-2'>
        <GitBranch className='h-4 w-4 text-secondary-token' aria-hidden='true' />
        <SectionLabel>GitHub rate limits</SectionLabel>
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <ContentMetricCard
          label='Core REST'
          value={payload.core?.remaining.toLocaleString('en-US') ?? '—'}
          subtitle={rateLimitSubtitle(payload.core)}
          className='p-3'
          valueClassName='text-2xl font-[620] leading-none tracking-[-0.03em]'
        />
        <ContentMetricCard
          label='GraphQL'
          value={payload.graphql?.remaining.toLocaleString('en-US') ?? '—'}
          subtitle={rateLimitSubtitle(payload.graphql)}
          className='p-3'
          valueClassName='text-2xl font-[620] leading-none tracking-[-0.03em]'
        />
      </div>
      {payload.availability === 'not_configured' ? (
        <p className='text-app text-secondary-token'>
          Configure HUD GitHub credentials to load rate limits.
        </p>
      ) : null}
      {payload.errorMessage ? (
        <p className='text-app text-secondary-token'>{payload.errorMessage}</p>
      ) : null}
    </ContentSurfaceCard>
  );
}

function PanelSkeleton() {
  return (
    <ContentSurfaceCard surface='details' className='flex min-h-40 items-center justify-center p-3'>
      <Loader2 className='h-5 w-5 animate-spin text-tertiary-token' aria-hidden='true' />
      <span className='sr-only'>Loading HUD panel</span>
    </ContentSurfaceCard>
  );
}

export function HudShipperPanels() {
  const shipperQuery = useQuery({
    queryKey: ['hud', 'shipper'],
    queryFn: ({ signal }) =>
      fetchJson<HudShipperStatusPayload>('/api/admin/hud/shipper', signal),
    ...FREQUENT_CACHE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const whatShippedQuery = useQuery({
    queryKey: ['hud', 'what-shipped'],
    queryFn: ({ signal }) =>
      fetchJson<HudWhatShippedPayload>('/api/admin/hud/what-shipped', signal),
    ...FREQUENT_CACHE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const rateLimitsQuery = useQuery({
    queryKey: ['hud', 'github-rate-limits'],
    queryFn: ({ signal }) =>
      fetchJson<HudGithubRateLimitsPayload>(
        '/api/admin/hud/github-rate-limits',
        signal
      ),
    ...FREQUENT_CACHE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return (
    <div className='flex flex-col gap-3' data-testid='hud-shipper-panels'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-app text-secondary-token'>
          Codex shipper, in-flight ledger, and GitHub budget for operator
          sessions.
        </p>
        <Link
          href={APP_ROUTES.ADMIN_OPS}
          className='text-xs text-secondary-token underline-offset-2 hover:underline'
        >
          Open full Ops surface
        </Link>
      </div>

      <div className='grid gap-3 xl:grid-cols-2'>
        {shipperQuery.data ? (
          <ShipperStatusPanel payload={shipperQuery.data} />
        ) : (
          <PanelSkeleton />
        )}
        {whatShippedQuery.data ? (
          <WhatShippedPanel payload={whatShippedQuery.data} />
        ) : (
          <PanelSkeleton />
        )}
      </div>

      {rateLimitsQuery.data ? (
        <GithubRateLimitsPanel payload={rateLimitsQuery.data} />
      ) : (
        <PanelSkeleton />
      )}
    </div>
  );
}