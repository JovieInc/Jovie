'use client';

import { Spinner as LoadingSpinner } from '@jovie/ui';
import { Check, X } from 'lucide-react';

interface HandleStatusIconProps {
  readonly showChecking: boolean;
  readonly handle: string;
  readonly available: boolean | null;
  readonly handleError: string | null;
  readonly unavailable: boolean;
}

export function HandleStatusIcon({
  showChecking,
  handle,
  available,
  handleError,
  unavailable,
}: HandleStatusIconProps) {
  if (showChecking) {
    return (
      <LoadingSpinner size='sm' tone='muted' label='Checking Availability' />
    );
  }
  if (!handle) return null;
  if (available === true && !handleError) {
    return <Check className='h-4 w-4 text-success' aria-hidden='true' />;
  }
  if (unavailable) {
    return <X className='h-4 w-4 text-error' aria-hidden='true' />;
  }
  return null;
}
