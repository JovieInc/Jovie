'use client';

import { Button } from '@jovie/ui';
import { Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { rerunCustomerIngestionAction } from '@/app/app/(shell)/admin/actions';

const RECEIPT_LABELS: Record<string, string> = {
  requested: 'Recovery requested — ingestion jobs queued.',
  'already-running': 'No change: an ingestion run is already in flight.',
  'missing-source':
    'No change: profile has no linked Spotify source to ingest.',
  'not-failed': 'No change: this profile has no failed ingestion to recover.',
  'not-found': 'No change: creator profile no longer exists.',
};

export function RerunIngestionButton({
  creatorProfileId,
}: {
  creatorProfileId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = () => {
    startTransition(async () => {
      setMessage(null);
      const fd = new FormData();
      fd.set('profileId', creatorProfileId);
      try {
        const result = await rerunCustomerIngestionAction(fd);
        setMessage(RECEIPT_LABELS[result.state] ?? result.state);
        router.refresh();
      } catch {
        setMessage(
          'Recovery could not be requested. The profile was left unchanged; try again.'
        );
      }
    });
  };

  return (
    <div className='space-y-2'>
      <Button
        type='button'
        size='sm'
        onClick={run}
        disabled={pending}
        data-testid='rerun-ingestion-button'
      >
        {pending ? (
          <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' aria-hidden />
        ) : (
          <RefreshCw className='mr-2 h-3.5 w-3.5' aria-hidden />
        )}
        Re-run Artist Ingestion
      </Button>
      <p className='min-h-5 text-app text-secondary-token' aria-live='polite'>
        {message}
      </p>
    </div>
  );
}
