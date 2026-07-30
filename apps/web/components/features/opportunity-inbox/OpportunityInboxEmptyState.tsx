import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';
import type { OpportunityInboxEmptyActionCard } from '@/lib/connectors/opportunity-inbox-types';

export interface OpportunityInboxEmptyStateProps {
  readonly actionCards?: readonly OpportunityInboxEmptyActionCard[];
}

/**
 * Concise empty state (JOV-3931): one headline, one supporting line, one CTA.
 * Optional actionCards remain supported for legacy multi-card layouts.
 */
export function OpportunityInboxEmptyState({
  actionCards,
}: OpportunityInboxEmptyStateProps) {
  const primaryCard = actionCards?.[0];
  const ctaHref = primaryCard?.href ?? APP_ROUTES.CHAT;
  const ctaLabel = primaryCard?.actionLabel ?? 'Start A Chat';

  return (
    <EmptyState
      heading='Your Inbox Is Clear'
      description='Jovie is watching for the next opportunity.'
      action={{ href: ctaHref, label: ctaLabel }}
      testId='opportunity-inbox-empty-state'
    />
  );
}
