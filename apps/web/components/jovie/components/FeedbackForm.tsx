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
      <div className='mx-auto max-w-md space-y-4 rounded-xl border border-subtle bg-surface-1 p-6 text-center'>
        <CheckCircle2 className='mx-auto h-8 w-8 text-green-500' />
        <p className='text-sm font-medium text-primary-token'>
          Thanks for your feedback!
        </p>
        <p className='text-xs text-secondary-token'>
          We read every submission and use it to improve Jovie.
        </p>
        <Button type='button' variant='secondary' size='sm' onClick={onClose}>
          Back to chat
        </Button>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-md space-y-4 rounded-xl border border-subtle bg-surface-1 p-6'>
      <div>
        <h3 className='text-sm font-semibold text-primary-token'>
          Share feedback
        </h3>
        <p className='mt-1 text-xs text-secondary-token'>
          Tell us what you think. Bug reports, feature requests, or anything
          else.
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
          'w-full resize-none rounded-lg border border-subtle bg-surface-2 px-3 py-2.5',
          'text-sm text-primary-token placeholder:text-tertiary-token',
          'focus:border-default focus:outline-none',
          'disabled:opacity-50'
        )}
      />

      {errorMessage && <p className='text-xs text-red-400'>{errorMessage}</p>}

      <div className='flex items-center justify-between'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={onClose}
          disabled={feedbackMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          type='button'
          size='sm'
          onClick={handleSubmit}
          loading={feedbackMutation.isPending}
          disabled={feedbackText.trim().length < 5}
        >
          <Send className='mr-1.5 h-3.5 w-3.5' />
          Submit
        </Button>
      </div>
    </div>
  );
}
