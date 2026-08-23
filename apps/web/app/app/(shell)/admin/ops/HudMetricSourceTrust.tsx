'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  formatSourceFreshness,
  getSourceFreshnessState,
} from '@/lib/hud/source-trust';
import type { HudMetricSourceTrust as HudMetricSourceTrustType } from '@/types/hud';

const STATE_LABELS = {
  ok: null,
  degraded: 'Degraded',
  unauthorized: 'Unauthorized',
  no_data: 'No data',
  unavailable: 'Fetch failed',
  not_configured: 'Not configured',
} as const;

function getStatusTone(
  source: HudMetricSourceTrustType,
  stale: boolean
): string {
  if (source.state === 'unavailable') return 'text-error';
  if (source.state === 'unauthorized') return 'text-error';
  if (source.state === 'degraded') return 'text-warning';
  if (source.state === 'not_configured') return 'text-warning';
  if (source.state === 'no_data') return 'text-tertiary-token';
  if (stale) return 'text-warning';
  return 'text-tertiary-token';
}

export interface HudMetricSourceTrustProps {
  readonly source: HudMetricSourceTrustType;
  readonly onRetry?: () => void;
}

function freshnessStatus(
  source: HudMetricSourceTrustType,
  stale: boolean,
  timestampUnknown: boolean
): ReactNode {
  if (
    timestampUnknown &&
    (source.state === 'ok' || source.state === 'no_data')
  ) {
    return <span className='font-medium'>Timestamp unknown</span>;
  }
  if (source.state === 'ok' || source.state === 'no_data') {
    return (
      <>
        {stale ? <span className='font-medium'>Stale · </span> : null}
        Updated {formatSourceFreshness(source.fetchedAtIso)}
      </>
    );
  }
  return <span className='font-medium'>{STATE_LABELS[source.state]}</span>;
}

export function HudMetricSourceTrust({
  source,
  onRetry,
}: Readonly<HudMetricSourceTrustProps>) {
  const freshnessState = getSourceFreshnessState(source.fetchedAtIso);
  const stale = freshnessState === 'stale';
  const timestampUnknown = freshnessState === 'unknown';
  const statusTone = getStatusTone(source, stale || timestampUnknown);
  const showReason =
    source.state === 'unavailable' ||
    source.state === 'unauthorized' ||
    source.state === 'not_configured' ||
    source.state === 'degraded';
  const linkLabel = `Open ${source.label}`;

  return (
    <div
      className='mt-2 min-h-9 space-y-1'
      data-testid={`hud-source-trust-${source.key}`}
    >
      <div className='flex items-center justify-between gap-2'>
        <p className={`text-2xs leading-4 ${statusTone}`}>
          {freshnessStatus(source, stale, timestampUnknown)}
        </p>
        <div className='flex shrink-0 items-center gap-2'>
          {onRetry &&
          (source.state === 'unavailable' ||
            source.state === 'unauthorized' ||
            source.state === 'degraded' ||
            timestampUnknown ||
            stale) ? (
            <Button
              type='button'
              variant='link'
              size='sm'
              onClick={onRetry}
              className='inline-flex items-center gap-1 text-2xs font-medium text-secondary-token transition-colors hover:text-primary-token'
              data-testid={`hud-source-retry-${source.key}`}
            >
              <RefreshCw className='h-3 w-3' aria-hidden='true' />
              Retry
            </Button>
          ) : null}
          {source.dashboardUrl ? (
            <a
              href={source.dashboardUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 text-2xs font-medium text-secondary-token transition-colors hover:text-primary-token'
              data-testid={`hud-source-link-${source.key}`}
            >
              {linkLabel}
              <ExternalLink className='h-3 w-3' aria-hidden='true' />
            </a>
          ) : null}
        </div>
      </div>
      {showReason && source.errorMessage ? (
        <p className='text-2xs leading-4 text-secondary-token'>
          {source.errorMessage}
        </p>
      ) : null}
      {source.nextStep ? (
        <p className='text-2xs leading-4 text-secondary-token'>
          {source.nextStep}
        </p>
      ) : null}
    </div>
  );
}
