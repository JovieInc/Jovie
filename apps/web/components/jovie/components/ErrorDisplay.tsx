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
      className='rounded-[20px] border border-subtle bg-surface-1/95 p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.9)]'
    >
      <div className='flex items-start gap-3'>
        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-error/20 bg-error-subtle text-error'>
          <ErrorIcon className='h-4.5 w-4.5' />
        </div>
        <div className='min-w-0 flex-1 space-y-3'>
          <div className='space-y-1'>
            <p className='text-[11px] font-semibold uppercase tracking-[0.16em] text-error'>
              Chat interrupted
            </p>
            <p className='text-sm font-medium text-primary-token'>
              {chatError.message}
            </p>
            <p className='text-xs text-secondary-token'>
              {getNextStepMessage(chatError.type)}
            </p>
          </div>

          {supportCode && (
            <div className='flex flex-wrap items-center gap-2 rounded-2xl border border-subtle bg-surface-2/70 px-3 py-2 text-xs text-tertiary-token'>
              <span className='text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary-token'>
                Reference
              </span>
              <span className='font-mono text-primary-token'>
                {supportCode}
              </span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  void handleCopySupportCode();
                }}
                className='ml-auto h-7 gap-1 rounded-full px-2.5 text-[11px] font-medium uppercase tracking-[0.12em]'
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
              className='h-9 gap-2 rounded-full px-4 text-[11px] font-medium uppercase tracking-[0.12em]'
            >
              <RefreshCw className='h-3.5 w-3.5' />
              Retry message
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
