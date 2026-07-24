'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { OpportunityInboxEmptyActionCard } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

export interface OpportunityInboxEmptyStateProps {
  readonly actionCards?: readonly OpportunityInboxEmptyActionCard[];
  readonly className?: string;
}

/**
 * Concise empty state (JOV-3931): one headline, one supporting line, one CTA.
 * Optional actionCards remain supported for legacy multi-card layouts.
 */
export function OpportunityInboxEmptyState({
  actionCards,
  className,
}: OpportunityInboxEmptyStateProps) {
  const primaryCard = actionCards?.[0];
  const ctaHref = primaryCard?.href ?? APP_ROUTES.CHAT;
  const ctaLabel = primaryCard?.actionLabel ?? 'Start A Chat';

  return (
    <section
      className={cn('system-b-opportunity-inbox-empty', className)}
      data-testid='opportunity-inbox-empty-state'
    >
      <header className='system-b-opportunity-inbox-empty-header'>
        {/* ui-casing-allow: design-locked inbox copy */}
        <h2 className='system-b-opportunity-inbox-empty-title'>
          Your Inbox Is Clear
        </h2>
        <p className='system-b-opportunity-inbox-empty-subtitle'>
          Jovie is watching for the next opportunity.
        </p>
      </header>

      <div className='mt-4'>
        <Link
          href={ctaHref}
          className='system-b-opportunity-inbox-empty-card-action inline-flex items-center gap-1.5'
          data-testid='opportunity-inbox-empty-cta'
        >
          {ctaLabel}
          <ArrowRight className='system-b-opportunity-inbox-primary-icon' />
        </Link>
      </div>
    </section>
  );
}
