'use client';

import { Button } from '@jovie/ui';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { Sparkline } from '@/components/shell/Sparkline';
import {
  type StoryFirstBottleneck,
  type StoryFirstGlancePulse,
  type StoryFirstStageBucket,
  stripIssueId,
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

/**
 * Founder colour rule: greys, black and white carry the page; colour is only a
 * thin line, edge, dot or glow. Links and numbers are neutral text, so deltas
 * keep their direction in words ("+4", "-2"), not in a coloured fill.
 */
const NEUTRAL_LINK =
  'text-secondary-token underline-offset-2 transition-colors hover:text-primary-token hover:underline focus-visible:text-primary-token focus-visible:underline';

/** Editorial meta labels — flat board, no card chrome (no CSS uppercase; ASR-022). */
const META_LABEL = 'text-2xs font-medium tracking-wide text-tertiary-token';

/**
 * Reserved heights. Every late-loading region has the same fixed height in its
 * placeholder and its loaded state, so data arriving (or a poll refreshing)
 * never moves anything below it. Ovie Home only moves when Tim acts.
 */
export const HERO_MIN_H = 'min-h-32';
export const HERO_TITLE_H = 'min-h-9 sm:min-h-10';
export const HERO_BODY_H = 'min-h-5 sm:min-h-6';
export const GLANCE_VALUE_H = 'h-9';
export const STAGES_MIN_H = 'min-h-20';

/** Color the delta by its own direction, not by target attainment. */
export function deltaToneKey(
  delta: string,
  fallback: StoryFirstGlancePulse['tone']
): string {
  const trimmed = delta.trim();
  if (/^[-−]\d/.test(trimmed)) return 'bad';
  if (/^\+\d/.test(trimmed)) return 'good';
  if (/^[-−+]?0+(\.0+)?$/.test(trimmed) || trimmed === 'flat') return 'neutral';
  return fallback;
}

export interface StoryFirstCanvasProps {
  readonly bottleneck: StoryFirstBottleneck;
  readonly glance: readonly StoryFirstGlancePulse[];
  readonly stages: readonly StoryFirstStageBucket[];
  readonly inFlightHref?: string;
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
      className='flex flex-col gap-1.5 py-3'
      data-testid={`story-first-glance-${pulse.key}`}
      data-tone={pulse.tone}
    >
      <span className={META_LABEL}>{pulse.label}</span>
      {loading ? (
        <div className={cn('flex items-center', GLANCE_VALUE_H)}>
          <LoadingSkeleton height='h-8' width='w-20' />
        </div>
      ) : (
        <div className={cn('flex items-baseline gap-2', GLANCE_VALUE_H)}>
          <span
            className={cn(
              'text-3xl leading-9 font-semibold tracking-tight tabular-nums',
              pulse.measured ? 'text-primary-token' : 'text-tertiary-token'
            )}
          >
            {pulse.value}
          </span>
          {pulse.delta ? (
            <span
              className='text-xs font-medium tabular-nums text-tertiary-token'
              data-delta-tone={deltaToneKey(pulse.delta, pulse.tone)}
            >
              {pulse.delta}
            </span>
          ) : null}
        </div>
      )}
      {pulse.points.length >= 3 ? (
        <Sparkline
          points={pulse.points}
          trend={pulse.trend}
          variant='pulse'
          ariaLabel={`${pulse.label} trend`}
          className='mt-0.5 h-4 w-full'
        />
      ) : (
        <p
          className='h-4 truncate text-2xs text-tertiary-token'
          data-testid={`story-first-glance-${pulse.key}-reason`}
        >
          {pulse.measured ? null : pulse.reason}
        </p>
      )}
    </div>
  );

  if (pulse.href && !loading) {
    return (
      <a
        href={pulse.href}
        className='block rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-current'
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
      className={cn('flex min-w-0 flex-1 flex-col gap-3', HERO_MIN_H)}
      data-testid='story-first-bottleneck'
      data-tone={story.tone}
    >
      <div className='flex items-center gap-2'>
        <span
          aria-hidden='true'
          className={cn('size-1.5 rounded-full', TONE_DOT[story.tone])}
        />
        <span className={META_LABEL}>{story.eyebrow}</span>
      </div>
      {story.tone === 'loading' ? (
        <>
          <div className={cn('flex items-center', HERO_TITLE_H)}>
            <LoadingSkeleton height='h-8' width='w-3/4' />
          </div>
          <div className={cn('flex items-center', HERO_BODY_H)}>
            <LoadingSkeleton height='h-4' width='w-1/2' />
          </div>
        </>
      ) : (
        <>
          <h1
            className={cn(
              'text-balance text-3xl font-semibold tracking-tight text-primary-token sm:text-4xl',
              HERO_TITLE_H
            )}
          >
            {story.title}
          </h1>
          <p
            className={cn(
              'max-w-prose text-sm text-pretty text-secondary-token sm:text-base',
              HERO_BODY_H
            )}
          >
            {story.body}
          </p>
          {story.moving || story.needs || story.since || story.detailsHref ? (
            <div className='mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-xs text-tertiary-token'>
              {story.moving || story.needs || story.since ? (
                <dl className='flex flex-wrap gap-x-5 gap-y-2'>
                  {story.moving ? (
                    <div className='flex gap-1.5'>
                      <dt className={META_LABEL}>Moving</dt>
                      <dd>
                        {story.moving.href ? (
                          <a href={story.moving.href} className={NEUTRAL_LINK}>
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
                      <dt className={META_LABEL}>Needs</dt>
                      <dd className='text-secondary-token'>{story.needs}</dd>
                    </div>
                  ) : null}
                  {story.since ? (
                    <div className='flex gap-1.5'>
                      <dt className={META_LABEL}>Since</dt>
                      <dd>{story.since}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {story.detailsHref ? (
                <a href={story.detailsHref} className={NEUTRAL_LINK}>
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
        <h2 className={cn(META_LABEL, 'text-balance')}>
          In Flight
          <span className='font-normal'> · open agent PRs</span>
        </h2>
        {href ? (
          <a
            href={href}
            className={cn('text-xs', NEUTRAL_LINK)}
            data-testid='story-first-stages-more'
          >
            Open Shipping →
          </a>
        ) : null}
      </div>
      {status === 'loading' ? (
        <div className={cn('flex items-center', STAGES_MIN_H)}>
          <LoadingSkeleton height='h-16' width='w-full' />
        </div>
      ) : status === 'error' ? (
        <div
          role='alert'
          className={cn(
            'flex flex-wrap items-center gap-3 border-y border-subtle py-2 text-xs text-secondary-token',
            STAGES_MIN_H
          )}
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
        <ol
          className={cn('grid grid-cols-2 gap-0 sm:grid-cols-4', STAGES_MIN_H)}
        >
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
              <span className={cn(META_LABEL, 'flex items-center gap-1.5')}>
                {bucket.highlight ? (
                  <span
                    aria-hidden='true'
                    className='size-1 rounded-full bg-accent'
                  />
                ) : null}
                {bucket.label}
              </span>
              <span className='text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
                {bucket.count}
              </span>
              {bucket.highlight ? (
                <span className='truncate text-2xs text-secondary-token'>
                  {bucket.highlight.identifier}{' '}
                  {stripIssueId(
                    bucket.highlight.identifier,
                    bucket.highlight.title
                  )}
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
 * quiet right rail, stage buckets + one highlight, no card chrome. Static by
 * design: typing never blurs or moves it, and a turn hands off to the chat
 * transcript instead of animating this board.
 */
export function StoryFirstCanvas({
  bottleneck,
  glance,
  stages,
  inFlightHref,
  glanceLoading = false,
  stagesStatus = 'ready',
  onRetryStages,
}: StoryFirstCanvasProps) {
  return (
    <div
      className='@container flex w-full flex-col gap-10 lg:h-full lg:min-h-0'
      data-testid='story-first-canvas'
    >
      <div
        className='flex min-h-0 flex-1 flex-col gap-10'
        data-testid='story-first-board'
      >
        <div className='flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12'>
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
    </div>
  );
}
