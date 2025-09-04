'use client';

import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment, useCallback, useState } from 'react';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!feedback.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Track feedback submission with PostHog
      track('feedback_submitted', {
        feedback: feedback.trim(),
        source: 'dashboard_sidebar',
        method: 'custom_modal',
        character_count: feedback.trim().length,
      });

      // Show success state
      setIsSubmitted(true);

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
        // Reset state after modal closes
        setTimeout(() => {
          setFeedback('');
          setIsSubmitted(false);
        }, 300);
      }, 2000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      // Still show success to user, but log the error
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
    // Reset state after modal closes
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

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as='div' className='relative z-50' onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter='ease-out duration-300'
          enterFrom='opacity-0'
          enterTo='opacity-100'
          leave='ease-in duration-200'
          leaveFrom='opacity-100'
          leaveTo='opacity-0'
        >
          <div className='fixed inset-0 bg-black/25 backdrop-blur-sm' />
        </Transition.Child>

        <div className='fixed inset-0 overflow-y-auto'>
          <div className='flex min-h-full items-center justify-center p-4 text-center'>
            <Transition.Child
              as={Fragment}
              enter='ease-out duration-300'
              enterFrom='opacity-0 scale-95'
              enterTo='opacity-100 scale-100'
              leave='ease-in duration-200'
              leaveFrom='opacity-100 scale-100'
              leaveTo='opacity-0 scale-95'
            >
              <Dialog.Panel className='w-full max-w-md transform overflow-hidden rounded-lg bg-surface-0 border border-subtle shadow-xl transition-all'>
                {isSubmitted ? (
                  // Success State
                  <div className='px-6 py-8 text-center'>
                    <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20 mb-4'>
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
                    <Dialog.Title
                      as='h3'
                      className='text-lg font-semibold text-primary-token mb-2'
                    >
                      Thank you!
                    </Dialog.Title>
                    <p className='text-sm text-secondary-token'>
                      Your feedback has been sent. We appreciate you taking the
                      time to help us improve Jovie.
                    </p>
                  </div>
                ) : (
                  // Feedback Form
                  <>
                    <div className='flex items-center justify-between px-6 py-4 border-b border-subtle'>
                      <Dialog.Title
                        as='h3'
                        className='text-lg font-semibold text-primary-token'
                      >
                        Send Feedback
                      </Dialog.Title>
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
                          htmlFor='feedback'
                          className='block text-sm font-medium text-primary-token mb-2'
                        >
                          What can we do to improve Jovie?
                        </label>
                        <textarea
                          id='feedback'
                          name='feedback'
                          rows={4}
                          className={cn(
                            'block w-full rounded-md border border-subtle bg-surface-0',
                            'px-3 py-2 text-sm text-primary-token placeholder-secondary-token',
                            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1',
                            'resize-none transition-colors'
                          )}
                          placeholder="Tell us about your experience, what you'd like to see improved, or any issues you've encountered..."
                          value={feedback}
                          onChange={e => setFeedback(e.target.value)}
                          onKeyDown={handleKeyDown}
                          autoFocus
                        />
                        <p className='mt-2 text-xs text-secondary-token'>
                          Press{' '}
                          <kbd className='px-1 py-0.5 text-xs font-semibold bg-surface-2 border border-subtle rounded'>
                            ⌘
                          </kbd>{' '}
                          +{' '}
                          <kbd className='px-1 py-0.5 text-xs font-semibold bg-surface-2 border border-subtle rounded'>
                            Enter
                          </kbd>{' '}
                          to send
                        </p>
                      </div>
                    </div>

                    <div className='flex items-center justify-end gap-3 px-6 py-4 bg-surface-1 border-t border-subtle'>
                      <button
                        type='button'
                        className='px-4 py-2 text-sm font-medium text-secondary-token hover:text-primary-token hover:bg-surface-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                        onClick={handleClose}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type='button'
                        className={cn(
                          'px-4 py-2 text-sm font-medium text-white rounded-md transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
                          feedback.trim() && !isSubmitting
                            ? 'bg-accent hover:bg-accent/90'
                            : 'bg-surface-3 cursor-not-allowed'
                        )}
                        onClick={handleSubmit}
                        disabled={!feedback.trim() || isSubmitting}
                      >
                        {isSubmitting ? (
                          <span className='flex items-center gap-2'>
                            <svg
                              className='animate-spin -ml-1 mr-2 h-4 w-4 text-white'
                              fill='none'
                              viewBox='0 0 24 24'
                            >
                              <circle
                                className='opacity-25'
                                cx='12'
                                cy='12'
                                r='10'
                                stroke='currentColor'
                                strokeWidth='4'
                              ></circle>
                              <path
                                className='opacity-75'
                                fill='currentColor'
                                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                              ></path>
                            </svg>
                            Sending...
                          </span>
                        ) : (
                          'Send Feedback'
                        )}
                      </button>
                    </div>
                  </>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
