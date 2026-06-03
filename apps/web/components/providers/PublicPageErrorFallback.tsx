'use client';

import { useEffect } from 'react';
import {
  JOVIE_ICON_PATH,
  JOVIE_ICON_VIEW_BOX,
} from '@/components/atoms/jovie-icon-path';
import { captureErrorInSentry } from '@/lib/errors/capture';

interface PublicPageErrorFallbackProps {
  readonly error: Error & { digest?: string };
  readonly context: string;
  readonly onRefresh?: () => void;
}

export function PublicPageErrorFallback({
  error,
  context,
  onRefresh = () => globalThis.location.reload(),
}: PublicPageErrorFallbackProps) {
  useEffect(() => {
    console.error(`[${context} Error]`, error);
    captureErrorInSentry(error, context, { digest: error.digest });
  }, [context, error]);

  return (
    <div
      className='dark flex min-h-dvh items-center justify-center bg-base px-6 text-primary-token'
      role='alert'
      aria-live='assertive'
    >
      <div className='flex w-full max-w-xs flex-col items-center text-center'>
        <svg
          viewBox={JOVIE_ICON_VIEW_BOX}
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
          className='h-8 w-8'
        >
          <path fill='currentColor' d={JOVIE_ICON_PATH} />
        </svg>
        <h1 className='mt-5 text-lg font-semibold leading-snug tracking-normal'>
          Something Went Wrong
        </h1>
        <p className='mt-2 text-sm leading-normal text-tertiary-token'>
          Try refreshing the page.
        </p>
        <button
          type='button'
          className='focus-ring-transparent-offset mt-6 inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-btn-primary px-4 text-sm font-medium text-btn-primary-foreground transition-opacity duration-subtle hover:opacity-95'
          onClick={onRefresh}
        >
          Refresh
        </button>
        {error.digest ? (
          <p className='mt-5 text-xs text-quaternary-token'>
            Error ID {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
