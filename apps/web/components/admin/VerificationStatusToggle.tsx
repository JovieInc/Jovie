'use client';

import { Check, Loader2, X } from 'lucide-react';
import { useCallback } from 'react';
import type { CreatorVerificationStatus } from '@/components/admin/useCreatorVerification';
import { cn } from '@/lib/utils';

interface VerificationStatusToggleProps
  extends Readonly<{
    readonly isVerified: boolean;
    readonly status: CreatorVerificationStatus;
    readonly onToggle: () => Promise<void> | void;
  }> {}

function getButtonStyles(
  isVerified: boolean,
  isLoading: boolean,
  isSuccess: boolean,
  isError: boolean
) {
  return cn(
    // Base badge-like styles
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
    // Transition effects
    'transition-all duration-200 ease-out',
    // Focus ring
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent',
    // Cursor
    isLoading ? 'cursor-wait' : 'cursor-pointer',
    // Verified state
    isVerified && [
      'bg-accent/10 text-accent',
      'hover:bg-destructive/10 hover:text-destructive',
    ],
    // Not verified state
    !isVerified && [
      'bg-secondary-token/10 text-secondary-token',
      'hover:bg-accent/10 hover:text-accent',
    ],
    // Status animations
    isSuccess && 'animate-pulse ring-1 ring-accent',
    isError && 'ring-1 ring-destructive'
  );
}

function getStatusIcon(
  isLoading: boolean,
  isSuccess: boolean,
  isError: boolean,
  isVerified: boolean
) {
  if (isLoading) {
    return <Loader2 className='h-3 w-3 animate-spin' aria-hidden='true' />;
  }
  if (isSuccess || (isVerified && !isError)) {
    return <Check className='h-3 w-3' aria-hidden='true' />;
  }
  if (isError) {
    return <X className='h-3 w-3' aria-hidden='true' />;
  }
  return null;
}

export function VerificationStatusToggle({
  isVerified,
  status,
  onToggle,
}: Readonly<VerificationStatusToggleProps>) {
  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!isLoading) {
        void onToggle();
      }
    },
    [isLoading, onToggle]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        if (!isLoading) {
          void onToggle();
        }
      }
    },
    [isLoading, onToggle]
  );

  return (
    <button
      type='button'
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={isLoading}
      aria-label={isVerified ? 'Unverify creator' : 'Verify creator'}
      aria-pressed={isVerified}
      className={getButtonStyles(isVerified, isLoading, isSuccess, isError)}
    >
      {getStatusIcon(isLoading, isSuccess, isError, isVerified)}
      <span>{isVerified ? 'Verified' : 'Not verified'}</span>
      {isSuccess && (
        <span className='sr-only' aria-live='polite'>
          Verification updated successfully
        </span>
      )}
      {isError && (
        <span className='sr-only' aria-live='assertive'>
          Failed to update verification
        </span>
      )}
    </button>
  );
}
