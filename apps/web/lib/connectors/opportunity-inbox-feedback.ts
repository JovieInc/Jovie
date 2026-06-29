export type OpportunityInboxFeedbackRating = 'positive' | 'negative';

export function buildOpportunityInboxFeedbackMessage(
  rating: OpportunityInboxFeedbackRating,
  comment?: string
): string {
  const prefix =
    rating === 'positive' ? 'Helpful suggestion' : 'Not helpful suggestion';
  const trimmedComment = comment?.trim();

  if (trimmedComment) {
    return `${prefix}: ${trimmedComment}`;
  }

  return prefix;
}
