import { loadOpportunityInboxData } from '@/lib/connectors/opportunity-inbox-data';
import type { OpportunityInboxEmptyActionCard } from '@/lib/connectors/opportunity-inbox-types';

export type MobileInboxActionItem = {
  readonly id: string;
  readonly typeLabel: string;
  readonly createdAt: string;
  readonly title: string;
  readonly why: string;
  readonly primaryActionLabel: string;
  readonly status: 'pending';
};

export type MobileInboxEmptyActionCard = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly continueOnWebPath: string;
};

export type MobileInboxResponse = {
  readonly pendingCount: number;
  readonly items: readonly MobileInboxActionItem[];
  readonly emptyActionCards: readonly MobileInboxEmptyActionCard[];
  readonly chatPrompt: string;
};

const INBOX_CHAT_PROMPT =
  'Ask Jovie which revenue opportunities I should act on first.';

function mapEmptyActionCard(
  card: OpportunityInboxEmptyActionCard
): MobileInboxEmptyActionCard {
  return {
    id: card.id,
    title: card.title,
    body: card.body,
    actionLabel: card.actionLabel,
    continueOnWebPath: card.href,
  };
}

/**
 * Condensed opportunity inbox for the iOS action-loop surface.
 * Reuses the web opportunity inbox mapper and suggested_actions query.
 */
export async function buildMobileInbox(
  clerkUserId: string
): Promise<MobileInboxResponse | null> {
  const inbox = await loadOpportunityInboxData(clerkUserId);
  if (!inbox) {
    return null;
  }

  return {
    pendingCount: inbox.cards.length,
    items: inbox.cards.map(card => ({
      id: card.id,
      typeLabel: card.typeLabel,
      createdAt: card.createdAt,
      title: card.title,
      why: card.why,
      primaryActionLabel: card.primaryActionLabel,
      status: card.status,
    })),
    emptyActionCards: inbox.emptyActionCards.map(mapEmptyActionCard),
    chatPrompt: INBOX_CHAT_PROMPT,
  };
}
