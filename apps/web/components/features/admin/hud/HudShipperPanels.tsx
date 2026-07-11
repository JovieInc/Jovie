'use client';

import { Button } from '@jovie/ui';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  GitBranch,
  KeyRound,
  Loader2,
  MessageSquare,
  RefreshCw,
  Ship,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import type { TasteInboxPayload } from '@/lib/hud/taste-inbox';
import type { HudTone } from '@/lib/hud/tone-determination';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { getAccentCssVars, HUD_TONE_ACCENT } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import type {
  HudGithubRateLimitsPayload,
  HudShipperState,
  HudShipperStatusPayload,
  HudWhatShippedPayload,
} from '@/types/hud-shipper';

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

function rateLimitSubtitle(bucket: HudGithubRateLimitsPayload['core']): string {
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
        <GitBranch
          className='h-4 w-4 text-secondary-token'
          aria-hidden='true'
        />
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
          label='Graphql'
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

function TasteInboxPanel({
  payload,
  onRefresh,
}: Readonly<{
  readonly payload: TasteInboxPayload;
  readonly onRefresh: () => void;
}>) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [commentId, setCommentId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function act(
    issueId: string,
    action: 'approve' | 'reject' | 'comment'
  ) {
    setBusyId(issueId);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/hud/taste-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          action,
          comment: action === 'comment' ? comment : undefined,
        }),
      });
      if (!response.ok) throw new Error('Could not save');
      setComment('');
      setCommentId(null);
      setMessage('Saved');
      onRefresh();
    } catch {
      setMessage('Could not save that decision');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='hud-taste-inbox-panel'
    >
      <div className='flex items-center justify-between gap-3'>
        <div>
          <SectionLabel>Taste Inbox</SectionLabel>
          <p className='mt-1 text-2xs text-tertiary-token'>
            Human decisions stay in the loop.
          </p>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={onRefresh}
          className='h-7 w-7 text-tertiary-token hover:bg-surface-0 hover:text-primary-token'
          aria-label='Refresh Taste Inbox'
        >
          <RefreshCw className='h-3.5 w-3.5' aria-hidden='true' />
        </Button>
      </div>
      {!payload.available ? (
        <p className='text-app text-secondary-token'>
          {payload.error ?? 'Taste Inbox unavailable.'}
        </p>
      ) : null}
      {payload.error ? (
        <p className='text-app text-secondary-token'>{payload.error}</p>
      ) : null}
      {payload.issues.length === 0 && payload.available && !payload.error ? (
        <p className='text-app text-secondary-token'>No open decisions.</p>
      ) : null}
      <div className='grid gap-2'>
        {payload.issues.map(issue => (
          <div
            key={issue.id}
            className='rounded-md border border-subtle bg-surface-0 px-3 py-2'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <p className='text-app font-semibold text-primary-token'>
                  {issue.identifier} · {issue.title}
                </p>
                <p className='mt-1 text-2xs text-tertiary-token'>
                  {issue.label === 'needs:taste'
                    ? 'Taste call'
                    : 'Human action'}{' '}
                  · Priority {issue.priorityLabel}
                </p>
              </div>
              <Link
                href={issue.url}
                target='_blank'
                rel='noopener noreferrer'
                className='shrink-0 text-2xs text-secondary-token underline-offset-2 hover:underline'
              >
                Open
              </Link>
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-1.5'>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={busyId === issue.id}
                onClick={() => void act(issue.id, 'approve')}
                className='h-auto gap-1 rounded-md px-2 py-1 text-2xs'
              >
                <Check className='h-3 w-3' aria-hidden='true' />
                Approve
              </Button>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={busyId === issue.id}
                onClick={() => void act(issue.id, 'reject')}
                className='h-auto gap-1 rounded-md px-2 py-1 text-2xs'
              >
                <X className='h-3 w-3' aria-hidden='true' />
                Reject
              </Button>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={busyId === issue.id}
                onClick={() =>
                  setCommentId(commentId === issue.id ? null : issue.id)
                }
                className='h-auto gap-1 rounded-md px-2 py-1 text-2xs'
              >
                <MessageSquare className='h-3 w-3' aria-hidden='true' />
                Comment
              </Button>
            </div>
            {commentId === issue.id ? (
              <div className='mt-2 flex gap-2'>
                <input
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  placeholder='Add a decision note'
                  className='min-w-0 flex-1 rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-app text-primary-token outline-none focus:border-accent'
                />
                <Button
                  type='button'
                  variant='primary'
                  size='sm'
                  disabled={!comment.trim() || busyId === issue.id}
                  onClick={() => void act(issue.id, 'comment')}
                  className='h-auto rounded-md px-2 py-1 text-2xs'
                >
                  Save
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {message ? (
        <p className='min-h-4 text-2xs text-tertiary-token' role='status'>
          {message}
        </p>
      ) : (
        <p
          className='min-h-4 text-2xs text-tertiary-token'
          aria-hidden='true'
        />
      )}
    </ContentSurfaceCard>
  );
}

function CliAuthPanel() {
  const authQuery = useQuery({
    queryKey: ['hud', 'cli-auth'],
    queryFn: ({ signal }) =>
      fetchJson<{
        providers: Array<{
          provider: string;
          available: boolean;
          detail: string;
        }>;
      }>('/api/admin/hud/cli-auth', signal),
    staleTime: 30_000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  async function reauthenticate(provider: string) {
    setBusy(provider);
    try {
      await fetch('/api/admin/hud/cli-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
    } finally {
      setBusy(null);
      void authQuery.refetch();
    }
  }
  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='hud-cli-auth-panel'
    >
      <div className='flex items-center gap-2'>
        <KeyRound className='h-4 w-4 text-secondary-token' aria-hidden='true' />
        <SectionLabel>Local Sign-In</SectionLabel>
      </div>
      <p className='text-2xs text-tertiary-token'>
        Status only. Reauthentication opens a local terminal flow; secrets never
        enter the browser.
      </p>
      <div className='grid gap-2 sm:grid-cols-3'>
        {(authQuery.data?.providers ?? []).map(item => (
          <div
            key={item.provider}
            className='flex items-center justify-between gap-2 rounded-md border border-subtle bg-surface-0 px-2.5 py-2'
          >
            <span className='text-app capitalize text-primary-token'>
              {item.provider}
            </span>
            <Button
              type='button'
              variant='link'
              size='sm'
              onClick={() => void reauthenticate(item.provider)}
              disabled={busy === item.provider}
              className='h-auto p-0 text-2xs text-secondary-token'
            >
              {item.available ? 'Reauthenticate' : 'Sign in'}
            </Button>
          </div>
        ))}
      </div>
    </ContentSurfaceCard>
  );
}

function PanelSkeleton() {
  return (
    <ContentSurfaceCard
      surface='details'
      className='flex min-h-40 items-center justify-center p-3'
    >
      <Loader2
        className='h-5 w-5 animate-spin text-tertiary-token'
        aria-hidden='true'
      />
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

  const tasteInboxQuery = useQuery({
    queryKey: ['hud', 'taste-inbox'],
    queryFn: ({ signal }) =>
      fetchJson<TasteInboxPayload>('/api/admin/hud/taste-inbox', signal),
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
        {tasteInboxQuery.data ? (
          <TasteInboxPanel
            payload={tasteInboxQuery.data}
            onRefresh={() => void tasteInboxQuery.refetch()}
          />
        ) : (
          <PanelSkeleton />
        )}
        <CliAuthPanel />
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
