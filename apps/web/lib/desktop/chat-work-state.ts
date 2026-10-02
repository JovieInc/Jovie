'use client';

import { useIsMutating } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isDesktopEnvironment } from './electron-bridge';
import { useDesktopWorkState } from './session-work-state';

interface WorkMessage {
  readonly parts: readonly { readonly type: string; readonly state?: string }[];
  readonly streamRevision?: number;
}

/** Completed tool parts are inspected once; stream revisions invalidate them. */
export function createPendingToolReader() {
  const cache = new WeakMap<
    WorkMessage['parts'],
    { revision?: number; pending: boolean }
  >();
  return (messages: readonly WorkMessage[]): boolean =>
    messages.some(message => {
      const cached = cache.get(message.parts);
      if (cached && cached.revision === message.streamRevision)
        return cached.pending;
      const pending = message.parts.some(
        part =>
          (part.type.startsWith('tool-') || part.type === 'dynamic-tool') &&
          (part.state === 'input-streaming' ||
            part.state === 'input-available' ||
            part.state === 'approval-requested' ||
            part.state === 'approval-responded')
      );
      cache.set(message.parts, { revision: message.streamRevision, pending });
      return pending;
    });
}

interface DesktopChatWorkInput {
  readonly input: string;
  readonly hasAttachments: boolean;
  readonly isUploading: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isLoadingConversation: boolean;
  readonly status: string;
  readonly messages: readonly WorkMessage[];
}

export function useDesktopChatWorkState(input: DesktopChatWorkInput): void {
  const readPendingTools = useMemo(() => createPendingToolReader(), []);
  const pendingMutations = useIsMutating();
  const pendingTool =
    isDesktopEnvironment() && readPendingTools(input.messages);
  useDesktopWorkState({
    hasDraft: input.input.trim().length > 0 || input.hasAttachments,
    isStreaming:
      input.isLoading ||
      input.status === 'submitted' ||
      input.status === 'streaming',
    isUploading: input.isUploading,
    hasPendingAction:
      input.isSubmitting ||
      input.isLoadingConversation ||
      pendingMutations > 0 ||
      pendingTool,
    // Native/browser handoff work is overlaid by the main-process owner.
    isAuthenticating: false,
  });
}
