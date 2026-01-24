'use client';

import { Badge, Button } from '@jovie/ui';
import { AlertTriangle, Clock, Eye, EyeOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useEndImpersonationMutation,
  useImpersonationQuery,
} from '@/lib/queries';

export interface ImpersonationBannerProps {
  /** Optional callback when impersonation ends */
  onEnd?: () => void;
  /** Optional class name for the banner container */
  className?: string;
}

/**
 * Displays a warning banner when admin is impersonating another user.
 *
 * Features:
 * - Shows target user info and time remaining
 * - Countdown timer updates every second
 * - End impersonation button
 * - Prominent visual indicator to prevent accidental confusion
 */
export function ImpersonationBanner({
  onEnd,
  className = '',
}: ImpersonationBannerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [minimized, setMinimized] = useState(false);

  // TanStack Query for fetching impersonation status
  const {
    data: state,
    isLoading: loading,
    refetch: refetchStatus,
  } = useImpersonationQuery();

  // TanStack Query mutation for ending impersonation
  const { mutate: endImpersonation, isPending: ending } =
    useEndImpersonationMutation();

  // Initialize time remaining from query data
  useEffect(() => {
    if (state?.timeRemainingMs) {
      setTimeRemaining(state.timeRemainingMs);
    }
  }, [state?.timeRemainingMs]);

  // Countdown timer
  useEffect(() => {
    if (!state?.isImpersonating || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          // Session expired - refresh status
          void refetchStatus();
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state?.isImpersonating, timeRemaining, refetchStatus]);

  // End impersonation handler
  const handleEndImpersonation = () => {
    endImpersonation(undefined, {
      onSuccess: () => {
        onEnd?.();
        // Reload page to clear any cached user state
        window.location.reload();
      },
    });
  };

  // Format time remaining
  const formatTimeRemaining = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Don't render if not impersonating or still loading
  if (loading || !state?.isImpersonating) {
    return null;
  }

  // Minimized view
  if (minimized) {
    return (
      <div className={`fixed bottom-4 right-4 z-9999 ${className}`}>
        <Button
          variant='primary'
          size='sm'
          onClick={() => setMinimized(false)}
          className='flex items-center gap-2 bg-amber-500 text-black hover:bg-amber-400'
        >
          <Eye className='size-4' />
          <span>Impersonating</span>
          <Badge variant='warning' className='ml-1'>
            {formatTimeRemaining(timeRemaining)}
          </Badge>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-x-0 top-0 z-9999 border-b-2 border-amber-500 bg-amber-500/95 px-4 py-2 text-black backdrop-blur ${className}`}
      role='alert'
      aria-live='polite'
      data-testid='impersonation-banner'
    >
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-4'>
        {/* Warning indicator */}
        <div className='flex items-center gap-3'>
          <AlertTriangle className='size-5 shrink-0' aria-hidden='true' />
          <div className='flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3'>
            <span className='font-semibold'>Admin Impersonation Active</span>
            <span className='text-sm text-amber-900'>
              Viewing as user:{' '}
              <code className='rounded bg-amber-600/30 px-1 py-0.5 font-mono text-xs'>
                {state.effectiveClerkId?.slice(0, 16)}...
              </code>
            </span>
          </div>
        </div>

        {/* Timer and actions */}
        <div className='flex items-center gap-3'>
          {/* Time remaining */}
          <div className='hidden items-center gap-1.5 text-sm font-medium sm:flex'>
            <Clock className='size-4' aria-hidden='true' />
            <span>{formatTimeRemaining(timeRemaining)}</span>
          </div>

          {/* Minimize button */}
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setMinimized(true)}
            className='text-amber-900 hover:bg-amber-600/30 hover:text-black'
            aria-label='Minimize impersonation banner'
          >
            <EyeOff className='size-4' />
          </Button>

          {/* End impersonation button */}
          <Button
            variant='primary'
            size='sm'
            onClick={handleEndImpersonation}
            disabled={ending}
            className='bg-black text-white hover:bg-gray-800'
          >
            {ending ? (
              'Ending...'
            ) : (
              <>
                <X className='mr-1 size-4' />
                End Session
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
