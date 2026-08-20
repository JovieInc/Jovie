'use client';

import { Button } from '@jovie/ui';
import { RefreshCw } from 'lucide-react';
import {
  HUD_OBSERVATION_LABELS,
  type HudObservationState,
} from '@/lib/hud/observation';

const TONE_CLASS: Record<HudObservationState, string> = {
  loading: 'text-tertiary-token',
  fresh: 'text-tertiary-token',
  stale: 'text-warning',
  empty: 'text-secondary-token',
  unavailable: 'text-error',
  not_configured: 'text-warning',
};

export interface HudObservationStatusProps {
  readonly state: HudObservationState;
  readonly message: string;
  readonly freshnessLabel?: string | null;
  readonly onRetry?: () => void;
  readonly testId?: string;
}

export function HudObservationStatus({
  state,
  message,
  freshnessLabel = null,
  onRetry,
  testId = 'hud-observation-status',
}: Readonly<HudObservationStatusProps>) {
  const showRetry =
    Boolean(onRetry) && (state === 'unavailable' || state === 'stale');

  return (
    <div className='min-h-9 space-y-1' data-testid={testId} data-state={state}>
      <div className='flex items-center justify-between gap-2'>
        <p className={`text-2xs leading-4 ${TONE_CLASS[state]}`}>
          <span className='font-medium'>{HUD_OBSERVATION_LABELS[state]}</span>
          {freshnessLabel ? <span> · {freshnessLabel}</span> : null}
        </p>
        {showRetry ? (
          <Button
            type='button'
            variant='link'
            size='sm'
            onClick={onRetry}
            className='inline-flex items-center gap-1 text-2xs font-medium text-secondary-token transition-colors hover:text-primary-token'
            data-testid={`${testId}-retry`}
          >
            <RefreshCw className='h-3 w-3' aria-hidden='true' />
            Retry
          </Button>
        ) : null}
      </div>
      <p className='text-app leading-5 text-secondary-token'>{message}</p>
    </div>
  );
}
