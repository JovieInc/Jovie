'use client';

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
      <div
        className='h-4 w-4 animate-spin rounded-full border-[1.5px] border-t-transparent motion-reduce:animate-none'
        style={{
          borderColor: 'var(--linear-text-tertiary)',
          borderTopColor: 'transparent',
        }}
      />
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
        style={{ color: 'oklch(65% 0.18 25)' }}
        aria-hidden='true'
      />
    );
  }
  return null;
}
