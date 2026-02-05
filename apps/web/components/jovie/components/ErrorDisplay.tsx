'use client';

import { Button } from '@jovie/ui';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

import type { ChatError } from '../types';
import { getNextStepMessage } from '../utils';

interface ErrorDisplayProps {
  readonly chatError: ChatError;
  readonly onRetry: () => void;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
}

export function ErrorDisplay({
  chatError,
  onRetry,
  isLoading,
  isSubmitting,
}: ErrorDisplayProps) {
  const ErrorIcon = chatError.type === 'network' ? WifiOff : AlertCircle;

  return (
    <div className='flex items-start gap-3 rounded-xl border border-error/20 bg-error-subtle p-4'>
      <ErrorIcon className='mt-0.5 h-5 w-5 shrink-0 text-error' />
      <div className='flex-1 space-y-2'>
        <div>
          <p className='text-sm font-medium text-primary-token'>
            {chatError.message}
          </p>
          <p className='mt-1 text-xs text-secondary-token'>
            {getNextStepMessage(chatError.type)}
            {chatError.errorCode && (
              <span className='ml-2 font-mono text-tertiary-token'>
                ({chatError.errorCode})
              </span>
            )}
          </p>
        </div>
        {chatError.failedMessage && !chatError.retryAfter && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={onRetry}
            disabled={isLoading || isSubmitting}
            className='h-8 gap-2'
          >
            <RefreshCw className='h-3.5 w-3.5' />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
