'use client';

import { useMemo } from 'react';
import {
  type ChatFollowUp,
  PROFILE_CHAT_FOLLOW_UPS,
  profileFollowUpAnchorId,
} from '../profile-chat-follow-ups';
import { getChatPromptPillClass } from './chat-prompt-styles';

export interface ChatFollowUpsConfig {
  readonly afterMessageId: string;
  readonly items: readonly ChatFollowUp[];
  readonly onSelect: (prompt: string) => void;
}

/** Tappable next moves rendered under one assistant reply. */
export function ChatFollowUps({
  items,
  onSelect,
}: {
  readonly items: readonly ChatFollowUp[];
  readonly onSelect: (prompt: string) => void;
}) {
  return (
    <div className='flex flex-wrap gap-2 pt-1' data-testid='chat-follow-ups'>
      {items.map(item => (
        <button
          key={item.label}
          type='button'
          className={getChatPromptPillClass('compact')}
          onClick={() => onSelect(item.prompt)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Next moves under the first reply of a chat opened from the creator's own profile. */
export function useProfileChatFollowUps(
  messages: Parameters<typeof profileFollowUpAnchorId>[0],
  profileId: string | null | undefined,
  isStreaming: boolean,
  onSelect: ((prompt: string) => void) | undefined
): ChatFollowUpsConfig | null {
  const anchor = onSelect
    ? profileFollowUpAnchorId(messages, profileId, isStreaming)
    : null;
  return useMemo(
    () =>
      anchor && onSelect
        ? { afterMessageId: anchor, items: PROFILE_CHAT_FOLLOW_UPS, onSelect }
        : null,
    [anchor, onSelect]
  );
}
