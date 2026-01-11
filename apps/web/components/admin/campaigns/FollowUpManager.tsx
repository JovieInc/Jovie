'use client';

import { Button, Input } from '@jovie/ui';
import { useCallback, useEffect, useState } from 'react';

import { Icon } from '@/components/atoms/Icon';

interface FollowUpConfig {
  sequenceStep: number;
  daysSincePrevious: number;
  limit: number;
  minDelayMs: number;
  maxDelayMs: number;
}

interface FollowUpProfile {
  username: string;
  displayName: string | null;
  email: string;
  daysSinceSent: number;
}

interface PreviewResponse {
  ok: boolean;
  sequenceStep: number;
  daysSincePrevious: number;
  eligible: number;
  profiles: FollowUpProfile[];
}

interface SendResponse {
  ok: boolean;
  sequenceStep?: number;
  jobsEnqueued?: number;
  estimatedMinutes?: number;
  message?: string;
  error?: string;
}

const DEFAULT_CONFIG: FollowUpConfig = {
  sequenceStep: 1,
  daysSincePrevious: 3,
  limit: 20,
  minDelayMs: 30000,
  maxDelayMs: 120000,
};

export function FollowUpManager() {
  const [config, setConfig] = useState<FollowUpConfig>(DEFAULT_CONFIG);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sequenceStep: config.sequenceStep.toString(),
        daysSincePrevious: config.daysSincePrevious.toString(),
        limit: config.limit.toString(),
      });
      const response = await fetch(
        `/api/admin/creator-invite/followup?${params}`
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
  }, [config.sequenceStep, config.daysSincePrevious, config.limit]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleSendFollowUps = async () => {
    if (!preview || preview.eligible === 0) return;

    setIsSending(true);
    setError(null);
    setSendResult(null);

    try {
      const response = await fetch('/api/admin/creator-invite/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequenceStep: config.sequenceStep,
          daysSincePrevious: config.daysSincePrevious,
          limit: config.limit,
          minDelayMs: config.minDelayMs,
          maxDelayMs: config.maxDelayMs,
          dryRun: false,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send follow-ups');
      }

      setSendResult(data);
      setTimeout(fetchPreview, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to send follow-ups'
      );
    } finally {
      setIsSending(false);
    }
  };

  const avgDelaySeconds = Math.round(
    (config.minDelayMs + config.maxDelayMs) / 2 / 1000
  );

  const stepLabel =
    config.sequenceStep === 1 ? '1st follow-up' : '2nd follow-up';

  return (
    <div className='space-y-6'>
      {/* Configuration */}
      <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-4'>
        {/* Sequence Step */}
        <div className='space-y-2'>
          <label
            htmlFor='sequence-step'
            className='text-sm font-medium text-primary-token'
          >
            Follow-up Step
          </label>
          <select
            id='sequence-step'
            value={config.sequenceStep}
            onChange={e =>
              setConfig(c => ({ ...c, sequenceStep: Number(e.target.value) }))
            }
            className='w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
          >
            <option value={1}>1st Follow-up</option>
            <option value={2}>2nd Follow-up (Final)</option>
          </select>
          <p className='text-xs text-secondary-token'>
            {config.sequenceStep === 1
              ? 'Gentle reminder for those who received initial invite'
              : 'Final reminder with urgency messaging'}
          </p>
        </div>

        {/* Days Since Previous */}
        <div className='space-y-2'>
          <label
            htmlFor='days-since'
            className='text-sm font-medium text-primary-token'
          >
            Days Since Previous
          </label>
          <Input
            id='days-since'
            type='number'
            min={1}
            max={30}
            value={config.daysSincePrevious}
            onChange={e =>
              setConfig(c => ({
                ...c,
                daysSincePrevious: Number(e.target.value),
              }))
            }
            className='w-full'
          />
          <p className='text-xs text-secondary-token'>
            Only include profiles where{' '}
            {config.sequenceStep === 1 ? 'initial' : '1st follow-up'} was sent{' '}
            {'>='} {config.daysSincePrevious} days ago
          </p>
        </div>

        {/* Batch Limit */}
        <div className='space-y-2'>
          <label
            htmlFor='followup-limit'
            className='text-sm font-medium text-primary-token'
          >
            Batch Size
          </label>
          <Input
            id='followup-limit'
            type='number'
            min={1}
            max={100}
            value={config.limit}
            onChange={e =>
              setConfig(c => ({ ...c, limit: Number(e.target.value) }))
            }
            className='w-full'
          />
        </div>

        {/* Delay Range */}
        <div className='space-y-2'>
          <p className='text-sm font-medium text-primary-token'>Delay Range</p>
          <div className='flex items-center gap-2'>
            <Input
              type='number'
              min={10}
              max={300}
              value={config.minDelayMs / 1000}
              onChange={e =>
                setConfig(c => ({
                  ...c,
                  minDelayMs: Number(e.target.value) * 1000,
                }))
              }
              className='w-20'
            />
            <span className='text-sm text-secondary-token'>to</span>
            <Input
              type='number'
              min={30}
              max={600}
              value={config.maxDelayMs / 1000}
              onChange={e =>
                setConfig(c => ({
                  ...c,
                  maxDelayMs: Number(e.target.value) * 1000,
                }))
              }
              className='w-20'
            />
            <span className='text-sm text-secondary-token'>sec</span>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className='rounded-lg border border-subtle bg-surface-2 p-4'>
        <div className='flex items-center justify-between mb-3'>
          <div className='flex items-center gap-2'>
            <Icon name='Users' className='h-4 w-4 text-secondary-token' />
            <span className='text-sm font-medium text-primary-token'>
              Profiles Ready for {stepLabel}
            </span>
          </div>
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
          </Button>
        </div>

        {error && (
          <div className='mb-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2'>
            <Icon name='XCircle' className='h-4 w-4 text-destructive' />
            <p className='text-sm text-destructive'>{error}</p>
          </div>
        )}

        {preview && (
          <div className='space-y-3'>
            <div className='flex items-baseline gap-2'>
              <span className='text-3xl font-bold text-primary-token'>
                {preview.eligible}
              </span>
              <span className='text-sm text-secondary-token'>
                profiles ready
              </span>
            </div>

            {preview.profiles.length > 0 && (
              <div className='text-xs text-secondary-token'>
                <p className='mb-1'>Sample:</p>
                <ul className='space-y-1'>
                  {preview.profiles.slice(0, 5).map((p, i) => (
                    <li key={i} className='flex items-center gap-2'>
                      <span className='font-medium'>@{p.username}</span>
                      <span className='text-secondary-token'>
                        ({p.daysSinceSent}d ago)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Send Result */}
      {sendResult && sendResult.ok && (
        <div className='flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-3'>
          <Icon
            name='CheckCircle'
            className='h-4 w-4 text-green-600 dark:text-green-400'
          />
          <div>
            <p className='text-sm font-medium text-green-700 dark:text-green-300'>
              {sendResult.jobsEnqueued
                ? `Queued ${sendResult.jobsEnqueued} follow-ups!`
                : sendResult.message}
            </p>
            {sendResult.estimatedMinutes && (
              <p className='text-xs text-green-600 dark:text-green-400'>
                Estimated completion: ~{sendResult.estimatedMinutes} minutes
              </p>
            )}
          </div>
        </div>
      )}

      {/* Send Button */}
      <div className='flex items-center gap-4'>
        <Button
          variant='secondary'
          onClick={handleSendFollowUps}
          disabled={
            isSending || !preview || preview.eligible === 0 || isLoadingPreview
          }
        >
          {isSending ? (
            <>
              <Icon name='Loader2' className='mr-2 h-4 w-4 animate-spin' />
              Sending...
            </>
          ) : (
            <>
              <Icon name='Mail' className='mr-2 h-4 w-4' />
              Send {stepLabel} to {preview?.eligible ?? 0} Profiles
            </>
          )}
        </Button>

        {preview && preview.eligible > 0 && (
          <p className='text-sm text-secondary-token'>
            ~{Math.ceil((preview.eligible * avgDelaySeconds) / 60)} minutes to
            complete
          </p>
        )}
      </div>
    </div>
  );
}
