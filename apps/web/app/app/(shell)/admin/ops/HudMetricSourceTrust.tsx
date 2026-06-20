'use client';

import { ExternalLink, RefreshCw } from 'lucide-react';
import { formatSourceFreshness, isSourceStale } from '@/lib/hud/source-trust';
import type { HudMetricSourceTrust as HudMetricSourceTrustType } from '@/types/hud';

const STATE_LABELS = {
  ok: null,
  no_data: 'No data',
  unavailable: 'Fetch failed',
  not_configured: 'Not configured',
} as const;

function getStatusTone(
  source: HudMetricSourceTrustType,
  stale: boolean
): string {
  if (source.state === 'unavailable') return 'text-error';
  if (source.state === 'not_configured') return 'text-warning';
  if (source.state === 'no_data') return 'text-tertiary-token';
  if (stale) return 'text-warning';
  return 'text-tertiary-token';
}

export interface HudMetricSourceTrustProps {
  readonly source: HudMetricSourceTrustType;
  readonly onRetry?: () => void;
}

export function HudMetricSourceTrust({
  source,
  onRetry,
}: Readonly<HudMetricSourceTrustProps>) {
  const stale = isSourceStale(source.fetchedAtIso);
  const statusTone = getStatusTone(source, stale);
  const stateLabel = STATE_LABELS[source.state];
  const showFreshness = source.state === 'ok' || source.state === 'no_data';
  const showReason =
    source.state === 'unavailable' || source.state === 'not_configured';
  const linkLabel = `Open ${source.label}`;

  return (
    <div
      className='mt-2 min-h-[36px] space-y-1'
      data-testid={`hud-source-trust-${source.key}`}
    >
      <div className='flex items-center justify-between gap-2'>
        <p className={`text-2xs leading-4 ${statusTone}`}>
          {showFreshness ? (
            <>
              {stale ? <span className='font-medium'>Stale · </span> : null}
              Updated {formatSourceFreshness(source.fetchedAtIso)}
            </>
          ) : (
            <span className='font-medium'>{stateLabel}</span>
          )}
        </p>
        <div className='flex shrink-0 items-center gap-2'>
          {onRetry && source.state === 'unavailable' ? (
            <button
              type='button'
              onClick={onRetry}
              className='inline-flex items-center gap-1 text-2xs font-medium text-secondary-token transition-colors hover:text-primary-token'
              data-testid={`hud-source-retry-${source.key}`}
            >
              <RefreshCw className='h-3 w-3' aria-hidden='true' />
              Retry
            </button>
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
