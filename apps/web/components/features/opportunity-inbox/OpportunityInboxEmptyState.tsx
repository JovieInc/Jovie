'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { OpportunityInboxEmptyActionCard } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

export interface OpportunityInboxEmptyStateProps {
  readonly actionCards: readonly OpportunityInboxEmptyActionCard[];
  readonly className?: string;
}

export function OpportunityInboxEmptyState({
  actionCards,
  className,
}: OpportunityInboxEmptyStateProps) {
  return (
    <section
      className={cn('system-b-opportunity-inbox-empty', className)}
      data-testid='opportunity-inbox-empty-state'
    >
      <header className='system-b-opportunity-inbox-empty-header'>
        {/* ui-casing-allow: design-locked inbox copy */}
        <h2 className='system-b-opportunity-inbox-empty-title'>
          Your inbox is clear
        </h2>
        <p className='system-b-opportunity-inbox-empty-subtitle'>
          Empty is never blank. Start with one of these moves while Jovie
          watches for the next opportunity.
        </p>
      </header>

      <div className='system-b-opportunity-inbox-empty-grid'>
        {actionCards.map(card => (
          <article
            key={card.id}
            className='system-b-opportunity-inbox-empty-card'
            data-testid={`opportunity-inbox-empty-card-${card.id}`}
          >
            <div className='system-b-opportunity-inbox-empty-card-copy'>
              <h3 className='system-b-opportunity-inbox-empty-card-title'>
                {card.title}
              </h3>
              <p className='system-b-opportunity-inbox-empty-card-body'>
                {card.body}
              </p>
            </div>
            <Link
              href={card.href}
              className='system-b-opportunity-inbox-empty-card-action'
            >
              {card.actionLabel}
              <ArrowRight className='system-b-opportunity-inbox-primary-icon' />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
