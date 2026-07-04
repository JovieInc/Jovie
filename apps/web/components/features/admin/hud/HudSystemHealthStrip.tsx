'use client';

import { useQuery } from '@tanstack/react-query';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  getDeploymentLabel,
  getDeploymentTone,
  type HudTone,
} from '@/lib/hud/tone-determination';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { getAccentCssVars, HUD_TONE_ACCENT } from '@/lib/ui/accent-palette';
import type { HudMetrics } from '@/types/hud';
import type {
  HudShipperState,
  HudShipperStatusPayload,
} from '@/types/hud-shipper';

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

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function StatusPill({
  label,
  tone,
}: Readonly<{ readonly label: string; readonly tone: HudTone }>) {
  const accent = getAccentCssVars(HUD_TONE_ACCENT[tone]);

  return (
    <span
      className='inline-flex items-center rounded-full border px-2.5 py-0.5 text-2xs font-medium leading-none'
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

interface HealthEntry {
  readonly name: string;
  readonly label: string;
  readonly tone: HudTone;
}

function buildHealthEntries(
  metrics: HudMetrics,
  shipper: HudShipperStatusPayload | undefined
): HealthEntry[] {
  const quarantine = metrics.testing.quarantine;
  const jobsRunning =
    metrics.aiOps.counts.running + (shipper?.inFlightCount ?? 0);

  return [
    {
      name: 'Shipper',
      label:
        shipper === undefined
          ? '—'
          : shipper.availability === 'unavailable'
            ? 'No signal'
            : shipperLabel(shipper.state),
      tone:
        shipper === undefined || shipper.availability === 'unavailable'
          ? 'neutral'
          : shipperTone(shipper.state),
    },
    // No gbrain health source is wired into the HUD yet — render an honest
    // neutral pill rather than a fabricated status. Wire when a source lands.
    { name: 'gbrain', label: 'No signal', tone: 'neutral' },
    {
      name: 'CI',
      label: getDeploymentLabel(metrics.deployments),
      tone: getDeploymentTone(metrics.deployments),
    },
    {
      name: 'Ledger',
      label: quarantine.isValid
        ? `Valid | ${quarantine.activeCount.toLocaleString('en-US')} quarantined`
        : 'Invalid',
      tone: quarantine.isValid
        ? quarantine.withinRetryBudget
          ? 'good'
          : 'warning'
        : 'bad',
    },
    {
      name: 'Jobs',
      label: `${jobsRunning.toLocaleString('en-US')} running`,
      tone: jobsRunning > 0 ? 'good' : 'neutral',
    },
  ];
}

/**
 * Single-row system health strip for the operator HUD (#12887): shipper,
 * gbrain, CI, quarantine ledger, and jobs running. Pills reuse the HUD
 * tone accent tokens; shipper status shares the existing
 * ['hud', 'shipper'] query cache with HudShipperPanels.
 */
export function HudSystemHealthStrip({
  metrics,
}: Readonly<{ readonly metrics: HudMetrics }>) {
  const shipperQuery = useQuery({
    queryKey: ['hud', 'shipper'],
    queryFn: ({ signal }) =>
      fetchJson<HudShipperStatusPayload>('/api/admin/hud/shipper', signal),
    ...FREQUENT_CACHE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const entries = buildHealthEntries(metrics, shipperQuery.data);

  return (
    <ContentSurfaceCard
      surface='details'
      className='rounded-(--radius-md) p-3 shadow-card-elevated'
      data-testid='hud-system-health-strip'
    >
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
        <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
          System health
        </p>
        {entries.map(entry => (
          <div key={entry.name} className='flex items-center gap-1.5'>
            <span className='text-2xs text-secondary-token'>{entry.name}</span>
            <StatusPill label={entry.label} tone={entry.tone} />
          </div>
        ))}
      </div>
    </ContentSurfaceCard>
  );
}
