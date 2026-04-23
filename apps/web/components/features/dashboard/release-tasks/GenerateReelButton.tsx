'use client';

import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { captureError } from '@/lib/error-tracking';
import { useAppFlag } from '@/lib/flags/client';
import {
  useGenerateReelMutation,
  useReelJobQuery,
  useReelJobsForReleaseQuery,
} from '@/lib/queries/useReelJobQuery';

interface GenerateReelButtonProps {
  readonly releaseId: string;
  readonly className?: string;
}

export function GenerateReelButton({
  releaseId,
  className,
}: GenerateReelButtonProps) {
  const flagOn = useAppFlag('VIRAL_REEL_MVP');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: jobs } = useReelJobsForReleaseQuery(releaseId);
  const { data: activeJob } = useReelJobQuery(activeJobId, {
    pollWhilePending: true,
  });

  const latestJob = useMemo(() => {
    if (!jobs || jobs.length === 0) return null;
    return [...jobs].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }, [jobs]);

  const trackedJob = activeJob ?? latestJob ?? null;

  const mutation = useGenerateReelMutation(releaseId);

  if (!flagOn) return null;

  const handleClick = async () => {
    try {
      const result = await mutation.mutateAsync();
      if (result.ok) {
        setActiveJobId(result.jobId);
        if (result.status === 'succeeded') {
          toast.success('Reel ready to download.');
        } else {
          toast.success('Reel queued. Rendering in the background.');
        }
      } else if (result.reason === 'recent_job_exists' && result.jobId) {
        setActiveJobId(result.jobId);
        toast.info('A reel for this release is already rendering.');
      } else {
        toast.error('Could not queue the reel. Try again.');
      }
    } catch (error) {
      captureError('generateReel failed', error, {
        context: 'GenerateReelButton',
        releaseId,
      });
      toast.error('Could not queue the reel. Try again.');
    }
  };

  const isPending =
    mutation.isPending ||
    trackedJob?.status === 'queued' ||
    trackedJob?.status === 'rendering';

  const buttonLabel = (() => {
    if (mutation.isPending) return 'Queuing...';
    if (trackedJob?.status === 'queued') return 'Queued...';
    if (trackedJob?.status === 'rendering') return 'Rendering...';
    if (trackedJob?.status === 'succeeded') return 'Generate new reel';
    return 'Generate reel';
  })();

  return (
    <div className={className} data-testid='generate-reel-container'>
      <Button
        type='button'
        size='sm'
        variant='secondary'
        onClick={handleClick}
        disabled={isPending}
        data-testid='generate-reel-button'
      >
        {buttonLabel}
      </Button>
      {trackedJob?.status === 'succeeded' && trackedJob.outputUrl ? (
        <a
          href={trackedJob.outputUrl}
          download
          data-testid='download-reel-link'
          className='ml-2 text-xs text-[var(--linear-accent,#5e6ad2)] hover:underline'
        >
          Download reel
        </a>
      ) : null}
      {trackedJob?.status === 'failed' ? (
        <span
          className='ml-2 text-xs text-red-500'
          data-testid='reel-failed'
          title={trackedJob.error ?? ''}
        >
          Render failed
        </span>
      ) : null}
    </div>
  );
}
