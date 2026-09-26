import 'server-only';

import { listPendingDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import type { SummerCard } from '@/lib/ovie/summer-cards';
import { listSummerCards } from '@/lib/ovie/summer-cards.server';
import type { MobileInboxResponse } from './action-loop-inbox';

const OV_INBOX_CHAT_PROMPT =
  'Ask Summer which taste cards and stills need a decision.';

const SUMMER_CARD_TYPE_LABELS: Record<SummerCard['kind'], string> = {
  outbound: 'Outbound',
  spend: 'Spend',
  taste: 'Taste',
  decision: 'Decision',
};

/**
 * Admin-only Ovie inbox: post-land Design Lab cards and stills, plus pending
 * Summer approval cards. Product taste never becomes a pre-merge label or a
 * human-owned implementation queue.
 * Never includes the artist action-loop.
 */
export async function buildMobileTasteInbox(): Promise<MobileInboxResponse> {
  const [proposals, summerCards] = await Promise.all([
    listPendingDesignProposals(),
    listSummerCards({ status: 'pending', limit: 100 }),
  ]);

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
    ...summerCards.map(card => ({
      id: `summer-card:${card.id}`,
      typeLabel: SUMMER_CARD_TYPE_LABELS[card.kind],
      createdAt: card.createdAt,
      title: card.title,
      why: card.recommendation,
      primaryActionLabel: 'Decide',
      status: 'pending' as const,
      imageUrl: null,
    })),
  ].toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    pendingCount: items.length,
    items,
    emptyActionCards: [],
    chatPrompt: OV_INBOX_CHAT_PROMPT,
  };
}
