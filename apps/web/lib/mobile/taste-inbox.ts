import 'server-only';

import { listPendingDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import type { MobileInboxResponse } from './action-loop-inbox';

const OV_INBOX_CHAT_PROMPT =
  'Ask Summer which taste cards and stills need a decision.';

/**
 * Admin-only Ovie inbox: post-land Design Lab cards and stills. Product taste
 * never becomes a pre-merge label or a human-owned implementation queue.
 * Never includes the artist action-loop.
 */
export async function buildMobileTasteInbox(): Promise<MobileInboxResponse> {
  const proposals = await listPendingDesignProposals();

  const items = [
    ...proposals.map(proposal => {
      const stillUrl =
        proposal.assetRefs.find(
          ref => ref.startsWith('https://') || ref.startsWith('http://')
        ) ?? null;
      return {
        id: `proposal:${proposal.dayBucket ?? 'none'}:${proposal.id}`,
        typeLabel: stillUrl ? 'Still' : 'Card',
        createdAt: proposal.createdAt,
        title: proposal.surfaceName,
        why: proposal.proposalText,
        primaryActionLabel: 'Review',
        status: 'pending' as const,
        imageUrl: stillUrl,
      };
    }),
  ].toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    pendingCount: items.length,
    items,
    emptyActionCards: [],
    chatPrompt: OV_INBOX_CHAT_PROMPT,
  };
}
