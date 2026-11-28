'use client';

import { useCallback, useEffect, useState } from 'react';
import { NEW_CHAT_REQUESTED_EVENT } from '@/lib/chat/new-chat-intent';
import { applyRootTitleTemplate } from '@/lib/seo/document-title';

interface ChatPageSessionOptions {
  readonly conversationId?: string;
  readonly initialConversationTitle: string | null;
  readonly chatMode?: 'ov';
}

/** Keeps page chrome aligned with routed and in-place conversation changes. */
export function useChatPageSession({
  conversationId,
  initialConversationTitle,
  chatMode,
}: ChatPageSessionOptions) {
  const [currentThreadTitle, setCurrentThreadTitle] = useState<string | null>(
    initialConversationTitle
  );
  const [currentConversationId, setCurrentConversationId] = useState(
    conversationId ?? null
  );
  const [chatSessionKey, setChatSessionKey] = useState(0);

  // A fresh route must not retain the previous conversation's title or ID.
  useEffect(() => {
    setCurrentThreadTitle(initialConversationTitle);
    setCurrentConversationId(conversationId ?? null);
  }, [conversationId, initialConversationTitle]);

  useEffect(() => {
    const handleNewChat = () => {
      // A thread created in place still belongs to /app/chat in Next. Visiting
      // that route again does not change props; an explicit intent resets it.
      // Routed threads reset through their conversationId transition.
      if (conversationId || chatMode === 'ov') return;
      setChatSessionKey(key => key + 1);
      setCurrentConversationId(null);
      setCurrentThreadTitle(null);
    };
    globalThis.addEventListener(NEW_CHAT_REQUESTED_EVENT, handleNewChat);
    return () =>
      globalThis.removeEventListener(NEW_CHAT_REQUESTED_EVENT, handleNewChat);
  }, [conversationId, chatMode]);

  useEffect(() => {
    document.title = applyRootTitleTemplate(
      currentThreadTitle || (currentConversationId ? 'Chat' : 'New Chat')
    );
  }, [currentThreadTitle, currentConversationId]);

  const handleTitleChange = useCallback(
    (title: string | null) => {
      setCurrentThreadTitle(currentTitle => {
        if (title) return title;
        return currentConversationId ? currentTitle : null;
      });
    },
    [currentConversationId]
  );

  return {
    currentThreadTitle,
    currentConversationId,
    chatSessionKey,
    setCurrentConversationId,
    handleTitleChange,
  };
}
