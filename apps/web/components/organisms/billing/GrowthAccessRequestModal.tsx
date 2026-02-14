'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@jovie/ui';
import { CheckCircle, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { track } from '@/lib/analytics';
import { useGrowthAccessRequestMutation } from '@/lib/queries';

interface GrowthAccessRequestModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function GrowthAccessRequestModal({
  open,
  onOpenChange,
}: GrowthAccessRequestModalProps) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const mutation = useGrowthAccessRequestMutation();

  const handleSubmit = useCallback(() => {
    if (!reason.trim()) return;

    track('growth_access_requested', {
      reason_length: reason.trim().length,
    });

    mutation.mutate(
      { reason: reason.trim() },
      {
        onSuccess: () => {
          setSubmitted(true);
          track('growth_access_request_success');
        },
      }
    );
  }, [reason, mutation]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Reset state when closing
        setReason('');
        setSubmitted(false);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-md'>
        {submitted ? (
          <>
            <DialogHeader>
              <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30'>
                <CheckCircle className='h-6 w-6 text-emerald-600 dark:text-emerald-400' />
              </div>
              <DialogTitle className='text-center'>
                Request received
              </DialogTitle>
              <DialogDescription className='text-center'>
                We&apos;ll review your request and reach out soon to learn more
                about your needs.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant='secondary'
                className='w-full'
                onClick={() => handleClose(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30'>
                <Sparkles className='h-6 w-6 text-purple-600 dark:text-purple-400' />
              </div>
              <DialogTitle className='text-center'>
                Growth is in early access
              </DialogTitle>
              <DialogDescription className='text-center'>
                We&apos;re building Growth features based on artist feedback.
                Tell us what you&apos;re most excited about and we&apos;ll
                prioritize accordingly.
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-2 px-1'>
              <Label htmlFor='growth-reason'>
                What feature are you most excited about?
              </Label>
              <Textarea
                id='growth-reason'
                placeholder='e.g., A/B testing for my pre-save pages, Meta pixel for ad retargeting...'
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>

            <DialogFooter>
              <Button
                variant='secondary'
                onClick={() => handleClose(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant='primary'
                onClick={handleSubmit}
                disabled={!reason.trim() || mutation.isPending}
              >
                {mutation.isPending ? 'Submitting...' : 'Request Early Access'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
