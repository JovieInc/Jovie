'use client';

import { Button, Checkbox, Textarea } from '@jovie/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { REALTIME_CACHE } from '@/lib/queries/cache-strategies';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import type { YouTubeLinkPreview } from '@/lib/youtube-library/link-contract';

const COPY = 'system-b-library-drawer-panel-copy';
const STATUS = {
  missing: 'Missing',
  stale: 'Stale',
  unknown: 'Unknown',
  verified: 'Verified',
};

export function YouTubeLinkPanel({
  profileId,
  videoId,
  disabled,
}: {
  readonly profileId: string | null;
  readonly videoId: string;
  readonly disabled: boolean;
}) {
  const consentId = useId();
  const restoreId = useId();
  const [approvedFor, setApprovedFor] = useState<string | null>(null);
  const [restoreFor, setRestoreFor] = useState<string | null>(null);
  const client = useQueryClient();
  const queryKey = ['youtube-library-link', profileId, videoId] as const;
  const url = `/api/youtube-library/videos/${encodeURIComponent(videoId)}/link`;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      fetchWithTimeout<YouTubeLinkPreview>(
        `${url}?creatorProfileId=${encodeURIComponent(profileId ?? '')}`,
        { signal, timeout: 60_000 }
      ),
    ...REALTIME_CACHE,
    retry: false,
    refetchOnWindowFocus: false,
    enabled: Boolean(profileId) && !disabled,
  });
  const data = query.data;
  const approvalKey = data?.approval ? JSON.stringify(data.approval) : null;
  const restoreKey = data?.rollback ? JSON.stringify(data.rollback) : null;
  const mutation = useMutation({
    mutationFn: (action: 'apply' | 'rollback') =>
      fetchWithTimeout<{ ok: true }>(url, {
        method: 'POST',
        timeout: 120_000,
        body: JSON.stringify(
          action === 'apply'
            ? { action, creatorProfileId: profileId, approval: data?.approval }
            : {
                action,
                creatorProfileId: profileId,
                approved: true,
                operationKey: data?.rollback?.operationKey,
                sourceVersion: data?.rollback?.sourceVersion,
              }
        ),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSettled: async () => {
      setApprovedFor(null);
      setRestoreFor(null);
      await client.invalidateQueries({ queryKey });
    },
  });
  const busy = disabled || !profileId || query.isFetching || mutation.isPending;
  const failed = query.isError || mutation.isError;
  const nextAction = failed
    ? 'The description may have changed or access expired. Refresh the preview; reconnect YouTube if needed.'
    : !profileId || disabled
      ? 'Open an imported video to inspect its link.'
      : (data?.plan.nextAction ?? 'Checking the YouTube description…');
  return (
    <div
      className={`${COPY} min-w-0 space-y-3`}
      data-testid='library-youtube-link'
    >
      <p className='h-5 text-primary-token' aria-live='polite'>
        {query.isError
          ? 'Unknown'
          : data
            ? STATUS[data.plan.status]
            : 'Unknown'}
        {busy ? ' · Checking…' : ''}
      </p>
      <p
        className='h-10 break-all line-clamp-2 text-secondary-token'
        title={data?.plan.preservedDestination ?? undefined}
      >
        Destination: {data?.plan.preservedDestination ?? 'Unavailable'}
      </p>
      <p
        className={`h-10 line-clamp-2 text-pretty ${failed ? 'text-error' : 'text-secondary-token'}`}
        role='status'
        title={nextAction}
      >
        {nextAction}
      </p>
      <Textarea
        rows={6}
        resizable={false}
        aria-label='Description Preview'
        aria-busy={query.isFetching}
        readOnly
        value={
          data?.plan.proposedDescription ??
          'Description Preview will appear here.'
        }
      />
      <label
        htmlFor={consentId}
        className='flex min-h-11 items-center gap-2 text-secondary-token'
      >
        <Checkbox
          id={consentId}
          disabled={busy || failed || !approvalKey}
          checked={approvalKey !== null && approvedFor === approvalKey}
          onCheckedChange={checked =>
            setApprovedFor(checked === true ? approvalKey : null)
          }
        />
        I approve applying this preview.
      </label>
      <div className='flex h-11 items-center gap-2'>
        <Button
          size='sm'
          disabled={
            busy || failed || !approvalKey || approvedFor !== approvalKey
          }
          onClick={() => mutation.mutate('apply')}
        >
          Apply Link
        </Button>
        <Button
          size='sm'
          variant='secondary'
          disabled={busy}
          onClick={() => {
            setApprovedFor(null);
            setRestoreFor(null);
            mutation.reset();
            void query.refetch();
          }}
        >
          Refresh Preview
        </Button>
      </div>
      <details>
        <summary className='cursor-pointer text-secondary-token focus-ring-themed'>
          Restore original
        </summary>
        {data?.rollback ? (
          <div className='space-y-3 pt-3'>
            <Textarea
              rows={6}
              resizable={false}
              aria-label='Original Description'
              readOnly
              value={data.rollback.originalDescription}
            />
            <label
              htmlFor={restoreId}
              className='flex min-h-11 items-center gap-2 text-secondary-token'
            >
              <Checkbox
                id={restoreId}
                disabled={busy || failed}
                checked={restoreKey !== null && restoreFor === restoreKey}
                onCheckedChange={checked =>
                  setRestoreFor(checked === true ? restoreKey : null)
                }
              />
              I approve restoring this original.
            </label>
            <Button
              size='sm'
              variant='secondary'
              disabled={
                busy || failed || !restoreKey || restoreFor !== restoreKey
              }
              onClick={() => mutation.mutate('rollback')}
            >
              Restore Description
            </Button>
          </div>
        ) : (
          <p className='pt-3 text-pretty text-secondary-token'>
            No saved change can be restored to this version.
          </p>
        )}
      </details>
    </div>
  );
}
