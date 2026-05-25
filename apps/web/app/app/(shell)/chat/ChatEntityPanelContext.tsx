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
export type ChatRailContextKind =
  | 'profile'
  | 'release'
  | 'artist'
  | 'track'
  | 'event'
  | 'contact'
  | 'tour-date';

export interface ChatEntityTarget {
  readonly kind: ChatEntityKind;
  readonly id: string;
  readonly label?: string | null;
  readonly source: 'manual' | 'tool' | 'route-hint';
  readonly focusKey: string;
}

export interface ChatRailContextTarget {
  readonly kind: ChatRailContextKind;
  readonly id: string;
  readonly label?: string | null;
  readonly source: 'message' | 'tool' | 'route-hint';
  readonly focusKey: string;
  readonly toolCallId?: string;
}

interface ChatEntityPanelContextValue {
  readonly target: ChatEntityTarget | null;
  readonly contextTargets: readonly ChatRailContextTarget[];
  readonly open: (target: ChatEntityTarget) => void;
  readonly close: () => void;
  readonly clear: () => void;
  readonly upsertContext: (target: ChatRailContextTarget) => void;
  readonly upsertContexts: (targets: readonly ChatRailContextTarget[]) => void;
  readonly dismissContext: (focusKey: string) => void;
  readonly clearContexts: () => void;
  readonly clearDismissal: () => void;
  readonly isDismissed: (focusKey: string) => boolean;
  readonly isContextDismissed: (focusKey: string) => boolean;
}

const ChatEntityPanelContext =
  createContext<ChatEntityPanelContextValue | null>(null);

const MAX_CONTEXT_TARGETS = 3;

interface ChatEntityPanelProviderProps {
  readonly children: ReactNode;
  readonly resetKey?: string | null;
}

export function ChatEntityPanelProvider({
  children,
  resetKey = null,
}: Readonly<ChatEntityPanelProviderProps>) {
  const [target, setTarget] = useState<ChatEntityTarget | null>(null);
  const [contextTargets, setContextTargets] = useState<
    readonly ChatRailContextTarget[]
  >([]);
  const [dismissedFocusKey, setDismissedFocusKey] = useState<string | null>(
    null
  );
  const [dismissedContextFocusKeys, setDismissedContextFocusKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const previousResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) {
      return;
    }

    previousResetKeyRef.current = resetKey;
    setTarget(null);
    setContextTargets([]);
    setDismissedFocusKey(null);
    setDismissedContextFocusKeys(new Set());
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

  const upsertContexts = useCallback(
    (nextTargets: readonly ChatRailContextTarget[]) => {
      if (nextTargets.length === 0) {
        return;
      }

      setContextTargets(currentTargets => {
        const incomingTargets: ChatRailContextTarget[] = [];

        for (const nextTarget of nextTargets) {
          if (dismissedContextFocusKeys.has(nextTarget.focusKey)) {
            continue;
          }

          if (
            incomingTargets.some(currentTarget =>
              chatRailContextTargetsMatchIdentity(currentTarget, nextTarget)
            )
          ) {
            continue;
          }

          incomingTargets.push(nextTarget);
        }

        if (incomingTargets.length === 0) {
          return currentTargets;
        }

        const nextList = [...incomingTargets];

        for (const currentTarget of currentTargets) {
          if (nextList.length >= MAX_CONTEXT_TARGETS) {
            break;
          }

          if (dismissedContextFocusKeys.has(currentTarget.focusKey)) {
            continue;
          }

          if (
            nextList.some(nextTarget =>
              chatRailContextTargetsMatchIdentity(nextTarget, currentTarget)
            )
          ) {
            continue;
          }

          nextList.push(currentTarget);
        }

        const trimmedNextList = nextList.slice(0, MAX_CONTEXT_TARGETS);

        if (chatRailContextTargetsEqual(currentTargets, trimmedNextList)) {
          return currentTargets;
        }

        return trimmedNextList;
      });
    },
    [dismissedContextFocusKeys]
  );

  const upsertContext = useCallback(
    (nextTarget: ChatRailContextTarget) => {
      upsertContexts([nextTarget]);
    },
    [upsertContexts]
  );

  const dismissContext = useCallback((focusKey: string) => {
    setDismissedContextFocusKeys(current => {
      if (current.has(focusKey)) {
        return current;
      }
      return new Set([...current, focusKey]);
    });
    setContextTargets(currentTargets =>
      currentTargets.filter(target => target.focusKey !== focusKey)
    );
  }, []);

  const clearContexts = useCallback(() => {
    setContextTargets(currentTargets =>
      currentTargets.length === 0 ? currentTargets : []
    );
  }, []);

  const clearDismissal = useCallback(() => {
    setDismissedFocusKey(null);
  }, []);

  const isDismissed = useCallback(
    (focusKey: string) => dismissedFocusKey === focusKey,
    [dismissedFocusKey]
  );

  const isContextDismissed = useCallback(
    (focusKey: string) => dismissedContextFocusKeys.has(focusKey),
    [dismissedContextFocusKeys]
  );

  const value = useMemo<ChatEntityPanelContextValue>(
    () => ({
      target,
      contextTargets,
      open,
      close,
      clear,
      upsertContext,
      upsertContexts,
      dismissContext,
      clearContexts,
      clearDismissal,
      isDismissed,
      isContextDismissed,
    }),
    [
      target,
      contextTargets,
      open,
      close,
      clear,
      upsertContext,
      upsertContexts,
      dismissContext,
      clearContexts,
      clearDismissal,
      isDismissed,
      isContextDismissed,
    ]
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

function chatRailContextTargetsEqual(
  left: readonly ChatRailContextTarget[],
  right: readonly ChatRailContextTarget[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((target, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      target.kind === other.kind &&
      target.id === other.id &&
      target.label === other.label &&
      target.source === other.source &&
      target.focusKey === other.focusKey &&
      target.toolCallId === other.toolCallId
    );
  });
}

function chatRailContextTargetsMatchIdentity(
  left: ChatRailContextTarget,
  right: ChatRailContextTarget
): boolean {
  return (
    left.focusKey === right.focusKey ||
    (left.kind === right.kind && left.id === right.id)
  );
}
