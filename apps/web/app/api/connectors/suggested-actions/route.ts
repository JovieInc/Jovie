/**
 * GET /api/connectors/suggested-actions
 *
 * Returns pending opportunity cards for the authenticated user (suggested_actions
 * rows with status=pending). Used by empty-chat opportunity cards (GH #13177).
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { loadOpportunityInboxData } from '@/lib/connectors/opportunity-inbox-data';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

/** Chat empty-state surfaces at most 3 cards. */
const CHAT_EMPTY_STATE_CARD_LIMIT = 3;

export interface PendingSuggestedActionsResponse {
  readonly cards: readonly OpportunityInboxCardViewModel[];
}

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const inbox = await loadOpportunityInboxData(userId);
    if (!inbox) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const cards = inbox.cards.slice(0, CHAT_EMPTY_STATE_CARD_LIMIT);
    const payload: PendingSuggestedActionsResponse = { cards };

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    logger.error('[suggested-actions] list pending failed', err);
    await captureError('List pending suggested actions failed', err, {
      route: '/api/connectors/suggested-actions',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
