import 'server-only';

import { and, eq, isNull, like, notLike, or, type SQL } from 'drizzle-orm';
import { chatConversations } from '@/lib/db/schema/chat';

export const OV_CONVERSATION_TITLE_PREFIX = 'OV | ';

export type ConversationAudience = 'customer' | 'ov';

function conversationAudienceCondition(
  audience: ConversationAudience
): SQL | undefined {
  if (audience === 'ov') {
    return like(chatConversations.title, `${OV_CONVERSATION_TITLE_PREFIX}%`);
  }

  return or(
    isNull(chatConversations.title),
    notLike(chatConversations.title, `${OV_CONVERSATION_TITLE_PREFIX}%`)
  );
}

/**
 * Authoritative customer/operator conversation boundary.
 *
 * A profile association is context, not ownership: every authenticated read
 * or mutation must also match the app user that owns the conversation. The
 * audience condition keeps founder/operator sessions out of customer routes.
 */
export function ownedConversationCondition(input: {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly audience: ConversationAudience;
  readonly conversationId?: string;
}): SQL | undefined {
  return and(
    ...(input.conversationId
      ? [eq(chatConversations.id, input.conversationId)]
      : []),
    eq(chatConversations.userId, input.userId),
    eq(chatConversations.creatorProfileId, input.creatorProfileId),
    conversationAudienceCondition(input.audience)
  );
}

export function titleForConversationAudience(
  title: string,
  audience: ConversationAudience
): string {
  if (audience !== 'ov' || title.startsWith(OV_CONVERSATION_TITLE_PREFIX)) {
    return title;
  }
  return `${OV_CONVERSATION_TITLE_PREFIX}${title}`;
}
