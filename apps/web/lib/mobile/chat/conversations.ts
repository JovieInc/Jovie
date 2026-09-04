import 'server-only';

import {
  getCreatorConversationDetail,
  listCreatorConversations,
} from '@/lib/chat/conversation-queries';
import { embedMobileMerchArtifactsInContent } from '@/lib/mobile/chat/tool-artifacts';
import { isOvConversationTitle } from '@/lib/mobile/workspace';
import type { AppShellMode } from '@/types/app-shell';

export interface MobileConversationSummary {
  readonly id: string;
  readonly title: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly latestMessageRole: string | null;
  readonly latestTurnStatus: string | null;
}

export interface MobileConversationMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly clientMessageId: string | null;
  readonly turnId: string | null;
  readonly turnStatus: string | null;
  readonly createdAt: Date;
  readonly requiresWebHandoff: boolean;
}

export async function listMobileConversations(input: {
  readonly creatorProfileId: string;
  readonly limit?: number;
  readonly workspace?: AppShellMode;
}): Promise<readonly MobileConversationSummary[]> {
  const conversations = await listCreatorConversations({
    creatorProfileId: input.creatorProfileId,
    limit: 50,
  });
  const ov = input.workspace === 'ov';
  return conversations
    .filter(conversation => {
      const isOv = isOvConversationTitle(conversation.title);
      return ov ? isOv : !isOv;
    })
    .slice(0, input.limit ?? 20);
}

export async function getMobileConversationDetail(input: {
  readonly conversationId: string;
  readonly creatorProfileId: string;
  readonly limit?: number;
  readonly before?: string | null;
}): Promise<{
  readonly conversation: {
    readonly id: string;
    readonly title: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly messages: readonly MobileConversationMessage[];
  readonly hasMore: boolean;
} | null> {
  const detail = await getCreatorConversationDetail(input);

  if (!detail) {
    return null;
  }

  return {
    conversation: detail.conversation,
    hasMore: detail.hasMore,
    messages: detail.messages.map(message => ({
      id: message.id,
      role: message.role,
      content: embedMobileMerchArtifactsInContent(
        message.content,
        message.toolCalls
      ),
      clientMessageId: message.clientMessageId,
      turnId: message.turnId,
      turnStatus: message.turnStatus,
      createdAt: message.createdAt,
      requiresWebHandoff: message.toolCalls.length > 0,
    })),
  };
}
