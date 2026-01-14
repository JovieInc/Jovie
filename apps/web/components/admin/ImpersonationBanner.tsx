'use client';

import { Badge, Button } from '@jovie/ui';
import { AlertTriangle, Clock, Eye, EyeOff, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ImpersonationState {
  enabled: boolean;
  isImpersonating: boolean;
  effectiveClerkId?: string;
  effectiveDbId?: string;
  realAdminClerkId?: string;
  timeRemainingMs?: number;
  timeRemainingMinutes?: number;
  expiresAt?: number;
}

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
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [minimized, setMinimized] = useState(false);

  // Fetch impersonation status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/impersonate');
      if (response.ok) {
        const data = await response.json();
        setState(data);
        if (data.timeRemainingMs) {
          setTimeRemaining(data.timeRemainingMs);
        }
      }
    } catch (error) {
      console.error('Failed to fetch impersonation status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Countdown timer
  useEffect(() => {
    if (!state?.isImpersonating || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          // Session expired - refresh status
          void fetchStatus();
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state?.isImpersonating, timeRemaining, fetchStatus]);

  // End impersonation handler
  const handleEndImpersonation = async () => {
    setEnding(true);
    try {
      const response = await fetch('/api/admin/impersonate', {
        method: 'DELETE',
      });

      if (response.ok) {
        setState(prev => (prev ? { ...prev, isImpersonating: false } : null));
        onEnd?.();
        // Reload page to clear any cached user state
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to end impersonation:', error);
    } finally {
      setEnding(false);
    }
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
