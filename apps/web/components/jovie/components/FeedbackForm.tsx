'use client';

import { Button } from '@jovie/ui';
import { CheckCircle2, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useFeedbackMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface FeedbackFormProps {
  readonly onClose: () => void;
}

export function FeedbackForm({ onClose }: FeedbackFormProps) {
  const [feedbackText, setFeedbackText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedbackMutation = useFeedbackMutation();
  const trimmedLength = feedbackText.trim().length;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = feedbackText.trim();
    if (trimmed.length < 5) {
      setErrorMessage('Please write at least 5 characters.');
      return;
    }

    setErrorMessage(null);

    feedbackMutation.mutate(
      {
        message: trimmed,
        source: 'chat',
        pathname:
          globalThis.window === undefined
            ? null
            : globalThis.window.location.pathname,
      },
      {
        onError: () => {
          setErrorMessage('Something went wrong. Please try again.');
        },
      }
    );
  }, [feedbackText, feedbackMutation]);

  if (feedbackMutation.isSuccess) {
    return (
      <div className='mx-auto max-w-md rounded-[12px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-6 text-center'>
        <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-[10px] border border-emerald-500/20 bg-emerald-500/10 text-emerald-500'>
          <CheckCircle2 className='h-5 w-5' />
        </div>
        <div className='mt-4 space-y-1'>
          <p className='text-2xs font-medium tracking-[-0.01em] text-secondary-token'>
            Feedback sent
          </p>
          <p className='text-sm font-medium text-primary-token'>
            Thanks for the note.
          </p>
          <p className='text-xs text-secondary-token'>
            We read every submission and use it to improve Jovie.
          </p>
        </div>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={onClose}
          className='mt-5 rounded-[10px] px-4 text-2xs font-medium tracking-[-0.01em]'
        >
          Back to chat
        </Button>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-md rounded-[12px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-6'>
      <div className='space-y-1'>
        <p className='text-2xs font-medium tracking-[-0.01em] text-secondary-token'>
          Share feedback
        </p>
        <h3 className='text-sm font-semibold text-primary-token'>
          Help shape this workspace
        </h3>
        <p className='text-xs text-secondary-token'>
          Tell us what feels off, what should exist, or what slowed you down.
        </p>
      </div>

      <textarea
        ref={textareaRef}
        value={feedbackText}
        onChange={e => setFeedbackText(e.target.value)}
        placeholder='Your feedback...'
        rows={4}
        maxLength={2000}
        disabled={feedbackMutation.isPending}
        className={cn(
          'mt-4 w-full resize-none rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-3.5 py-3',
          'text-sm text-primary-token placeholder:text-tertiary-token',
          'focus:border-default focus:outline-none',
          'disabled:opacity-50'
        )}
      />

      <div className='mt-3 flex items-center justify-between gap-3 text-xs'>
        <p className={cn(errorMessage ? 'text-error' : 'text-tertiary-token')}>
          {errorMessage ?? 'Include enough detail so we can act on it.'}
        </p>
        <p className='shrink-0 text-tertiary-token'>{trimmedLength}/2000</p>
      </div>

      <div className='mt-5 flex items-center justify-between'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={onClose}
          disabled={feedbackMutation.isPending}
          className='rounded-[10px] px-3 text-2xs font-medium tracking-[-0.01em]'
        >
          Cancel
        </Button>
        <Button
          type='button'
          size='sm'
          onClick={handleSubmit}
          loading={feedbackMutation.isPending}
          disabled={trimmedLength < 5}
          className='rounded-[10px] px-4 text-2xs font-medium tracking-[-0.01em]'
        >
          <Send className='mr-1.5 h-3.5 w-3.5' />
          Submit
        </Button>
      </div>
    </div>
  );
}
