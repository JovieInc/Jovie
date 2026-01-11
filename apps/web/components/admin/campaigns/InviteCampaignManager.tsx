'use client';

import { Button, Input } from '@jovie/ui';
import { useCallback, useEffect, useState } from 'react';

import { Icon } from '@/components/atoms/Icon';

interface ThrottlingConfig {
  minDelayMs: number;
  maxDelayMs: number;
  maxPerHour: number;
}

interface EligibleProfile {
  id: string;
  username: string;
  displayName: string | null;
  fitScore: number | null;
  email: string;
}

interface PreviewResponse {
  ok: boolean;
  threshold: number;
  totalEligible: number;
  sample: {
    withEmails: number;
    withoutEmails: number;
    profiles: EligibleProfile[];
  };
}

interface SendResponse {
  ok: boolean;
  sent?: number;
  jobsEnqueued?: number;
  skippedNoEmail?: number;
  estimatedMinutes?: number;
  error?: string;
}

const DEFAULT_THROTTLING: ThrottlingConfig = {
  minDelayMs: 30000, // 30 seconds
  maxDelayMs: 120000, // 2 minutes
  maxPerHour: 30,
};

export function InviteCampaignManager() {
  const [fitScoreThreshold, setFitScoreThreshold] = useState(50);
  const [limit, setLimit] = useState(20);
  const [throttling, setThrottling] = useState<ThrottlingConfig>(DEFAULT_THROTTLING);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/creator-invite/bulk?threshold=${fitScoreThreshold}&limit=${limit}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch preview');
      }
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch preview');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [fitScoreThreshold, limit]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleSendInvites = async () => {
    if (!preview || preview.sample.withEmails === 0) return;

    setIsSending(true);
    setError(null);
    setSendResult(null);

    try {
      const response = await fetch('/api/admin/creator-invite/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitScoreThreshold,
          limit,
          minDelayMs: throttling.minDelayMs,
          maxDelayMs: throttling.maxDelayMs,
          maxPerHour: throttling.maxPerHour,
          dryRun: false,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invites');
      }

      setSendResult(data);
      // Refresh preview after sending
      setTimeout(fetchPreview, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setIsSending(false);
    }
  };

  const avgDelaySeconds = Math.round(
    (throttling.minDelayMs + throttling.maxDelayMs) / 2 / 1000
  );
  const effectiveRatePerHour = Math.round(3600 / avgDelaySeconds);

  return (
    <div className='space-y-8'>
      {/* Targeting Section */}
      <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
        <h2 className='text-lg font-semibold text-primary-token mb-4'>
          Targeting
        </h2>

        <div className='grid gap-6 md:grid-cols-2'>
          {/* Fit Score Threshold */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-primary-token'>
              Minimum Fit Score
            </label>
            <div className='flex items-center gap-4'>
              <input
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
            <label className='text-sm font-medium text-primary-token'>
              Batch Size
            </label>
            <Input
              type='number'
              min={1}
              max={100}
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
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
            <label className='text-sm font-medium text-primary-token'>
              Min Delay (seconds)
            </label>
            <Input
              type='number'
              min={10}
              max={300}
              value={throttling.minDelayMs / 1000}
              onChange={e =>
                setThrottling(t => ({
                  ...t,
                  minDelayMs: Number(e.target.value) * 1000,
                }))
              }
              className='w-full'
            />
          </div>

          {/* Max Delay */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-primary-token'>
              Max Delay (seconds)
            </label>
            <Input
              type='number'
              min={30}
              max={600}
              value={throttling.maxDelayMs / 1000}
              onChange={e =>
                setThrottling(t => ({
                  ...t,
                  maxDelayMs: Number(e.target.value) * 1000,
                }))
              }
              className='w-full'
            />
          </div>

          {/* Rate Info */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-primary-token'>
              Effective Rate
            </label>
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
          <Icon name='AlertTriangle' className='h-4 w-4 text-amber-600 mt-0.5' />
          <p className='text-xs text-amber-700 dark:text-amber-400'>
            Delays are randomized between min and max to appear human-like.
            Stay under 50/hour to avoid spam filters.
          </p>
        </div>
      </section>

      {/* Preview Section */}
      <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold text-primary-token'>
            Preview
          </h2>
          <Button
            variant='ghost'
            size='sm'
            onClick={fetchPreview}
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
                <p className='text-xs text-secondary-token'>With contact email</p>
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
                        <th className='px-4 py-2 text-left text-xs font-medium text-secondary-token'>
                          Username
                        </th>
                        <th className='px-4 py-2 text-left text-xs font-medium text-secondary-token'>
                          Fit Score
                        </th>
                        <th className='px-4 py-2 text-left text-xs font-medium text-secondary-token'>
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

        {sendResult && sendResult.ok && (
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
            onClick={handleSendInvites}
            disabled={
              isSending ||
              !preview ||
              preview.sample.withEmails === 0 ||
              isLoadingPreview
            }
          >
            {isSending ? (
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
    </div>
  );
}
