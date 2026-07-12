'use client';

import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import type {
  VisualQaReviewRun,
  VisualQaReviewSurface,
} from '@/lib/agent-os/visual-qa/review';
import { cn } from '@/lib/utils';

const FETCH_URL = '/api/admin/hud/visual-qa';

interface VisualQaRunsResponse {
  readonly runs: readonly VisualQaReviewRun[];
  readonly fetchedAt: string;
}

const SURFACE_STATUS_LABEL: Record<VisualQaReviewSurface['status'], string> = {
  no_significant_change: 'No Drift',
  drift_detected: 'Drift Detected',
  missing_capture: 'Missing Capture',
};

const SURFACE_STATUS_CLASS: Record<VisualQaReviewSurface['status'], string> = {
  no_significant_change: 'text-secondary-token',
  drift_detected: 'text-destructive',
  missing_capture: 'text-tertiary-token',
};

function formatComputedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function formatDriftScore(surface: VisualQaReviewSurface): string {
  if (surface.weightedDriftScore == null) return '—';
  return `${surface.weightedDriftScore.toFixed(4)} / ${surface.threshold.toFixed(4)}`;
}

function surfaceImageUrl(
  runId: string,
  surfaceId: string,
  kind: 'baseline' | 'after' | 'overlay'
): string {
  return `/api/admin/hud/visual-qa/${encodeURIComponent(runId)}/${encodeURIComponent(surfaceId)}/${kind}`;
}

function SurfaceScreenshot({
  label,
  src,
}: Readonly<{ readonly label: string; readonly src: string | null }>) {
  return (
    <figure className='min-w-0 space-y-1'>
      <figcaption className='text-2xs uppercase tracking-wide text-tertiary-token'>
        {label}
      </figcaption>
      {src ? (
        <a href={src} target='_blank' rel='noopener noreferrer'>
          <Image
            src={src}
            alt={`${label} screenshot`}
            width={640}
            height={360}
            unoptimized
            className='max-h-48 w-full rounded-md border border-subtle bg-surface-1 object-contain object-top'
          />
        </a>
      ) : (
        <div className='flex h-24 items-center justify-center rounded-md border border-dashed border-subtle text-2xs text-tertiary-token'>
          Not available
        </div>
      )}
    </figure>
  );
}

function VisualQaSurfaceCard({
  run,
  surface,
  referenceId,
  isSubmitting,
  onReview,
}: Readonly<{
  readonly run: VisualQaReviewRun;
  readonly surface: VisualQaReviewSurface;
  readonly referenceId: string;
  readonly isSubmitting: boolean;
  readonly onReview: (
    run: VisualQaReviewRun,
    surface: VisualQaReviewSurface,
    decision: 'accepted' | 'rejected'
  ) => void;
}>) {
  const hasCapture = surface.status !== 'missing_capture';

  return (
    <ContentSurfaceCard
      className='space-y-3 p-3'
      data-ref-id={referenceId}
      data-testid={`visual-qa-surface-card-${run.runId}-${surface.surfaceId}`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-0.5'>
          <p className='text-app font-semibold text-primary-token'>
            {surface.title}
          </p>
          <p className='text-2xs text-tertiary-token'>
            {referenceId} · {surface.surfaceId} · Drift{' '}
            <span className='tabular-nums'>{formatDriftScore(surface)}</span>
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-2xs font-semibold',
            SURFACE_STATUS_CLASS[surface.status]
          )}
        >
          {SURFACE_STATUS_LABEL[surface.status]}
        </span>
      </div>

      <div className='grid gap-2 sm:grid-cols-3'>
        <SurfaceScreenshot
          label='Baseline'
          src={
            hasCapture
              ? surfaceImageUrl(run.runId, surface.surfaceId, 'baseline')
              : null
          }
        />
        <SurfaceScreenshot
          label='After'
          src={
            hasCapture
              ? surfaceImageUrl(run.runId, surface.surfaceId, 'after')
              : null
          }
        />
        <SurfaceScreenshot
          label='Diff Overlay'
          src={
            surface.overlayPath
              ? surfaceImageUrl(run.runId, surface.surfaceId, 'overlay')
              : null
          }
        />
      </div>

      {surface.review ? (
        <p className='border-t border-subtle pt-3 text-2xs text-secondary-token'>
          {surface.review.decision === 'accepted' ? 'Accepted' : 'Rejected'} by{' '}
          {surface.review.reviewer} ·{' '}
          {formatComputedAt(surface.review.reviewedAt)}
          {surface.review.dispatchId
            ? ` · follow-up dispatched (${surface.review.dispatchId.slice(0, 8)})`
            : ''}
        </p>
      ) : (
        <div className='flex flex-wrap gap-2 border-t border-subtle pt-3'>
          <DrawerButton
            type='button'
            tone='primary'
            disabled={isSubmitting}
            className='justify-center'
            onClick={() => onReview(run, surface, 'accepted')}
          >
            Accept
          </DrawerButton>
          <DrawerButton
            type='button'
            tone='secondary'
            disabled={isSubmitting}
            className='justify-center text-destructive'
            onClick={() => onReview(run, surface, 'rejected')}
          >
            Reject
          </DrawerButton>
        </div>
      )}
    </ContentSurfaceCard>
  );
}

export function VisualQaReviewPanel() {
  const [runs, setRuns] = useState<readonly VisualQaReviewRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(FETCH_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load Visual QA runs (${response.status})`);
      }
      const payload = (await response.json()) as VisualQaRunsResponse;
      setRuns(payload.runs);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load Visual QA runs'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns().catch(() => undefined);
  }, [loadRuns]);

  const submitReview = useCallback(
    async (
      run: VisualQaReviewRun,
      surface: VisualQaReviewSurface,
      decision: 'accepted' | 'rejected'
    ) => {
      const key = `${run.runId}:${surface.surfaceId}`;
      setSubmittingKey(key);
      try {
        const response = await fetch(
          `/api/admin/hud/visual-qa/${encodeURIComponent(run.runId)}/review`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              surfaceId: surface.surfaceId,
              decision,
            }),
          }
        );

        const payload = (await response.json()) as {
          error?: string;
          review?: { dispatchId: string | null };
        };

        if (!response.ok) {
          throw new Error(
            payload.error ?? `Review failed (${response.status})`
          );
        }

        let successMessage = 'Visual drift rejected.';
        if (decision === 'accepted') {
          successMessage = 'Visual drift accepted.';
        } else if (payload.review?.dispatchId) {
          successMessage = 'Visual drift rejected; follow-up dispatched.';
        }
        toast.success(successMessage);
        await loadRuns();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to review Visual QA surface'
        );
      } finally {
        setSubmittingKey(null);
      }
    },
    [loadRuns]
  );

  if (isLoading) {
    return (
      <ContentSurfaceCard
        surface='details'
        className='flex items-center gap-2 p-3 text-app text-secondary-token'
        data-testid='visual-qa-review-panel'
      >
        <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
        Loading Visual QA runs...
      </ContentSurfaceCard>
    );
  }

  let surfaceIndex = 0;

  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='visual-qa-review-panel'
    >
      <div className='flex items-center justify-between gap-3'>
        <div>
          <p className='text-xs font-semibold text-primary-token'>Visual QA</p>
          <p className='text-xs text-secondary-token'>
            Post-deploy screenshot drift. Accept intentional changes; reject
            regressions to route a follow-up.
          </p>
        </div>
        <span className='text-2xs tabular-nums text-tertiary-token'>
          {runs.length}
        </span>
      </div>

      {runs.length > 0 ? (
        <div className='grid gap-3'>
          {runs.map(run => (
            <div key={run.runId} className='space-y-2'>
              <p className='text-2xs text-tertiary-token'>
                Run {run.runId} · {formatComputedAt(run.computedAt)} ·{' '}
                {run.passed ? 'Passed' : 'Needs review'}
              </p>
              <div className='grid gap-3'>
                {run.surfaces.map(surface => {
                  surfaceIndex += 1;
                  const referenceId = `HUD-VQA-${String(surfaceIndex).padStart(3, '0')}`;
                  return (
                    <VisualQaSurfaceCard
                      key={`${run.runId}:${surface.surfaceId}`}
                      run={run}
                      surface={surface}
                      referenceId={referenceId}
                      isSubmitting={
                        submittingKey === `${run.runId}:${surface.surfaceId}`
                      }
                      onReview={submitReview}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className='text-app text-tertiary-token'>
          No Visual QA runs captured yet. Runs appear here after the post-deploy
          capture harness writes a diff summary.
        </p>
      )}
    </ContentSurfaceCard>
  );
}
