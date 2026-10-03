import 'server-only';

import { listPendingDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import { captureError } from '@/lib/error-tracking';
import {
  inboxItemFromDesignProposal,
  inboxItemFromSummerCard,
  type OvieInboxItem,
  type OvieInboxResponse,
  sortInboxItems,
} from './inbox';
import { listSummerCards } from './summer-cards.server';

const DECIDED_HISTORY_LIMIT = 50;

async function settle<T>(
  label: string,
  load: () => Promise<T>
): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    await captureError(`Ovie inbox ${label} failed`, error, {
      route: '/app/ov/inbox',
    });
    return { ok: false };
  }
}

/**
 * One source degrading never blanks the other: each source reports its own
 * health so the page can name the broken one instead of showing zero.
 */
export async function buildOvieInbox(): Promise<OvieInboxResponse> {
  const [summerPending, summerDecided, proposals] = await Promise.all([
    settle('summer pending', () =>
      listSummerCards({ status: 'pending', limit: 100 })
    ),
    settle('summer decided', () =>
      listSummerCards({ status: 'decided', limit: DECIDED_HISTORY_LIMIT })
    ),
    settle('design lab', () => listPendingDesignProposals()),
  ]);

  const pending: OvieInboxItem[] = [
    ...(summerPending.ok ? summerPending.value : []).map(
      inboxItemFromSummerCard
    ),
    ...(proposals.ok ? proposals.value : [])
      .filter(proposal => proposal.status === 'pending')
      .map(inboxItemFromDesignProposal),
  ];
  const decided = (summerDecided.ok ? summerDecided.value : []).map(
    inboxItemFromSummerCard
  );

  return {
    pending: sortInboxItems(pending),
    decided: decided.toSorted((left, right) =>
      (right.decidedAt ?? right.createdAt).localeCompare(
        left.decidedAt ?? left.createdAt
      )
    ),
    sources: {
      summer: summerPending.ok && summerDecided.ok ? 'ok' : 'error',
      'design-lab': proposals.ok ? 'ok' : 'error',
    },
    fetchedAt: new Date().toISOString(),
  };
}
