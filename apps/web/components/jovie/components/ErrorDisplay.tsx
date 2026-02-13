'use client';

import { Button } from '@jovie/ui';
import { AlertCircle, Copy, RefreshCw, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';

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
  const [copied, setCopied] = useState(false);

  const supportCode = useMemo(() => {
    if (!chatError.requestId && !chatError.errorCode) return null;
    return [chatError.errorCode, chatError.requestId]
      .filter(Boolean)
      .join(' · ');
  }, [chatError.errorCode, chatError.requestId]);

  const handleCopySupportCode = async () => {
    if (!supportCode || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(supportCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail (permissions denied, non-secure context)
    }
  };

  return (
    <div
      role='alert'
      aria-live='assertive'
      aria-atomic='true'
      className='flex items-start gap-3 rounded-xl border border-error/20 bg-error-subtle p-4'
    >
      <ErrorIcon className='mt-0.5 h-5 w-5 shrink-0 text-error' />
      <div className='flex-1 space-y-2'>
        <div>
          <p className='text-sm font-medium text-primary-token'>
            {chatError.message}
          </p>
          <p className='mt-1 text-xs text-secondary-token'>
            {getNextStepMessage(chatError.type)}
          </p>
        </div>

        {supportCode && (
          <div className='flex items-center gap-2 text-xs text-tertiary-token'>
            <span className='font-mono'>Ref: {supportCode}</span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                void handleCopySupportCode();
              }}
              className='h-7 gap-1 px-2 text-xs'
              aria-label='Copy support reference'
            >
              <Copy className='h-3 w-3' />
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}

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
