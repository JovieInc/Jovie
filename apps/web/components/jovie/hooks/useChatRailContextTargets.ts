'use client';

import { useMemo } from 'react';
import {
  createChatRailContextProjector,
  type ProjectChatRailContextTargetsInput,
} from '../chat-context-rail';

export function useChatRailContextTargets({
  conversationKey,
  messages,
  profile,
}: ProjectChatRailContextTargetsInput) {
  const project = useMemo(() => createChatRailContextProjector(), []);
  const profileId = profile?.id;
  const profileLabel = profile?.label;

  return useMemo(
    () =>
      project({
        conversationKey,
        messages,
        profile: profileId ? { id: profileId, label: profileLabel } : null,
      }),
    [project, conversationKey, messages, profileId, profileLabel]
  );
}
