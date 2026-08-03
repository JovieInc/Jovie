export type ChatEmptyStateAffordance =
  | 'none'
  | 'opportunity-cards'
  | 'starter-actions'
  | 'suggestion-pills';

interface ResolveChatEmptyStateAffordanceInput {
  readonly conversationExists: boolean;
  readonly conversationInProgress: boolean;
  readonly composerHasIntent: boolean;
  readonly opportunityCardCount: number;
  readonly starterActionCount: number;
  readonly suggestionCount: number;
}

/** One visibility contract for empty-chat affordances. */
export function resolveChatEmptyStateAffordance({
  conversationExists,
  conversationInProgress,
  composerHasIntent,
  opportunityCardCount,
  starterActionCount,
  suggestionCount,
}: ResolveChatEmptyStateAffordanceInput): ChatEmptyStateAffordance {
  if (conversationExists || conversationInProgress || composerHasIntent) {
    return 'none';
  }
  if (opportunityCardCount > 0) return 'opportunity-cards';
  if (starterActionCount > 0) return 'starter-actions';
  if (suggestionCount > 0) return 'suggestion-pills';
  return 'none';
}
