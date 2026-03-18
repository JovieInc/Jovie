'use client';

import { useCallback } from 'react';
import { useTrackingMutation } from '@/lib/queries';

/**
 * Shared hook for tracking tour date ticket link clicks.
 * Fires a tracking mutation and opens the ticket URL in a new tab.
 */
export function useTourDateTicketClick(
  handle: string,
  tourDateId: string,
  ticketUrl: string | null
) {
  const trackClick = useTrackingMutation({ endpoint: '/api/track' });

  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!ticketUrl) return;
      trackClick.mutate({
        handle,
        linkType: 'other',
        target: ticketUrl,
        context: { contentType: 'tour_date', contentId: tourDateId },
      });
      globalThis.open(ticketUrl, '_blank', 'noopener,noreferrer');
    },
    // trackClick.mutate is stable in TanStack Query v5 — omit trackClick object
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handle, ticketUrl, tourDateId]
  );
}
