'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  id?: string;
}

export function FeedbackModal({
  isOpen,
  onClose,
  id = 'feedback-modal',
}: FeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!feedback.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      track('feedback_submitted', {
        feedback: feedback.trim(),
        source: 'dashboard_sidebar',
        method: 'custom_modal',
        character_count: feedback.trim().length,
      });

      setIsSubmitted(true);

      setTimeout(() => {
        onClose();
        setTimeout(() => {
          setFeedback('');
          setIsSubmitted(false);
        }, 300);
      }, 2000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setIsSubmitted(true);
      setTimeout(() => {
        onClose();
        setTimeout(() => {
          setFeedback('');
          setIsSubmitted(false);
        }, 300);
      }, 2000);
    } finally {
      setIsSubmitting(false);
    }
  }, [feedback, isSubmitting, onClose]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
    setTimeout(() => {
      setFeedback('');
      setIsSubmitted(false);
    }, 300);
  }, [isSubmitting, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleOpenChange = (open: boolean) => {
    if (!open) handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className='w-full max-w-md overflow-hidden rounded-lg bg-surface-0 border border-subtle shadow-xl'
        id={id}
      >
        {isSubmitted ? (
          <div className='px-6 py-8 text-center'>
            <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20'>
              <svg
                className='h-6 w-6 text-green-600 dark:text-green-400'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={2}
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M5 13l4 4L19 7'
                />
              </svg>
            </div>
            <DialogHeader>
              <DialogTitle className='mb-2 text-lg font-semibold text-primary-token'>
                Thank you!
              </DialogTitle>
              <DialogDescription>
                Your feedback has been sent. We appreciate you taking the time
                to help us improve Jovie.
              </DialogDescription>
            </DialogHeader>
          </div>
        ) : (
          <>
            <div className='flex items-center justify-between border-b border-subtle px-6 py-4'>
              <DialogHeader className='p-0'>
                <DialogTitle className='text-lg font-semibold text-primary-token'>
                  Send Feedback
                </DialogTitle>
              </DialogHeader>
              <button
                type='button'
                className='rounded-md p-1 text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                onClick={handleClose}
              >
                <span className='sr-only'>Close</span>
                <XMarkIcon className='h-5 w-5' aria-hidden='true' />
              </button>
            </div>

            <div className='px-6 py-4'>
              <div className='mb-4'>
                <label
                  htmlFor='feedback-textarea'
                  className='mb-2 block text-sm font-medium text-primary-token'
                >
                  Your feedback
                </label>
                <textarea
                  id='feedback-textarea'
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='Share your thoughts...'
                  className='w-full rounded-md border border-subtle bg-transparent p-2 text-sm text-primary-token placeholder:text-secondary-token focus:outline-none focus:ring-2 focus:ring-accent'
                  rows={4}
                  maxLength={500}
                  disabled={isSubmitting}
                />
                <p className='mt-1 text-xs text-secondary-token'>
                  {feedback.length}/500 characters
                </p>
                {feedback.length >= 500 && (
                  <p className='mt-1 text-xs text-red-500'>
                    Maximum character limit reached
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className='items-center justify-between border-t border-subtle bg-surface-1 px-6 py-4'>
              <p className='text-xs text-secondary-token'>
                Press <kbd className='px-1 text-xs'>⌘</kbd>+
                <kbd className='px-1 text-xs'>Enter</kbd> to send
              </p>
              <div className='flex space-x-2'>
                <button
                  type='button'
                  className={cn(
                    'btn btn-secondary btn-sm',
                    isSubmitting && 'cursor-not-allowed opacity-50'
                  )}
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type='button'
                  className={cn(
                    'btn btn-primary btn-sm',
                    (!feedback.trim() || isSubmitting) &&
                      'cursor-not-allowed opacity-50'
                  )}
                  onClick={handleSubmit}
                  disabled={!feedback.trim() || isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
