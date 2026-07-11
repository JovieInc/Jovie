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

  const isToolScopedFailure =
    chatError.type === 'tool' || chatError.suppressComposerPause === true;
  const headline = isToolScopedFailure
    ? 'Action could not finish'
    : 'Message paused';

  return (
    <div
      role='alert'
      aria-live='assertive'
      aria-atomic='true'
      className='w-full text-primary-token'
    >
      <div className='flex items-start gap-2.5 py-1.5'>
        <div className='mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-error'>
          <ErrorIcon className='size-4' strokeWidth={2.25} />
        </div>
        <div className='min-w-0 flex-1'>
          <div>
            <p className='text-app font-medium leading-5 text-primary-token'>
              {headline}
            </p>
            <p className='text-xs leading-5 text-secondary-token'>
              {chatError.message}
            </p>
            <p className='text-xs leading-5 text-tertiary-token'>
              {getNextStepMessage(chatError.type, chatError.errorCode)}
            </p>
          </div>

          {supportCode && (
            <div className='mt-1 flex flex-wrap items-center gap-2 text-xs text-tertiary-token'>
              <span className='text-2xs font-medium tracking-tight text-secondary-token'>
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
                className='h-7 gap-1 rounded-lg px-2 text-2xs font-medium tracking-tight'
                aria-label='Copy Support Reference'
              >
                <Copy className='size-3' />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}

          {!isToolScopedFailure &&
            chatError.failedMessage &&
            !chatError.retryAfter && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={onRetry}
                disabled={isLoading || isSubmitting}
                className='mt-2 h-7 gap-1.5 rounded-lg px-2 text-2xs font-medium tracking-tight text-error hover:bg-error/10 hover:text-error'
              >
                <RefreshCw className='size-3.5' />
                Retry Message
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}
