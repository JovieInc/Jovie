'use client';

import { Button } from '@jovie/ui';
import { Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  type CustomerIngestionRecoveryReceipt,
  rerunCustomerIngestionAction,
} from '@/app/app/(shell)/admin/actions';

const RECEIPT_LABELS: Record<string, string> = {
  requested: 'Recovery requested — ingestion jobs queued.',
  'already-running': 'No change: an ingestion run is already in flight.',
  'missing-source':
    'No change: profile has no linked Spotify source to ingest.',
  'not-failed': 'No change: this profile has no failed ingestion to recover.',
  'not-found': 'No change: creator profile no longer exists.',
};

interface RerunIngestionButtonProps {
  readonly creatorProfileId: string;
}

/**
 * One supported recovery: re-run failed artist ingestion. The receipt states
 * "requested" — recovery is confirmed by reading the dossier back after a
 * refresh, not by the toast alone.
 */
export function RerunIngestionButton({
  creatorProfileId,
}: RerunIngestionButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] =
    useState<CustomerIngestionRecoveryReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    startTransition(async () => {
      setError(null);
      setReceipt(null);
      const fd = new FormData();
      fd.set('profileId', creatorProfileId);
      try {
        const result = await rerunCustomerIngestionAction(fd);
        setReceipt(result);
        // Read back the same dossier so the operator sees fresh evidence
        // (ingestion status, recent operations), not just a toast.
        router.refresh();
      } catch {
        setError(
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
      <div className='min-h-5' aria-live='polite'>
        {receipt && (
          <p
            className='text-app text-secondary-token'
            data-testid='rerun-ingestion-receipt'
          >
            {RECEIPT_LABELS[receipt.state] ?? receipt.state} Queued:{' '}
            {receipt.queuedCount}. Checked {receipt.checkedAt}
          </p>
        )}
        {error && (
          <p
            className='text-app text-secondary-token'
            data-testid='rerun-ingestion-error'
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
