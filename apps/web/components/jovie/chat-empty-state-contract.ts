export type ChatEmptyStateAffordance =
  | 'none'
  | 'opportunity-cards'
  | 'starter-conversations'
  | 'suggestion-pills';

interface ResolveChatEmptyStateAffordanceInput {
  readonly conversationExists: boolean;
  readonly conversationInProgress: boolean;
  readonly composerHasIntent: boolean;
  readonly opportunityCardCount: number;
  readonly starterConversationCount: number;
  readonly suggestionCount: number;
}

/** One visibility contract for empty-chat affordances. */
export function resolveChatEmptyStateAffordance({
  conversationExists,
  conversationInProgress,
  composerHasIntent,
  opportunityCardCount,
  starterConversationCount,
  suggestionCount,
}: ResolveChatEmptyStateAffordanceInput): ChatEmptyStateAffordance {
  if (conversationExists || conversationInProgress || composerHasIntent) {
    return 'none';
  }
  if (opportunityCardCount > 0) return 'opportunity-cards';
  if (starterConversationCount > 0) return 'starter-conversations';
  if (suggestionCount > 0) return 'suggestion-pills';
  return 'none';
}
