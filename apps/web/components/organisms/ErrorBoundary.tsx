'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorDetails } from '@/components/feedback/ErrorDetails';
import { captureErrorInSentry } from '@/lib/errors/capture';

interface ErrorBoundaryProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
  readonly context: string;
  readonly message?: string;
}

export default function ErrorBoundary({
  error,
  reset,
  context,
  message = 'We encountered an error loading this page. Please try again.',
}: ErrorBoundaryProps) {
  const router = useRouter();

  useEffect(() => {
    console.error(`[${context} Error]`, error);
    captureErrorInSentry(error, context.toLowerCase(), {
      digest: error.digest,
    });
  }, [error, context]);

  return (
    <div
      className='flex flex-1 flex-col items-center justify-center px-4 py-12 text-center'
      role='alert'
      aria-live='polite'
    >
      <div className='w-full max-w-sm space-y-4'>
        <div className='flex justify-center'>
          <div className='flex h-10 w-10 items-center justify-center text-destructive'>
            <AlertTriangle className='h-6 w-6' aria-hidden='true' />
          </div>
        </div>

        <div className='space-y-1.5'>
          <h3 className='text-sm font-medium text-secondary-token'>
            Something went wrong
          </h3>
          <p className='text-[13px] text-tertiary-token'>{message}</p>
        </div>

        <div className='flex justify-center gap-3'>
          <Button variant='primary' size='sm' onClick={reset}>
            Try again
          </Button>
          <Button variant='outline' size='sm' onClick={() => router.push('/')}>
            Go home
          </Button>
        </div>

        <ErrorDetails error={error} extraContext={{ Context: context }} />
      </div>
    </div>
  );
}
