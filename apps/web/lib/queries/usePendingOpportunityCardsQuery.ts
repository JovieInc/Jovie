'use client';

import { useQuery } from '@tanstack/react-query';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { FREQUENT_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

interface PendingSuggestedActionsResponse {
  readonly cards: readonly OpportunityInboxCardViewModel[];
}

/**
 * Pending opportunity cards for empty-chat (GH #13177).
 * Disabled when a conversation is already open — empty-state only.
 */
export function usePendingOpportunityCardsQuery({
  enabled = true,
}: {
  readonly enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: queryKeys.opportunityInbox.pendingCards(),
    queryFn: ({ signal }) =>
      fetchWithTimeout<PendingSuggestedActionsResponse>(
        '/api/connectors/suggested-actions',
        { signal }
      ),
    enabled,
    ...FREQUENT_CACHE,
    select: (data): readonly OpportunityInboxCardViewModel[] =>
      data.cards.slice(0, 3),
  });
}
