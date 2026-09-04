'use client';

import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';

export interface OpportunityInboxYoutubeThumbnailCardProps {
  readonly card: OpportunityInboxCardViewModel;
  readonly onApprove: (id: string) => void;
  readonly onReject: (id: string) => void;
  readonly isBusy?: boolean;
}

function formatMetric(value: number | null, suffix = ''): string {
  return value === null ? 'Unavailable' : `${value.toLocaleString()}${suffix}`;
}

function formatDecisionDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function OpportunityInboxYoutubeThumbnailCard({
  card,
  onApprove,
  onReject,
  isBusy = false,
}: OpportunityInboxYoutubeThumbnailCardProps) {
  const candidate = card.youtubeThumbnail;
  if (!candidate) return null;

  return (
    <article
      className='system-b-opportunity-inbox-card overflow-hidden rounded-xl border border-subtle bg-surface-1 p-4'
      data-testid={`opportunity-inbox-youtube-thumbnail-${card.id}`}
    >
      <header className='system-b-opportunity-inbox-card-meta flex items-center gap-1 text-2xs text-tertiary-token'>
        <span className='system-b-opportunity-inbox-card-type'>
          {card.typeLabel}
        </span>
        <span
          aria-hidden='true'
          className='system-b-opportunity-inbox-card-dot'
        >
          ·
        </span>
        <time
          className='system-b-opportunity-inbox-card-time'
          dateTime={card.createdAt}
        >
          {formatDecisionDate(card.createdAt)}
        </time>
      </header>

      <h2 className='system-b-opportunity-inbox-card-title mt-2 text-lg font-semibold text-primary-token'>
        {card.title}
      </h2>

      <div className='mt-3 grid grid-cols-2 gap-2'>
        <figure className='min-w-0'>
          <figcaption className='mb-1 text-2xs font-medium text-tertiary-token'>
            Live control
          </figcaption>
          {candidate.currentThumbnailUrl ? (
            // External provider image; dimensions and aspect ratio are reserved.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidate.currentThumbnailUrl}
              alt='Current live YouTube thumbnail'
              className='aspect-video w-full rounded-md bg-surface-0 object-cover'
            />
          ) : (
            <div className='flex aspect-video items-center justify-center rounded-md bg-surface-0 text-2xs text-tertiary-token'>
              Control unavailable
            </div>
          )}
        </figure>
        <figure className='min-w-0'>
          <figcaption className='mb-1 text-2xs font-medium text-tertiary-token'>
            Candidate
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={candidate.candidateImageUrl}
            alt='Candidate YouTube thumbnail'
            className='aspect-video w-full rounded-md bg-surface-0 object-cover'
          />
        </figure>
      </div>

      <dl className='mt-3 grid grid-cols-3 gap-2 rounded-md bg-surface-0 p-3 text-xs'>
        <div>
          <dt className='text-tertiary-token'>Views</dt>
          <dd className='mt-0.5 font-medium tabular-nums text-primary-token'>
            {formatMetric(candidate.apiMetrics.views)}
          </dd>
        </div>
        <div>
          <dt className='text-tertiary-token'>Watch time</dt>
          <dd className='mt-0.5 font-medium tabular-nums text-primary-token'>
            {formatMetric(candidate.apiMetrics.watchTimeMinutes, ' min')}
          </dd>
        </div>
        <div>
          <dt className='text-tertiary-token'>Avg. view</dt>
          <dd className='mt-0.5 font-medium tabular-nums text-primary-token'>
            {formatMetric(candidate.apiMetrics.avgViewDurationSeconds, ' sec')}
          </dd>
        </div>
      </dl>

      <p className='mt-3 text-xs text-secondary-token'>{card.why}</p>
      <p className='mt-2 font-mono text-2xs text-quaternary-token'>
        Artifact {candidate.artifactSha256.slice(0, 12)}… · Video{' '}
        {candidate.youtubeVideoId}
      </p>

      <div className='system-b-opportunity-inbox-card-actions mt-4 flex items-center justify-end gap-2'>
        <button
          type='button'
          className='system-b-opportunity-inbox-dismiss inline-flex min-h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-secondary-token hover:bg-surface-0'
          disabled={isBusy}
          onClick={() => onReject(card.id)}
        >
          Reject
        </button>
        <button
          type='button'
          className='system-b-opportunity-inbox-primary inline-flex min-h-8 items-center justify-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50'
          disabled={isBusy}
          onClick={() => onApprove(card.id)}
        >
          {isBusy ? 'Saving…' : card.primaryActionLabel}
        </button>
      </div>
    </article>
  );
}
