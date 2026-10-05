'use client';

import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  getDeploymentLabel,
  getDeploymentTone,
  type HudTone,
} from '@/lib/hud/tone-determination';
import { cn } from '@/lib/utils';
import type { HudMetrics } from '@/types/hud';

interface HealthEntry {
  readonly name: string;
  readonly label: string;
  readonly tone: HudTone;
}

const GBRAIN_NO_SIGNAL_LABEL = 'No Signal';

function ledgerTone(quarantine: HudMetrics['testing']['quarantine']): HudTone {
  if (!quarantine.isValid) return 'bad';
  return quarantine.withinRetryBudget ? 'good' : 'warning';
}

function gbrainEntry(health: HudMetrics['gbrain']): HealthEntry {
  if (health?.status === 'ok') {
    return {
      name: 'gbrain',
      label: health.version ? `OK · v${health.version}` : 'OK',
      tone: 'good',
    };
  }
  if (health?.status === 'down') {
    return { name: 'gbrain', label: 'Down', tone: 'bad' };
  }
  // Unconfigured or unreadable: an honest neutral pill, never a guess.
  return { name: 'gbrain', label: GBRAIN_NO_SIGNAL_LABEL, tone: 'neutral' };
}

function buildHealthEntries(metrics: HudMetrics): HealthEntry[] {
  const quarantine = metrics.testing.quarantine;
  const jobsRunning = metrics.aiOps.counts.running;

  return [
    gbrainEntry(metrics.gbrain),
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
      tone: ledgerTone(quarantine),
    },
    {
      name: 'Jobs',
      label: `${jobsRunning.toLocaleString('en-US')} running`,
      tone: jobsRunning > 0 ? 'good' : 'neutral',
    },
  ];
}

/**
 * Factory-health strip: gbrain, CI, quarantine ledger, and jobs running.
 * Shipper status lives once in the need-band shipper panel.
 */
export function HudSystemHealthStrip({
  metrics,
  presentation = 'section',
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly presentation?: 'section' | 'page';
}>) {
  const entries = buildHealthEntries(metrics);
  const Surface = presentation === 'page' ? 'section' : ContentSurfaceCard;

  return (
    <Surface
      {...(presentation === 'section' ? { surface: 'details' as const } : {})}
      aria-label='System Health'
      data-testid='hud-system-health-strip'
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2',
          presentation === 'section' && 'p-3'
        )}
      >
        <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
          System health
        </p>
        {entries.map(entry => (
          <div key={entry.name} className='flex items-center gap-1.5'>
            <span className='text-2xs text-secondary-token'>{entry.name}</span>
            <HudStatusPill label={entry.label} tone={entry.tone} />
          </div>
        ))}
      </div>
    </Surface>
  );
}
