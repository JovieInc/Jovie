'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { Sparkline } from '@/components/shell/Sparkline';
import type {
  StoryFirstBottleneck,
  StoryFirstGlancePulse,
  StoryFirstStageBucket,
} from '@/lib/ovie/home/story-first';
import { cn } from '@/lib/utils';
import type { HomeLoopSectionStatus } from './HomeLoopSection';

const TONE_DOT: Record<StoryFirstBottleneck['tone'], string> = {
  clear: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-error',
  unknown: 'bg-warning',
  loading: 'bg-subtle',
};

const DELTA_TONE: Record<string, string> = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-error',
  neutral: 'text-tertiary-token',
};

export interface StoryFirstCanvasProps {
  readonly bottleneck: StoryFirstBottleneck;
  readonly glance: readonly StoryFirstGlancePulse[];
  readonly stages: readonly StoryFirstStageBucket[];
  readonly inFlightHref?: string;
  /** Start typing → board melts; composer stays docked below. */
  readonly melting?: boolean;
  /** Generated Summer answer when a turn is present. */
  readonly answer?: ReactNode;
  readonly glanceLoading?: boolean;
  /** Shipping stage read — error must not look like an empty pipeline. */
  readonly stagesStatus?: HomeLoopSectionStatus;
  readonly onRetryStages?: () => void;
}

function GlancePulse({
  pulse,
  loading,
}: Readonly<{
  readonly pulse: StoryFirstGlancePulse;
  readonly loading: boolean;
}>) {
  const body = (
    <div
      className='flex flex-col gap-1.5 py-2'
      data-testid={`story-first-glance-${pulse.key}`}
      data-tone={pulse.tone}
    >
      <span className='text-2xs font-medium tracking-wide text-tertiary-token'>
        {pulse.label}
      </span>
      {loading ? (
        <LoadingSkeleton height='h-8' width='w-20' />
      ) : (
        <div className='flex items-baseline gap-2'>
          <span
            className={cn(
              'text-3xl font-semibold tracking-tight tabular-nums',
              pulse.measured ? 'text-primary-token' : 'text-tertiary-token'
            )}
          >
            {pulse.value}
          </span>
          {pulse.delta ? (
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                DELTA_TONE[pulse.tone] ?? DELTA_TONE.neutral
              )}
            >
              {pulse.delta}
            </span>
          ) : null}
        </div>
      )}
      {pulse.points.length >= 2 ? (
        <Sparkline
          points={pulse.points}
          trend={pulse.trend}
          ariaLabel={`${pulse.label} trend`}
          className='h-8 w-full'
        />
      ) : (
        <div className='h-8' aria-hidden='true' />
      )}
    </div>
  );

  if (pulse.href && !loading) {
    return (
      <a
        href={pulse.href}
        className='block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
      >
        {body}
      </a>
    );
  }
  return body;
}

function BottleneckHero({
  story,
}: Readonly<{ readonly story: StoryFirstBottleneck }>) {
  return (
    <section
      aria-label='Bottleneck'
      className='flex min-w-0 flex-1 flex-col gap-3'
      data-testid='story-first-bottleneck'
      data-tone={story.tone}
    >
      <div className='flex items-center gap-2'>
        <span
          aria-hidden='true'
          className={cn('size-1.5 rounded-full', TONE_DOT[story.tone])}
        />
        <span className='text-2xs font-medium tracking-wide text-tertiary-token'>
          {story.eyebrow}
        </span>
      </div>
      {story.tone === 'loading' ? (
        <>
          <LoadingSkeleton height='h-10' width='w-3/4' />
          <LoadingSkeleton height='h-4' width='w-1/2' />
        </>
      ) : (
        <>
          <h1 className='text-balance text-3xl font-semibold tracking-tight text-primary-token sm:text-4xl'>
            {story.title}
          </h1>
          <p className='max-w-prose text-sm text-pretty text-secondary-token sm:text-base'>
            {story.body}
          </p>
          {story.moving || story.needs || story.since || story.detailsHref ? (
            <div className='mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-xs text-tertiary-token'>
              {story.moving || story.needs || story.since ? (
                <dl className='flex flex-wrap gap-x-5 gap-y-2'>
                  {story.moving ? (
                    <div className='flex gap-1.5'>
                      <dt className='font-medium tracking-wide'>Moving</dt>
                      <dd>
                        {story.moving.href ? (
                          <a
                            href={story.moving.href}
                            className='text-accent underline-offset-2 hover:underline'
                          >
                            {story.moving.label}
                          </a>
                        ) : (
                          story.moving.label
                        )}
                      </dd>
                    </div>
                  ) : null}
                  {story.needs ? (
                    <div className='flex gap-1.5'>
                      <dt className='font-medium tracking-wide'>Needs</dt>
                      <dd className='text-secondary-token'>{story.needs}</dd>
                    </div>
                  ) : null}
                  {story.since ? (
                    <div className='flex gap-1.5'>
                      <dt className='font-medium tracking-wide'>Since</dt>
                      <dd>{story.since}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {story.detailsHref ? (
                <a
                  href={story.detailsHref}
                  className='text-accent underline-offset-2 hover:underline'
                >
                  Details
                </a>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function StageBuckets({
  stages,
  href,
  status,
  onRetry,
}: Readonly<{
  readonly stages: readonly StoryFirstStageBucket[];
  readonly href?: string;
  readonly status: HomeLoopSectionStatus;
  readonly onRetry?: () => void;
}>) {
  return (
    <section
      aria-label='In Flight'
      className='flex flex-col gap-3'
      data-testid='story-first-stages'
      data-status={status}
    >
      <div className='flex items-baseline justify-between gap-3'>
        <h2 className='text-balance text-2xs font-medium tracking-wide text-tertiary-token'>
          In Flight
        </h2>
        {href ? (
          <a
            href={href}
            className='text-xs text-accent underline-offset-2 hover:underline'
            data-testid='story-first-stages-more'
          >
            Open Shipping →
          </a>
        ) : null}
      </div>
      {status === 'loading' ? (
        <LoadingSkeleton height='h-16' width='w-full' />
      ) : status === 'error' ? (
        <div
          role='alert'
          className='flex flex-wrap items-center gap-3 border border-subtle px-3 py-2 text-xs text-secondary-token'
          data-testid='story-first-stages-error'
        >
          <span>Shipping stages could not load.</span>
          {onRetry ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={onRetry}
            >
              {/* ui-casing-allow: recovery action sentence case (Tim, 2026-09-28) */}
              Try again
            </Button>
          ) : null}
        </div>
      ) : (
        <ol className='grid grid-cols-2 gap-0 sm:grid-cols-5'>
          {stages.map((bucket, index) => (
            <li
              key={bucket.stage}
              className={cn(
                'flex min-w-0 flex-col gap-1 px-3 py-1 first:pl-0 last:pr-0',
                index > 0 && 'border-l border-subtle'
              )}
              data-testid={`story-first-stage-${bucket.stage}`}
              data-highlighted={bucket.highlight ? 'true' : 'false'}
            >
              <span className='text-2xs text-tertiary-token'>
                {bucket.label}
              </span>
              <span
                className={cn(
                  'text-2xl font-semibold tabular-nums tracking-tight',
                  bucket.highlight ? 'text-accent' : 'text-primary-token'
                )}
              >
                {bucket.count}
              </span>
              {bucket.highlight ? (
                <span className='truncate text-2xs text-accent'>
                  {bucket.highlight.identifier} {bucket.highlight.title}
                </span>
              ) : (
                <span className='h-4' aria-hidden='true' />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Story First flat Home: bottleneck owns the fold, three glance pulses as a
 * quiet right rail, stage buckets + one highlight, no card chrome. Typing in
 * the docked composer melts the board (composer stays).
 */
export function StoryFirstCanvas({
  bottleneck,
  glance,
  stages,
  inFlightHref,
  melting = false,
  answer,
  glanceLoading = false,
  stagesStatus = 'ready',
  onRetryStages,
}: StoryFirstCanvasProps) {
  return (
    <div
      className='@container flex w-full flex-col gap-8 lg:h-full lg:min-h-0'
      data-testid='story-first-canvas'
      data-melting={melting ? 'true' : 'false'}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-8 transition-opacity duration-cinematic ease-out',
          melting &&
            'pointer-events-none opacity-40 blur-sm motion-reduce:blur-none'
        )}
        data-testid='story-first-board'
        aria-hidden={melting || undefined}
      >
        <div className='flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12'>
          <BottleneckHero story={bottleneck} />
          <aside
            aria-label='Glance'
            className='flex w-full shrink-0 flex-col divide-y divide-subtle lg:w-48'
            data-testid='story-first-glance'
          >
            {glance.map(pulse => (
              <GlancePulse
                key={pulse.key}
                pulse={pulse}
                loading={glanceLoading}
              />
            ))}
          </aside>
        </div>
        <StageBuckets
          stages={stages}
          href={inFlightHref}
          status={stagesStatus}
          onRetry={onRetryStages}
        />
      </div>
      {answer ? (
        <div
          className={cn(
            'max-h-1/2 shrink-0 overflow-y-auto transition-opacity duration-cinematic',
            melting ? 'opacity-100' : 'opacity-90'
          )}
          data-testid='story-first-answer'
        >
          {answer}
        </div>
      ) : null}
    </div>
  );
}
