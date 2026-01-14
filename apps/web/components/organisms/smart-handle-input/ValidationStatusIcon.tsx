'use client';

import { Icon } from '@/components/atoms/Icon';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

interface ValidationStatusIconProps {
  showAvailability: boolean;
  checking: boolean;
  available: boolean;
  clientValid: boolean;
  hasError: boolean;
}

export function ValidationStatusIcon({
  showAvailability,
  checking,
  available,
  clientValid,
  hasError,
}: ValidationStatusIconProps) {
  if (!showAvailability) return null;

  if (checking) {
    return <LoadingSpinner size='sm' tone='muted' />;
  }

  if (available && clientValid) {
    return (
      <span
        aria-hidden
        className='flex size-4 items-center justify-center rounded-full bg-surface-2 text-(--accent-speed)'
      >
        <Icon name='Check' className='size-3' strokeWidth={2.5} />
      </span>
    );
  }

  if (hasError || !clientValid) {
    return (
      <span
        aria-hidden
        className='flex size-4 items-center justify-center rounded-full bg-surface-2 text-destructive'
      >
        <Icon name='X' className='size-3' strokeWidth={2.5} />
      </span>
    );
  }

  return null;
}
