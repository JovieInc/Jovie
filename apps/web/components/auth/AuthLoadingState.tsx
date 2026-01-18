'use client';

import { Card, CardContent } from '@jovie/ui';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

type AuthMode = 'signin' | 'signup';

interface AuthLoadingStateProps {
  mode: AuthMode;
  isStalled: boolean;
}

const modeLabels: Record<AuthMode, { loading: string; stall: string }> = {
  signin: {
    loading: 'Loading sign-in',
    stall: 'sign-in is taking longer than usual',
  },
  signup: {
    loading: 'Loading sign-up',
    stall: 'sign-up is taking longer than usual',
  },
};

/**
 * Shared loading state component for auth forms.
 * Displays a skeleton UI while Clerk initializes, with a stall message
 * if loading takes longer than expected.
 */
export function AuthLoadingState({ mode, isStalled }: AuthLoadingStateProps) {
  const labels = modeLabels[mode];

  return (
    <Card className='shadow-none border-0 bg-transparent p-0'>
      <CardContent className='space-y-3 p-0'>
        <div className='space-y-4'>
          <div className='flex items-center justify-center gap-3 text-sm text-secondary-token'>
            <LoadingSpinner size='sm' tone='muted' />
            <span>{labels.loading}</span>
          </div>
          <div className='animate-pulse space-y-4'>
            <div className='h-6 w-48 mx-auto bg-subtle rounded' />
            <div className='h-12 w-full bg-subtle rounded-[--radius-xl]' />
            <div className='h-12 w-full bg-subtle rounded-[--radius-xl]' />
            <div className='h-12 w-full bg-subtle rounded-[--radius-xl]' />
          </div>
          {isStalled ? (
            <output
              aria-live='polite'
              className='block rounded-[--radius-xl] border border-subtle bg-surface-0 px-4 py-3 text-[13px] text-secondary-token text-center'
            >
              <p>Hang tight — {labels.stall}.</p>
              <p className='mt-2'>Refresh the page or try again in a minute.</p>
              <button
                type='button'
                className='mt-3 inline-flex items-center justify-center rounded-[--radius-xl] border border-subtle px-3 py-1.5 text-[13px] font-medium text-primary-token hover:bg-surface-1 transition-colors'
                onClick={() => window.location.reload()}
              >
                Retry now
              </button>
            </output>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
