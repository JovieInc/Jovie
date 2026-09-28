'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { FounderMorningWalkCard } from '@/components/features/admin/hud/FounderMorningWalkCard';
import { HudBottlenecksCard } from '@/components/features/admin/hud/HudBottlenecksCard';
import { HudCompanyMetricCards } from '@/components/features/admin/hud/HudCompanyMetricCards';
import { HudExceptionsStrip } from '@/components/features/admin/hud/HudExceptionsStrip';
import { HudShippingStrip } from '@/components/features/admin/hud/HudShippingStrip';
import { OvieLauncherRail } from '@/components/features/admin/hud/OvieLauncherRail';
import { useHudShippingStateQuery } from '@/components/features/admin/hud/useHudShippingStateQuery';
import { TimActionRequiredSection } from '@/components/features/admin/TimActionRequiredSection';
import { WhatShipped } from '@/components/features/admin/WhatShipped';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { QRCode } from '@/components/molecules/QRCode';
import type { FounderFunnelData } from '@/lib/admin/types';
import type { HudMetrics } from '@/types/hud';
import { HudClockClient } from './HudClockClient';
import { useHudMetricsQuery } from './useHudMetricsQuery';

function formatUpdatedTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function SectionLabel({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return (
    <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
      {children}
    </p>
  );
}

export type OpsCockpitDensity = 'shell' | 'kiosk';
export type OpsCockpitPresentationMode = 'shell' | 'admin-kiosk' | 'token';
type CockpitPresentation = 'shell' | 'kiosk' | 'token';

export interface OpsCockpitClientProps {
  readonly initialMetrics: HudMetrics;
  /** Visual scale: shell-density matches Ops KPIs; kiosk uses TV-scale typography. */
  readonly density?: OpsCockpitDensity;
  /**
   * Auth/access context. Independent of `density` — admin-kiosk keeps full
   * founder capability while rendering at kiosk scale. Token mode hides
   * admin-only surfaces (launchers, Needs Tim) regardless of density.
   */
  readonly presentationMode?: OpsCockpitPresentationMode;
  /** Required only in token presentation: the QR-target URL for the TV view. */
  readonly hudUrl?: string;
  /** Required only in token presentation: forwarded to the metrics refresh hook. */
  readonly kioskToken?: string | null;
  /** Prefetched founder funnel for bottleneck ranking (signed-in path only). */
  readonly initialFunnel?: FounderFunnelData | null;
}

function resolvePresentation(
  density: OpsCockpitDensity,
  presentationMode: OpsCockpitPresentationMode
): CockpitPresentation {
  if (presentationMode === 'token') return 'token';
  if (density === 'shell') return 'shell';
  return 'kiosk';
}

function OpsCockpitQrCard({ hudUrl }: Readonly<{ readonly hudUrl: string }>) {
  return (
    <ContentSurfaceCard surface='details' className='overflow-hidden'>
      <div className='flex flex-col gap-4 p-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1'>
          <SectionLabel>Open on phone</SectionLabel>
          <p className='text-xl font-[620] tracking-[-0.03em] text-primary-token'>
            Scan to view
          </p>
          <p className='max-w-[28ch] text-app leading-5 text-secondary-token'>
            Open the live HUD on another device using this kiosk link.
          </p>
        </div>
        <div className='rounded-xl border border-subtle bg-surface-0 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
          <QRCode
            data={hudUrl}
            size={196}
            label='HUD Link'
            className='rounded-lg bg-white dark:bg-white'
          />
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

function OpsCockpitKioskHeader({
  metrics,
}: Readonly<{ readonly metrics: HudMetrics }>) {
  return (
    <ContentSurfaceCard surface='details' className='overflow-hidden'>
      <div className='flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
        <div className='flex items-center gap-3'>
          <div className='relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-subtle bg-surface-0'>
            <Image
              src='/brand/Jovie-Logo-Icon-White.svg'
              alt='Jovie'
              fill
              sizes='44px'
              className='object-contain p-2'
              priority
            />
          </div>
          <div className='min-w-0'>
            <SectionLabel>Ops</SectionLabel>
            <h1 className='mt-1 truncate text-xl font-[620] leading-none tracking-[-0.03em] text-primary-token sm:text-2xl'>
              {metrics.branding.startupName}
            </h1>
          </div>
        </div>
        <div className='flex flex-col items-start gap-1 sm:items-end'>
          <div className='text-lg font-[620] tracking-[-0.03em] text-primary-token sm:text-xl'>
            <HudClockClient />
          </div>
          <p className='text-xs text-secondary-token'>
            Updated {formatUpdatedTime(metrics.generatedAtIso)}
          </p>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

/**
 * One executive cockpit: company metrics, a compact shipping strip, an
 * exceptions-only health strip, founder decisions, a What's New changelog,
 * and ranked bottlenecks. Internal subsystem panels (env exceptions,
 * dispatch, agent runs, diagnostics) are intentionally absent — Ops is the
 * overview, not the inbox. Shell, signed-in fullscreen, and kiosk token all
 * render this same surface so the presentations cannot drift.
 */
export function OpsCockpitClient({
  initialMetrics,
  density = 'kiosk',
  presentationMode = 'token',
  hudUrl,
  kioskToken = null,
  initialFunnel = null,
}: OpsCockpitClientProps) {
  const { data: metrics } = useHudMetricsQuery(initialMetrics, kioskToken);
  const { view: shipping } = useHudShippingStateQuery(kioskToken);

  const isShell = density === 'shell';
  const presentation = resolvePresentation(density, presentationMode);

  return (
    <div
      className={
        isShell
          ? 'flex w-full flex-col gap-3'
          : 'flex w-full flex-col gap-3 px-4 py-4 sm:px-6 sm:py-6 xl:px-8'
      }
    >
      {isShell ? null : <OpsCockpitKioskHeader metrics={metrics} />}
      {presentation === 'token' ? null : (
        <div
          className='flex flex-wrap items-center gap-2'
          data-testid='hud-utility-row'
        >
          <OvieLauncherRail compact />
          <FounderMorningWalkCard
            compact
            defaultStatus={metrics.overview.defaultStatusDetail}
          />
        </div>
      )}
      <HudCompanyMetricCards metrics={metrics} shipping={shipping} />
      <HudShippingStrip view={shipping} />
      <HudExceptionsStrip metrics={metrics} />
      {presentation === 'token' ? null : (
        <div data-testid='tim-action-required'>
          <TimActionRequiredSection />
        </div>
      )}
      <WhatShipped kioskToken={kioskToken} title="What's New" limit={3} />
      <HudBottlenecksCard
        metrics={metrics}
        funnel={presentation === 'token' ? null : initialFunnel}
      />
      {presentation === 'token' && hudUrl ? (
        <OpsCockpitQrCard hudUrl={hudUrl} />
      ) : null}
      <div
        data-testid='hud-bottom-marker'
        className='h-px w-full'
        aria-hidden
      />
    </div>
  );
}
