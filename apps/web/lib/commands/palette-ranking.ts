import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';

// @coverage-via apps/web/tests/unit/lib/commands/palette-ranking.test.ts

const ACTIVE_CHAT_STATUSES = new Set<ChatConversation['latestTurnStatus']>([
  'reserved',
  'running',
  'streaming',
]);

const FAILED_CHAT_STATUSES = new Set<ChatConversation['latestTurnStatus']>([
  'failed_tool_unavailable',
  'failed_model_error',
  'failed_timeout',
  'failed_network',
]);

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function conversationPriority(
  conversation: ChatConversation,
  currentConversationId: string | null
): number {
  if (conversation.id === currentConversationId) return 0;
  if (ACTIVE_CHAT_STATUSES.has(conversation.latestTurnStatus)) return 1;
  if (FAILED_CHAT_STATUSES.has(conversation.latestTurnStatus)) return 2;
  return 3;
}

/**
 * Rank palette conversations using only explainable product signals:
 * current route, active/attention state, then the last touched timestamp.
 */
export function rankPaletteConversations(
  conversations: readonly ChatConversation[],
  currentConversationId: string | null
): ChatConversation[] {
  return conversations
    .map((conversation, index) => ({ conversation, index }))
    .sort((left, right) => {
      const priorityDelta =
        conversationPriority(left.conversation, currentConversationId) -
        conversationPriority(right.conversation, currentConversationId);
      if (priorityDelta !== 0) return priorityDelta;

      const recencyDelta =
        timestamp(right.conversation.updatedAt) -
        timestamp(left.conversation.updatedAt);
      return recencyDelta || left.index - right.index;
    })
    .map(({ conversation }) => conversation);
}

/** Visible reason for a conversation's position in the default palette. */
export function getPaletteConversationSubtitle(
  conversation: ChatConversation,
  currentConversationId: string | null
): string {
  if (conversation.id === currentConversationId) return 'Current chat';
  if (ACTIVE_CHAT_STATUSES.has(conversation.latestTurnStatus)) {
    return 'Active chat';
  }
  if (FAILED_CHAT_STATUSES.has(conversation.latestTurnStatus)) {
    return 'Needs attention';
  }
  return 'Recent chat';
}

interface PaletteReleaseRankable {
  readonly status?: 'draft' | 'scheduled' | 'released';
  readonly releaseDate?: string;
}

function releasePriority(status: PaletteReleaseRankable['status']): number {
  if (status === 'draft') return 0;
  if (status === 'scheduled') return 1;
  return 2;
}

/** Drafts first, then scheduled work, then released catalog; newest date wins ties. */
export function rankPaletteReleases<T extends PaletteReleaseRankable>(
  releases: readonly T[]
): T[] {
  return releases
    .map((release, index) => ({ release, index }))
    .sort((left, right) => {
      const priorityDelta =
        releasePriority(left.release.status) -
        releasePriority(right.release.status);
      if (priorityDelta !== 0) return priorityDelta;

      const dateDelta =
        timestamp(right.release.releaseDate) -
        timestamp(left.release.releaseDate);
      return dateDelta || left.index - right.index;
    })
    .map(({ release }) => release);
}
