'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
} from '@jovie/ui';
import { useState } from 'react';

import { Icon } from '@/components/atoms/Icon';
import {
  type SendCampaignInvitesResponse,
  useCampaignPreviewQuery,
  useCampaignStatsQuery,
  useSendCampaignInvitesMutation,
} from '@/lib/queries/useCampaignInvites';

interface ThrottlingConfig {
  minDelayMs: number;
  maxDelayMs: number;
  maxPerHour: number;
}

const DEFAULT_THROTTLING: ThrottlingConfig = {
  minDelayMs: 30000, // 30 seconds
  maxDelayMs: 120000, // 2 minutes
  maxPerHour: 30,
};

/** Threshold for showing confirmation modal */
const LARGE_BATCH_THRESHOLD = 25;

export function InviteCampaignManager() {
  const [fitScoreThreshold, setFitScoreThreshold] = useState(50);
  const [limit, setLimit] = useState(20);
  const [throttling, setThrottling] =
    useState<ThrottlingConfig>(DEFAULT_THROTTLING);
  const [sendResult, setSendResult] =
    useState<SendCampaignInvitesResponse | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // TanStack Query for preview data
  const {
    data: preview,
    isLoading: isLoadingPreview,
    error: previewError,
    refetch: refetchPreview,
  } = useCampaignPreviewQuery({
    threshold: fitScoreThreshold,
    limit,
  });

  // TanStack Query for campaign stats
  const { data: stats, isLoading: isLoadingStats } = useCampaignStatsQuery();

  // TanStack Query mutation for sending invites
  const sendInvitesMutation = useSendCampaignInvitesMutation();

  const handleRefreshClick = () => {
    refetchPreview();
  };

  const handleSendClick = () => {
    if (!preview || preview.sample.withEmails === 0) return;

    // Show confirmation for large batches
    if (preview.sample.withEmails >= LARGE_BATCH_THRESHOLD) {
      setShowConfirmModal(true);
    } else {
      handleConfirmSend();
    }
  };

  const handleConfirmSend = async () => {
    setShowConfirmModal(false);
    if (!preview || preview.sample.withEmails === 0) return;

    setSendResult(null);

    try {
      const result = await sendInvitesMutation.mutateAsync({
        fitScoreThreshold,
        limit,
        minDelayMs: throttling.minDelayMs,
        maxDelayMs: throttling.maxDelayMs,
        maxPerHour: throttling.maxPerHour,
        dryRun: false,
      });

      setSendResult(result);
    } catch {
      // Error is handled by the mutation
    }
  };

  const avgDelaySeconds = Math.round(
    (throttling.minDelayMs + throttling.maxDelayMs) / 2 / 1000
  );
  const effectiveRatePerHour = Math.round(3600 / avgDelaySeconds);

  const error =
    previewError?.message ?? (sendInvitesMutation.error?.message || null);

  const hasActiveJobs = stats?.jobQueue?.pending || stats?.jobQueue?.processing;

  return (
    <div className='space-y-8'>
      {/* Campaign Results Dashboard */}
      <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold text-primary-token'>
            Campaign Results
          </h2>
          {isLoadingStats && (
            <Icon
              name='Loader2'
              className='h-4 w-4 animate-spin text-secondary-token'
            />
          )}
        </div>

        {stats && (
          <div className='grid gap-4 md:grid-cols-3 lg:grid-cols-6'>
            <div className='rounded-lg bg-surface-2 px-4 py-3'>
              <p className='text-2xl font-bold text-primary-token'>
                {stats.campaign.total}
              </p>
              <p className='text-xs text-secondary-token'>Total Invites</p>
            </div>
            <div className='rounded-lg bg-surface-2 px-4 py-3'>
              <p className='text-2xl font-bold text-amber-600'>
                {stats.campaign.pending}
              </p>
              <p className='text-xs text-secondary-token'>Pending</p>
            </div>
            <div className='rounded-lg bg-surface-2 px-4 py-3'>
              <p className='text-2xl font-bold text-blue-600'>
                {stats.campaign.sending}
              </p>
              <p className='text-xs text-secondary-token'>Sending</p>
            </div>
            <div className='rounded-lg bg-surface-2 px-4 py-3'>
              <p className='text-2xl font-bold text-green-600'>
                {stats.campaign.sent}
              </p>
              <p className='text-xs text-secondary-token'>Sent</p>
            </div>
            <div className='rounded-lg bg-surface-2 px-4 py-3'>
              <p className='text-2xl font-bold text-destructive'>
                {stats.campaign.failed}
              </p>
              <p className='text-xs text-secondary-token'>Failed</p>
            </div>
            <div className='rounded-lg bg-surface-2 px-4 py-3'>
              <p className='text-2xl font-bold text-purple-600'>
                {stats.campaign.claimed}
              </p>
              <p className='text-xs text-secondary-token'>Claimed</p>
            </div>
          </div>
        )}
      </section>

      {/* Job Queue Status */}
      {stats?.jobQueue && hasActiveJobs && (
        <section className='rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-6'>
          <div className='flex items-center gap-2 mb-4'>
            <Icon
              name='Loader2'
              className='h-5 w-5 animate-spin text-blue-600'
            />
            <h2 className='text-lg font-semibold text-blue-700 dark:text-blue-300'>
              Job Queue Active
            </h2>
          </div>

          <div className='grid gap-4 md:grid-cols-4'>
            <div>
              <p className='text-2xl font-bold text-blue-700 dark:text-blue-300'>
                {stats.jobQueue.pending}
              </p>
              <p className='text-xs text-blue-600 dark:text-blue-400'>
                Jobs Pending
              </p>
            </div>
            <div>
              <p className='text-2xl font-bold text-blue-700 dark:text-blue-300'>
                {stats.jobQueue.processing}
              </p>
              <p className='text-xs text-blue-600 dark:text-blue-400'>
                Processing
              </p>
            </div>
            <div>
              <p className='text-2xl font-bold text-green-600'>
                {stats.jobQueue.succeeded}
              </p>
              <p className='text-xs text-blue-600 dark:text-blue-400'>
                Succeeded
              </p>
            </div>
            <div>
              <p className='text-2xl font-bold text-blue-700 dark:text-blue-300'>
                ~{stats.jobQueue.estimatedMinutesRemaining} min
              </p>
              <p className='text-xs text-blue-600 dark:text-blue-400'>
                Est. Remaining
              </p>
            </div>
          </div>

          {stats.jobQueue.nextRunAt && (
            <p className='mt-4 text-xs text-blue-600 dark:text-blue-400'>
              Next job scheduled:{' '}
              {new Date(stats.jobQueue.nextRunAt).toLocaleTimeString()}
            </p>
          )}
        </section>
      )}

      {/* Targeting Section */}
      <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
        <h2 className='text-lg font-semibold text-primary-token mb-4'>
          Targeting
        </h2>

        <div className='grid gap-6 md:grid-cols-2'>
          {/* Fit Score Threshold */}
          <div className='space-y-2'>
            <label
              htmlFor='fit-score-threshold'
              className='text-sm font-medium text-primary-token'
            >
              Minimum Fit Score
            </label>
            <div className='flex items-center gap-4'>
              <input
                id='fit-score-threshold'
                type='range'
                min={0}
                max={100}
                value={fitScoreThreshold}
                onChange={e => setFitScoreThreshold(Number(e.target.value))}
                className='flex-1'
              />
              <span className='w-12 text-right font-mono text-sm text-primary-token'>
                {fitScoreThreshold}
              </span>
            </div>
            <p className='text-xs text-secondary-token'>
              Only invite profiles with fit score {'>='} {fitScoreThreshold}
            </p>
          </div>

          {/* Batch Limit */}
          <div className='space-y-2'>
            <label
              htmlFor='batch-size'
              className='text-sm font-medium text-primary-token'
            >
              Batch Size
            </label>
            <Input
              id='batch-size'
              type='number'
              min={1}
              max={100}
              value={limit}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setLimit(Number(e.target.value))
              }
              className='w-full'
            />
            <p className='text-xs text-secondary-token'>
              Maximum invites to send in this batch
            </p>
          </div>
        </div>
      </section>

      {/* Throttling Section */}
      <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
        <h2 className='text-lg font-semibold text-primary-token mb-4'>
          Throttling & Anti-Spam
        </h2>

        <div className='grid gap-6 md:grid-cols-3'>
          {/* Min Delay */}
          <div className='space-y-2'>
            <label
              htmlFor='min-delay'
              className='text-sm font-medium text-primary-token'
            >
              Min Delay (seconds)
            </label>
            <Input
              id='min-delay'
              type='number'
              min={10}
              max={300}
              value={throttling.minDelayMs / 1000}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setThrottling(t => {
                  const newMin = Number(e.target.value) * 1000;
                  return {
                    ...t,
                    minDelayMs: newMin,
                    maxDelayMs: Math.max(newMin, t.maxDelayMs),
                  };
                })
              }
              className='w-full'
            />
          </div>

          {/* Max Delay */}
          <div className='space-y-2'>
            <label
              htmlFor='max-delay'
              className='text-sm font-medium text-primary-token'
            >
              Max Delay (seconds)
            </label>
            <Input
              id='max-delay'
              type='number'
              min={30}
              max={600}
              value={throttling.maxDelayMs / 1000}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setThrottling(t => {
                  const newMax = Number(e.target.value) * 1000;
                  return {
                    ...t,
                    minDelayMs: Math.min(t.minDelayMs, newMax),
                    maxDelayMs: newMax,
                  };
                })
              }
              className='w-full'
            />
          </div>

          {/* Rate Info */}
          <div className='space-y-2'>
            <p className='text-sm font-medium text-primary-token'>
              Effective Rate
            </p>
            <div className='rounded-lg bg-surface-2 px-4 py-3'>
              <p className='text-lg font-semibold text-primary-token'>
                ~{effectiveRatePerHour}/hour
              </p>
              <p className='text-xs text-secondary-token'>
                Avg delay: {avgDelaySeconds}s
              </p>
            </div>
          </div>
        </div>

        <div className='mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 px-4 py-3'>
          <Icon
            name='AlertTriangle'
            className='h-4 w-4 text-amber-600 mt-0.5'
          />
          <p className='text-xs text-amber-700 dark:text-amber-400'>
            Delays are randomized between min and max to appear human-like. Stay
            under 50/hour to avoid spam filters.
          </p>
        </div>
      </section>

      {/* Preview Section */}
      <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold text-primary-token'>Preview</h2>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleRefreshClick}
            disabled={isLoadingPreview}
          >
            {isLoadingPreview ? (
              <Icon name='Loader2' className='h-4 w-4 animate-spin' />
            ) : (
              <Icon name='RefreshCw' className='h-4 w-4' />
            )}
            <span className='ml-2'>Refresh</span>
          </Button>
        </div>

        {error && (
          <div className='mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3'>
            <Icon name='XCircle' className='h-4 w-4 text-destructive' />
            <p className='text-sm text-destructive'>{error}</p>
          </div>
        )}

        {preview && (
          <div className='space-y-4'>
            {/* Stats */}
            <div className='grid gap-4 md:grid-cols-3'>
              <div className='rounded-lg bg-surface-2 px-4 py-3'>
                <p className='text-2xl font-bold text-primary-token'>
                  {preview.totalEligible}
                </p>
                <p className='text-xs text-secondary-token'>
                  Total eligible (score {'>='} {preview.threshold})
                </p>
              </div>
              <div className='rounded-lg bg-surface-2 px-4 py-3'>
                <p className='text-2xl font-bold text-green-600'>
                  {preview.sample.withEmails}
                </p>
                <p className='text-xs text-secondary-token'>
                  With contact email
                </p>
              </div>
              <div className='rounded-lg bg-surface-2 px-4 py-3'>
                <p className='text-2xl font-bold text-amber-600'>
                  {preview.sample.withoutEmails}
                </p>
                <p className='text-xs text-secondary-token'>Missing email</p>
              </div>
            </div>

            {/* Sample Profiles */}
            {preview.sample.profiles.length > 0 && (
              <div>
                <p className='text-sm font-medium text-primary-token mb-2'>
                  Sample profiles to invite:
                </p>
                <div className='overflow-hidden rounded-lg border border-subtle'>
                  <table className='w-full text-sm'>
                    <thead className='bg-surface-2'>
                      <tr>
                        <th className='px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
                          Username
                        </th>
                        <th className='px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
                          Fit Score
                        </th>
                        <th className='px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
                          Email
                        </th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-subtle'>
                      {preview.sample.profiles.map(profile => (
                        <tr key={profile.id}>
                          <td className='px-4 py-2 text-primary-token'>
                            @{profile.username}
                          </td>
                          <td className='px-4 py-2'>
                            <span className='inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'>
                              {profile.fitScore ?? 'N/A'}
                            </span>
                          </td>
                          <td className='px-4 py-2 font-mono text-xs text-secondary-token'>
                            {profile.email}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Send Section */}
      <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
        <h2 className='text-lg font-semibold text-primary-token mb-4'>
          Send Invites
        </h2>

        {sendResult?.ok && (
          <div className='mb-4 flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-3'>
            <Icon
              name='CheckCircle'
              className='h-4 w-4 text-green-600 dark:text-green-400'
            />
            <div>
              <p className='text-sm font-medium text-green-700 dark:text-green-300'>
                Successfully queued {sendResult.jobsEnqueued} invites!
              </p>
              <p className='text-xs text-green-600 dark:text-green-400'>
                Estimated completion: ~{sendResult.estimatedMinutes} minutes
              </p>
            </div>
          </div>
        )}

        <div className='flex items-center gap-4'>
          <Button
            variant='primary'
            onClick={handleSendClick}
            disabled={
              sendInvitesMutation.isPending ||
              !preview ||
              preview.sample.withEmails === 0 ||
              isLoadingPreview
            }
          >
            {sendInvitesMutation.isPending ? (
              <>
                <Icon name='Loader2' className='mr-2 h-4 w-4 animate-spin' />
                Sending...
              </>
            ) : (
              <>
                <Icon name='Send' className='mr-2 h-4 w-4' />
                Send {preview?.sample.withEmails ?? 0} Invites
              </>
            )}
          </Button>

          <p className='text-sm text-secondary-token'>
            Emails will be sent over ~
            {preview
              ? Math.ceil((preview.sample.withEmails * avgDelaySeconds) / 60)
              : 0}{' '}
            minutes
          </p>
        </div>
      </section>

      {/* Confirmation Modal for Large Batches */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Large Batch Send</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send{' '}
              <span className='font-semibold'>
                {preview?.sample.withEmails ?? 0}
              </span>{' '}
              invite emails. This will take approximately{' '}
              <span className='font-semibold'>
                {preview
                  ? Math.ceil(
                      (preview.sample.withEmails * avgDelaySeconds) / 60
                    )
                  : 0}{' '}
                minutes
              </span>{' '}
              to complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='mt-4 rounded-lg bg-amber-500/10 px-4 py-3'>
            <div className='flex items-start gap-2'>
              <Icon
                name='AlertTriangle'
                className='h-4 w-4 text-amber-600 mt-0.5'
              />
              <p className='text-xs text-amber-700 dark:text-amber-400'>
                This action cannot be undone. Emails will be queued and sent
                gradually to avoid spam filters.
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant='primary' onClick={handleConfirmSend}>
              Confirm Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
