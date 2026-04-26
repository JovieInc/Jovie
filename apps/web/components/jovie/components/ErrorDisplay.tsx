'use client';

import { Button } from '@jovie/ui';
import { AlertCircle, Copy, RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

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
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail (permissions denied, non-secure context)
    }
  };

  return (
    <div
      role='alert'
      aria-live='assertive'
      aria-atomic='true'
      className='rounded-[12px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-4'
    >
      <div className='flex items-start gap-3'>
        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-error/20 bg-error-subtle text-error'>
          <ErrorIcon className='h-4.5 w-4.5' />
        </div>
        <div className='min-w-0 flex-1 space-y-3'>
          <div className='space-y-1'>
            <p className='text-2xs font-semibold uppercase tracking-[0.16em] text-error'>
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
            <div className='flex flex-wrap items-center gap-2 rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-2 text-xs text-tertiary-token'>
              <span className='text-[10px] font-medium tracking-[-0.01em] text-secondary-token'>
                Reference
              </span>
              <span className='font-mono text-primary-token'>
                {supportCode}
              </span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={handleCopySupportCode}
                className='ml-auto h-7 gap-1 rounded-[8px] px-2.5 text-2xs font-medium tracking-[-0.01em]'
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
              className='h-9 gap-2 rounded-[10px] px-4 text-2xs font-medium tracking-[-0.01em]'
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
