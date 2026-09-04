'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';
import type { OpportunityInboxEmptyActionCard } from '@/lib/connectors/opportunity-inbox-types';
import { FounderReviewRecorder } from './FounderReviewRecorder';

export interface OpportunityInboxEmptyStateProps {
  readonly actionCards?: readonly OpportunityInboxEmptyActionCard[];
  readonly founderMode?: boolean;
}

/**
 * Concise empty state (JOV-3931): one headline, one supporting line, one CTA.
 * Optional actionCards remain supported for legacy multi-card layouts.
 */
export function OpportunityInboxEmptyState({
  actionCards,
  founderMode = false,
}: OpportunityInboxEmptyStateProps) {
  const primaryCard = actionCards?.[0];
  const ctaHref = primaryCard?.href ?? APP_ROUTES.CHAT;
  const ctaLabel = primaryCard?.actionLabel ?? 'Start A Chat';

  if (!founderMode) {
    return (
      <EmptyState
        heading='Your Inbox Is Clear'
        description='Jovie is watching for the next opportunity.'
        action={{ href: ctaHref, label: ctaLabel }}
        presentation='workspace'
        testId='opportunity-inbox-empty-state'
      />
    );
  }

  return (
    <section
      className='rounded-lg border border-subtle bg-surface-0 p-4 sm:p-5'
      data-testid='opportunity-inbox-empty-state'
      aria-labelledby='founder-brain-dump-title'
    >
      <p className='text-2xs font-medium text-tertiary-token'>Inbox Clear</p>
      <h2
        id='founder-brain-dump-title'
        className='mt-2 text-xl font-semibold tracking-tight text-primary-token'
      >
        Start A Brain Dump
      </h2>
      <p className='mt-2 max-w-xl text-sm leading-6 text-secondary-token'>
        Capture the thought while it is fresh. Jovie will save the transcript
        and provenance without treating it as permission to publish.
      </p>
      <FounderReviewRecorder
        className='mt-4'
        target={{
          type: 'founder-note',
          id: 'founder-brain-dump',
          title: 'Inbox Brain Dump',
          sourceKind: 'founder.brain_dump',
          category: 'note',
        }}
      />
      {primaryCard ? (
        <p className='mt-5 border-t border-subtle pt-4 text-xs text-tertiary-token'>
          Want Jovie to find more signals?{' '}
          <Link
            className='font-medium text-primary-token underline underline-offset-4'
            href={primaryCard.href}
          >
            {primaryCard.actionLabel}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
