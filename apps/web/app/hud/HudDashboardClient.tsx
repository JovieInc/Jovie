'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { QRCode } from '@/components/molecules/QRCode';
import {
  getDefaultStatusTone,
  getDeploymentLabel,
  getDeploymentTone,
} from '@/lib/hud/tone-determination';
import type { HudMetrics } from '@/types/hud';
import { HudClockClient } from './HudClockClient';
import { HudStatusPill } from './HudStatusPill';
import { useHudMetricsQuery } from './useHudMetricsQuery';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function formatRunway(runwayMonths: number | null): string {
  if (runwayMonths == null) return '\u221E';
  if (!Number.isFinite(runwayMonths)) return '\u221E';
  if (runwayMonths < 0) return '0';
  return `${runwayMonths.toFixed(1)} mo`;
}

function formatUpdatedTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function formatDeploymentTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function getDeploymentDetail(deployments: HudMetrics['deployments']): string {
  if (deployments.current?.branch) {
    return `Branch ${deployments.current.branch}`;
  }

  if (deployments.availability === 'not_configured') {
    return 'Deploy not configured';
  }

  return deployments.errorMessage ?? '\u2014';
}

function SectionEyebrow({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return (
    <p className='text-[11px] font-semibold uppercase tracking-[0.16em] text-tertiary-token'>
      {children}
    </p>
  );
}

function DeploymentRow({
  run,
}: Readonly<{
  readonly run: HudMetrics['deployments']['recent'][number];
}>) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border border-subtle bg-surface-0 px-3 py-2.5'>
      <div className='min-w-0'>
        <p className='truncate text-[13px] font-semibold text-primary-token'>
          #{run.runNumber}
          <span className='ml-2 font-normal text-secondary-token'>
            {run.branch ?? '\u2014'}
          </span>
        </p>
      </div>
      <div className='shrink-0 text-right'>
        <p className='text-[11px] text-tertiary-token'>
          {formatDeploymentTime(run.createdAtIso)}
        </p>
        <p className='mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary-token'>
          {run.status}
        </p>
      </div>
    </div>
  );
}

export interface HudDashboardClientProps {
  readonly initialMetrics: HudMetrics;
  readonly hudUrl: string;
  readonly kioskToken: string | null;
}

export function HudDashboardClient({
  initialMetrics,
  hudUrl,
  kioskToken,
}: HudDashboardClientProps) {
  const { data: metrics } = useHudMetricsQuery(initialMetrics, kioskToken);

  const defaultTone = getDefaultStatusTone(metrics.overview.defaultStatus);
  const deploymentsTone = getDeploymentTone(metrics.deployments);
  const deploymentLabel = getDeploymentLabel(metrics.deployments);
  const deploymentDetail = getDeploymentDetail(metrics.deployments);

  return (
    <div className='mx-auto flex w-full max-w-[1560px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 xl:px-8'>
      <ContentSurfaceCard
        surface='details'
        className='flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'
      >
        <div className='flex items-center gap-3'>
          <div className='relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-subtle bg-surface-0'>
            <Image
              src='/brand/Jovie-Logo-Icon-White.svg'
              alt='Jovie'
              fill
              sizes='44px'
              className='object-contain p-2.5'
              priority
            />
          </div>
          <div className='min-w-0'>
            <SectionEyebrow>HUD</SectionEyebrow>
            <h1 className='mt-1 truncate text-[22px] font-[620] leading-none tracking-[-0.03em] text-primary-token sm:text-[24px]'>
              {metrics.branding.startupName}
            </h1>
          </div>
        </div>
        <div className='flex flex-col items-start gap-1 sm:items-end'>
          <div className='text-[18px] font-[620] tracking-[-0.03em] text-primary-token sm:text-[20px]'>
            <HudClockClient />
          </div>
          <p className='text-[12px] text-secondary-token'>
            Updated {formatUpdatedTime(metrics.generatedAtIso)}
          </p>
        </div>
      </ContentSurfaceCard>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]'>
        <div className='grid gap-4'>
          <ContentMetricCard
            label='Monthly recurring revenue'
            value={formatUsd(metrics.overview.mrrUsd)}
            subtitle={
              <span className='text-[14px] text-secondary-token'>
                {metrics.overview.activeSubscribers.toLocaleString('en-US')}{' '}
                subscribers
              </span>
            }
            headerRight={
              <HudStatusPill label={deploymentLabel} tone={deploymentsTone} />
            }
            className='p-4 sm:p-5'
            labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
            valueClassName='text-[44px] font-[620] leading-none tracking-[-0.045em] sm:text-[56px] lg:text-[72px]'
          />

          <div className='grid gap-4 lg:grid-cols-3'>
            <ContentMetricCard
              label='Runway'
              value={formatRunway(metrics.overview.runwayMonths)}
              subtitle={
                <div className='mt-3 grid gap-2'>
                  <ContentMetricRow
                    label='Cash'
                    value={formatUsd(metrics.overview.balanceUsd)}
                  />
                  <ContentMetricRow
                    label='Burn (30d)'
                    value={formatUsd(metrics.overview.burnRateUsd)}
                  />
                </div>
              }
              className='p-4 sm:p-5'
              labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
              valueClassName='text-[36px] font-[620] leading-none tracking-[-0.04em] sm:text-[42px]'
            />
            <ContentMetricCard
              label='Operations'
              value={
                metrics.operations.status === 'ok' ? 'Healthy' : 'Degraded'
              }
              subtitle={
                metrics.operations.dbLatencyMs === null
                  ? 'DB latency —'
                  : `DB latency ${metrics.operations.dbLatencyMs.toFixed(0)}ms`
              }
              className='p-4 sm:p-5'
              labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
              valueClassName='text-[36px] font-[620] leading-none tracking-[-0.04em] sm:text-[42px]'
            />
            <ContentMetricCard
              label='Reliability'
              value={`${metrics.reliability.errorRatePercent.toFixed(2)}%`}
              subtitle={
                metrics.reliability.p95LatencyMs === null
                  ? 'p95 —'
                  : `p95 ${metrics.reliability.p95LatencyMs.toFixed(0)}ms`
              }
              className='p-4 sm:p-5'
              labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
              valueClassName='text-[36px] font-[620] leading-none tracking-[-0.04em] sm:text-[42px]'
            />
          </div>
        </div>

        <ContentSurfaceCard surface='details' className='space-y-5 p-4 sm:p-5'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='space-y-1'>
              <SectionEyebrow>Open on phone</SectionEyebrow>
              <p className='text-[20px] font-[620] tracking-[-0.03em] text-primary-token'>
                Scan to view
              </p>
              <p className='max-w-[28ch] text-[13px] leading-5 text-secondary-token'>
                Open the live HUD on another device using this kiosk link.
              </p>
            </div>
            <div className='rounded-[12px] border border-subtle bg-surface-0 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
              <QRCode
                data={hudUrl}
                size={196}
                label='HUD link'
                className='rounded-lg bg-white'
              />
            </div>
          </div>

          <div className='border-t border-subtle pt-5'>
            <div className='flex items-center justify-between gap-3'>
              <SectionEyebrow>Deployments</SectionEyebrow>
              <p className='text-[12px] text-secondary-token'>
                {deploymentDetail}
              </p>
            </div>
            {metrics.deployments.recent.length > 0 ? (
              <div className='mt-3 grid gap-2'>
                {metrics.deployments.recent.slice(0, 5).map(run => (
                  <DeploymentRow key={run.id} run={run} />
                ))}
              </div>
            ) : (
              <p className='mt-3 text-[13px] text-secondary-token'>
                No recent runs.
              </p>
            )}
          </div>
        </ContentSurfaceCard>
      </div>

      <ContentSurfaceCard surface='details' className='p-4 sm:p-5'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='space-y-2'>
            <SectionEyebrow>Default status</SectionEyebrow>
            <p className='text-[40px] font-[620] leading-none tracking-[-0.045em] text-primary-token sm:text-[52px]'>
              {metrics.overview.defaultStatus.toUpperCase()}
            </p>
            <p className='max-w-4xl text-[15px] leading-7 text-secondary-token'>
              {metrics.overview.defaultStatusDetail}
            </p>
          </div>
          <HudStatusPill
            label={
              metrics.overview.defaultStatus === 'alive' ? 'Alive' : 'Dead'
            }
            tone={defaultTone}
          />
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
