'use client';

import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';

/**
 * One calm centered line (JOV-8967): the empty Inbox never renders setup
 * steps. Setup actions live on Home surfaces while incomplete; conversational
 * entry stays in chat, so the only next step is Start A Chat.
 */
export function OpportunityInboxEmptyState() {
  return (
    // ui-casing-allow: design-locked inbox copy
    <EmptyState
      heading='Your Inbox Is Clear'
      action={{ href: APP_ROUTES.CHAT, label: 'Start A Chat' }}
      testId='opportunity-inbox-empty-state'
    />
  );
}
