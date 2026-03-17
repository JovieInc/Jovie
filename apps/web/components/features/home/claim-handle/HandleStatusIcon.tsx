'use client';

import { Check, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

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
      <LoadingSpinner size='sm' tone='muted' label='Checking availability' />
    );
  }
  if (!handle) return null;
  if (available === true && !handleError) {
    return (
      <Check
        className='h-4 w-4'
        style={{ color: 'var(--linear-success)' }}
        aria-hidden='true'
      />
    );
  }
  if (unavailable) {
    return (
      <X
        className='h-4 w-4'
        style={{ color: 'var(--linear-error)' }}
        aria-hidden='true'
      />
    );
  }
  return null;
}
