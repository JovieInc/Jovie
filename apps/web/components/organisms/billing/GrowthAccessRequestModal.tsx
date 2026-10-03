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
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 text-success'>
            <CheckCircle className='h-6 w-6' />
          </div>
          <DialogTitle className='text-center'>Request Received</DialogTitle>
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
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent'>
            <Sparkles className='h-6 w-6' />
          </div>
          <DialogTitle className='text-center'>
            Request Early Access
          </DialogTitle>
          <DialogDescription className='text-center'>
            {/* ui-casing-allow: Growth is a product feature name */}
            Tell us what you want from Growth.
          </DialogDescription>

          <DialogBody>
            <ContentSurfaceCard className='space-y-2 p-2.5'>
              <Label htmlFor='growth-reason'>
                What Feature Are You Most Excited About?
              </Label>
              <Textarea
                id='growth-reason'
                placeholder='What would you use Growth for?' // ui-casing-allow: Growth is a product feature name
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
