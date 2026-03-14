'use client';

import { Button, Label, Textarea } from '@jovie/ui';
import { CheckCircle, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
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
    <Dialog open={open} onClose={() => handleClose(false)} size='md'>
      {submitted ? (
        <>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-400'>
            <CheckCircle className='h-6 w-6' />
          </div>
          <DialogTitle className='text-center'>Request received</DialogTitle>
          <DialogDescription className='text-center'>
            We&apos;ll review your request and reach out soon to learn more
            about your needs.
          </DialogDescription>
          <DialogActions>
            <Button
              variant='secondary'
              className='w-full'
              onClick={() => handleClose(false)}
            >
              Close
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] border border-violet-500/20 bg-violet-500/10 text-violet-600 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-400'>
            <Sparkles className='h-6 w-6' />
          </div>
          <DialogTitle className='text-center'>
            Growth is in early access
          </DialogTitle>
          <DialogDescription className='text-center'>
            We&apos;re building Growth features based on artist feedback. Tell
            us what you&apos;re most excited about and we&apos;ll prioritize
            accordingly.
          </DialogDescription>

          <DialogBody>
            <ContentSurfaceCard className='space-y-2 bg-(--linear-bg-surface-0) p-3.5'>
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
            </ContentSurfaceCard>
          </DialogBody>

          <DialogActions>
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
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
