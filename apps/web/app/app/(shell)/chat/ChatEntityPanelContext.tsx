'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ChatEntityKind = 'release' | 'contact' | 'tour-date';

export interface ChatEntityTarget {
  readonly kind: ChatEntityKind;
  readonly id: string;
  readonly label?: string | null;
  readonly source: 'manual' | 'tool' | 'route-hint';
  readonly focusKey: string;
}

interface ChatEntityPanelContextValue {
  readonly target: ChatEntityTarget | null;
  readonly open: (target: ChatEntityTarget) => void;
  readonly close: () => void;
  readonly clear: () => void;
  readonly clearDismissal: () => void;
  readonly isDismissed: (focusKey: string) => boolean;
}

const ChatEntityPanelContext =
  createContext<ChatEntityPanelContextValue | null>(null);

interface ChatEntityPanelProviderProps {
  readonly children: ReactNode;
  readonly resetKey?: string | null;
}

export function ChatEntityPanelProvider({
  children,
  resetKey = null,
}: Readonly<ChatEntityPanelProviderProps>) {
  const [target, setTarget] = useState<ChatEntityTarget | null>(null);
  const [dismissedFocusKey, setDismissedFocusKey] = useState<string | null>(
    null
  );
  const previousResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) {
      return;
    }

    previousResetKeyRef.current = resetKey;
    setTarget(null);
    setDismissedFocusKey(null);
  }, [resetKey]);

  const open = useCallback((nextTarget: ChatEntityTarget) => {
    setDismissedFocusKey(null);
    setTarget(nextTarget);
  }, []);

  const close = useCallback(() => {
    setTarget(currentTarget => {
      if (currentTarget) {
        setDismissedFocusKey(currentTarget.focusKey);
      }
      return null;
    });
  }, []);

  const clear = useCallback(() => {
    setTarget(null);
  }, []);

  const clearDismissal = useCallback(() => {
    setDismissedFocusKey(null);
  }, []);

  const isDismissed = useCallback(
    (focusKey: string) => dismissedFocusKey === focusKey,
    [dismissedFocusKey]
  );

  const value = useMemo<ChatEntityPanelContextValue>(
    () => ({
      target,
      open,
      close,
      clear,
      clearDismissal,
      isDismissed,
    }),
    [target, open, close, clear, clearDismissal, isDismissed]
  );

  return (
    <ChatEntityPanelContext.Provider value={value}>
      {children}
    </ChatEntityPanelContext.Provider>
  );
}

export function useChatEntityPanel(): ChatEntityPanelContextValue {
  const context = useContext(ChatEntityPanelContext);
  if (!context) {
    throw new TypeError(
      'useChatEntityPanel must be used within a ChatEntityPanelProvider'
    );
  }
  return context;
}

export function useOptionalChatEntityPanel(): ChatEntityPanelContextValue | null {
  return useContext(ChatEntityPanelContext);
}
