'use client';

import { Button, Textarea } from '@jovie/ui';
import { CheckCircle2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { FormField } from '@/components/molecules/FormField';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';

interface DashboardFeedbackModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSubmit?: (feedback: string) => void | Promise<void>;
}

export function DashboardFeedbackModal({
  isOpen,
  onClose,
  onSubmit,
}: DashboardFeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!feedback.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Call optional submit handler (extracted from component)
      if (onSubmit) {
        await onSubmit(feedback.trim());
      }

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
  }, [feedback, isSubmitting, onClose, onSubmit]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
    setTimeout(() => {
      setFeedback('');
      setIsSubmitted(false);
    }, 300);
  }, [isSubmitting, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <Dialog open={isOpen} onClose={handleClose} size='sm' hideClose>
      {isSubmitted ? (
        <div className='px-6 py-8 text-center bg-surface-1'>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success'>
            <CheckCircle2 className='h-6 w-6' aria-hidden='true' />
          </div>
          <DialogTitle className='mt-4 text-balance text-lg font-semibold text-primary-token'>
            Thank you!
          </DialogTitle>
          <DialogDescription className='mt-2 text-sm text-secondary-token'>
            Your note has been delivered to the team. Thank you for helping us
            make Jovie feel effortlessly better.
          </DialogDescription>
        </div>
      ) : (
        <>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <DialogTitle className='text-balance'>Send feedback</DialogTitle>
              <DialogDescription className='mt-1 text-sm text-secondary-token'>
                Tell us where the experience feels delightful, where it falls
                short, or what you'd love us to build next.
              </DialogDescription>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={handleClose}
              disabled={isSubmitting}
              className='-mr-2 -mt-2 text-secondary-token hover:text-primary-token'
            >
              <X className='h-4 w-4' aria-hidden='true' />
              <span className='sr-only'>Close</span>
            </Button>
          </div>

          <DialogBody className='space-y-4'>
            <FormField
              label='What should we improve next?'
              required
              helpText='Press ⌘ + Enter to send instantly'
            >
              <Textarea
                value={feedback}
                onChange={event => setFeedback(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Share what feels great, what slows you down, or the next capability you want to unlock.'
                rows={5}
                autoFocus
                className='bg-surface-1 border-subtle text-primary-token placeholder:text-secondary-token'
              />
            </FormField>
          </DialogBody>

          <DialogActions className='mt-6'>
            <Button
              type='button'
              variant='ghost'
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type='button'
              onClick={handleSubmit}
              disabled={!feedback.trim() || isSubmitting}
              loading={isSubmitting}
              className='font-medium'
            >
              Send feedback
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
