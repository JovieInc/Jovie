'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Timer } from 'lucide-react';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { HudTone } from '@/lib/hud/tone-determination';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { getAccentCssVars, HUD_TONE_ACCENT } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import type {
  HudEnvActiveException,
  HudEnvExceptionsPayload,
} from '@/types/hud-env-exceptions';

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function formatDurationMs(value: number | null): string {
  if (value === null) return '—';
  const minutes = Math.floor(Math.abs(value) / 60_000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

function formatExpiry(entry: HudEnvActiveException): string {
  if (entry.expiresInMs === null) return '—';
  if (entry.expired)
    return `expired ${formatDurationMs(entry.expiresInMs)} ago`;
  return `expires in ${formatDurationMs(entry.expiresInMs)}`;
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : '—';
}

function cleanupTone(entry: HudEnvActiveException): HudTone {
  if (entry.blocker) return 'bad';
  if (entry.cleanupState === 'admitted') return 'good';
  if (entry.cleanupState === 'cleanup-pending') return 'warning';
  return 'neutral';
}

function SectionLabel({ children }: Readonly<{ readonly children: string }>) {
  return (
    <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
      {children}
    </p>
  );
}

function CleanupStatePill({
  entry,
}: Readonly<{ readonly entry: HudEnvActiveException }>) {
  const tone = cleanupTone(entry);
  const accent = getAccentCssVars(HUD_TONE_ACCENT[tone]);
  const label = entry.blocker
    ? `Blocker: ${entry.cleanupState}`
    : entry.cleanupState;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium leading-none'
      )}
      style={{
        borderColor: `color-mix(in oklab, ${accent.solid} 26%, var(--app-shell-frame-seam))`,
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

function ActiveExceptionRow({
  entry,
}: Readonly<{ readonly entry: HudEnvActiveException }>) {
  return (
    <div
      className={cn(
        'rounded-md border border-subtle bg-surface-0 px-3 py-2',
        entry.blocker && 'border-destructive/50'
      )}
      data-testid={`hud-env-exception-${entry.id}`}
    >
      <div className='flex items-center justify-between gap-3'>
        <p className='truncate text-app font-semibold text-primary-token'>
          {entry.workId ?? entry.id}
          <span className='ml-2 font-normal text-secondary-token'>
            {entry.kind} · {shortSha(entry.sha)}
          </span>
        </p>
        <CleanupStatePill entry={entry} />
      </div>
      <p className='mt-1 text-2xs text-tertiary-token'>
        {entry.owner ?? 'unknown owner'} · age {formatDurationMs(entry.ageMs)} ·{' '}
        {formatExpiry(entry)}
        {entry.environment ? ` · ${entry.environment}` : ''}
      </p>
      {entry.reason ? (
        <p className='mt-1 text-2xs leading-4 text-secondary-token'>
          {entry.reason}
        </p>
      ) : null}
      <p className='mt-1 text-2xs text-tertiary-token'>
        Evidence: {entry.requiredEvidence ?? '—'} · Budget:{' '}
        {entry.costBudget ?? '—'}
      </p>
      {entry.blockerReason ? (
        <p className='mt-1 text-2xs leading-4 text-destructive'>
          {entry.blockerReason}
        </p>
      ) : null}
    </div>
  );
}

function StandingLanes({
  lanes,
}: Readonly<{ readonly lanes: HudEnvExceptionsPayload['lanes'] }>) {
  if (lanes.length === 0) return null;
  return (
    <details className='group border-t border-subtle pt-3'>
      <summary className='cursor-pointer list-none text-2xs font-medium text-tertiary-token hover:text-secondary-token'>
        Admitted standing lanes ({lanes.length})
      </summary>
      <div className='mt-2 grid gap-2'>
        {lanes.map(lane => (
          <div
            key={lane.id}
            className='rounded-md border border-subtle bg-surface-0 px-3 py-2'
          >
            <p className='truncate text-2xs font-medium text-secondary-token'>
              {lane.id}
              <span className='ml-2 font-normal text-tertiary-token'>
                {lane.kind} · {lane.policy} · TTL{' '}
                {lane.ttlHours === null ? '—' : `${lane.ttlHours}h`}
              </span>
            </p>
            <p className='mt-1 text-2xs leading-4 text-tertiary-token'>
              Cleanup: {lane.cleanupTrigger} · Budget: {lane.costBudget}
            </p>
          </div>
        ))}
      </div>
    </details>
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

export function HudEnvExceptionsPanel() {
  const envExceptionsQuery = useQuery({
    queryKey: ['hud', 'env-exceptions'],
    queryFn: ({ signal }) =>
      fetchJson<HudEnvExceptionsPayload>(
        '/api/admin/hud/env-exceptions',
        signal
      ),
    ...FREQUENT_CACHE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  if (!envExceptionsQuery.data) {
    if (envExceptionsQuery.isError) {
      return (
        <HudObservationStatus
          state='unavailable'
          message='Hosted environment exceptions are unavailable.'
          onRetry={() => {
            envExceptionsQuery.refetch().catch(() => {});
          }}
          testId='hud-env-exceptions-observation'
        />
      );
    }
    return <PanelSkeleton />;
  }

  const payload = envExceptionsQuery.data;
  const blockerCount = payload.activeExceptions.filter(
    entry => entry.blocker
  ).length;

  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='hud-env-exceptions-panel'
    >
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Timer className='h-4 w-4 text-secondary-token' aria-hidden='true' />
          <SectionLabel>Env exceptions</SectionLabel>
        </div>
        {blockerCount > 0 ? (
          <p className='text-2xs font-medium text-destructive'>
            {blockerCount} blocker{blockerCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      {payload.activeExceptions.length > 0 ? (
        <div className='grid gap-2'>
          {payload.activeExceptions.map(entry => (
            <ActiveExceptionRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <p className='text-app text-secondary-token'>
          No active hosted environment exceptions.
        </p>
      )}

      <StandingLanes lanes={payload.lanes} />
    </ContentSurfaceCard>
  );
}
