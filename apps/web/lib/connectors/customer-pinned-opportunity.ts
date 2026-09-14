import 'server-only';
import { logger } from '@/lib/utils/logger';
import { loadOpportunityInboxData } from './opportunity-inbox-data';
import { resolveCustomerChatPinnedOpportunity } from './opportunity-surface-policy';

export async function loadCustomerChatPinnedOpportunity(
  userId: string,
  candidate: unknown
) {
  if (!candidate || typeof candidate !== 'object') return null;
  const id = (candidate as Record<string, unknown>).id;
  if (typeof id !== 'string' || !id.trim()) return null;
  try {
    const inbox = await loadOpportunityInboxData(userId);
    return inbox
      ? resolveCustomerChatPinnedOpportunity(inbox.cards, candidate)
      : null;
  } catch (error) {
    logger.error('[customer-chat] pinned opportunity resolution failed', error);
    return null;
  }
}
