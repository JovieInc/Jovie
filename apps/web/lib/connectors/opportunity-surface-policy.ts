import type { OpportunityInboxCardViewModel } from './opportunity-inbox-types';

const CUSTOMER_CHAT_OPPORTUNITY_CATEGORIES = new Set([
  'suggestion',
  'tour_date',
  'report',
  'brand_deal',
]);

export interface CustomerPinnedOpportunity {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly typeLabel: string;
  readonly primaryActionLabel?: string;
  readonly signalType?: string;
}

/**
 * Customer chat is allowlist-only. New Inbox card categories stay internal
 * until this boundary explicitly admits them.
 */
export function isCustomerChatOpportunityCategory(category: unknown): boolean {
  return (
    typeof category === 'string' &&
    CUSTOMER_CHAT_OPPORTUNITY_CATEGORIES.has(category)
  );
}

/** Normalize an authoritative customer-visible card for prompt context. */
export function normalizeCustomerPinnedOpportunity(
  value: unknown
): CustomerPinnedOpportunity | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isCustomerChatOpportunityCategory(record.category)) return null;

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!id || !title) return null;

  return {
    id: id.slice(0, 80),
    title: title.slice(0, 200),
    why: typeof record.why === 'string' ? record.why.trim().slice(0, 500) : '',
    typeLabel:
      typeof record.typeLabel === 'string'
        ? record.typeLabel.trim().slice(0, 80)
        : '',
    ...(typeof record.primaryActionLabel === 'string'
      ? { primaryActionLabel: record.primaryActionLabel.trim().slice(0, 120) }
      : {}),
    ...(typeof record.signalType === 'string'
      ? { signalType: record.signalType.trim().slice(0, 80) }
      : {}),
  };
}

/**
 * Resolve client input against the authenticated user's authoritative cards.
 * Client-provided title, category, and evidence are ignored.
 */
export function resolveCustomerChatPinnedOpportunity(
  cards: readonly OpportunityInboxCardViewModel[],
  value: unknown
): CustomerPinnedOpportunity | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;

  const authoritativeCard = cards.find(card => card.id === id);
  return normalizeCustomerPinnedOpportunity(authoritativeCard);
}
