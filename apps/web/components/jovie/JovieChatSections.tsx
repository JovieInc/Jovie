'use client';

import type { Virtualizer } from '@tanstack/react-virtual';
import type { ReactNode, RefCallback } from 'react';
import {
  CHAT_COMPOSER_DOCK_CLASSNAME,
  CHAT_COMPOSER_SCROLL_FADE_CLASSNAME,
  CHAT_COMPOSER_THREAD_SCROLL_PADDING_CLASSNAME,
  CHAT_CONTENT_SHELL_CLASSNAME,
  CHAT_MESSAGE_CONTENT_SHELL_CLASSNAME,
} from './chat-layout';
import {
  ChatConversationComposerSkeleton,
  ChatEmptyStateComposerRegion,
  ChatInput,
  ChatMessage,
  ChatMessageSkeleton,
  ErrorDisplay,
  ScrollToBottom,
} from './components';
import { ChatFileChips } from './components/ChatFileChips';
import type { ChatInputProps } from './components/ChatInput';
import { ChatUploadManifest } from './components/ChatUploadManifest';
import { ChatUsageAlert } from './components/ChatUsageAlert';
import type { PendingFile } from './hooks/useChatFileAttachments';
import type { ChatError, MessagePart } from './types';

interface ChatComposerSurfaceProps {
  readonly chatInputProps: ChatInputProps;
  readonly showThreadView: boolean;
  readonly isRateLimited: boolean;
  readonly showManifest: boolean;
  readonly manifestCollapsed: boolean;
  readonly showChips: boolean;
  readonly pendingFiles: PendingFile[];
  readonly aggregate: {
    readonly total: number;
    readonly done: number;
    readonly overallPct: number;
    readonly speed: string;
    readonly eta: string;
    readonly locked: number;
  };
  readonly isUploading: boolean;
  readonly isPro: boolean;
  readonly onRemoveFile: (id: string) => void;
  readonly onCollapseManifest: () => void;
  readonly onExpandManifest: () => void;
}

export function ChatComposerSurface({
  chatInputProps,
  showThreadView,
  isRateLimited,
  showManifest,
  manifestCollapsed,
  showChips,
  pendingFiles,
  aggregate,
  isUploading,
  isPro,
  onRemoveFile,
  onCollapseManifest,
  onExpandManifest,
}: ChatComposerSurfaceProps) {
  return (
    <div className={CHAT_CONTENT_SHELL_CLASSNAME}>
      <ChatUsageAlert />

      {isRateLimited ? (
        <p className='mb-1.5 text-xs text-tertiary-token' aria-live='polite'>
          Sending too fast. Please wait a second before your next message.
        </p>
      ) : null}

      {showManifest && !manifestCollapsed ? (
        <div className='mb-2.5'>
          <ChatUploadManifest
            files={pendingFiles}
            aggregate={aggregate}
            isUploading={isUploading}
            onRemove={onRemoveFile}
            lockedCount={aggregate.locked}
            isPro={isPro}
            onCollapse={onCollapseManifest}
          />
        </div>
      ) : null}

      {showManifest && manifestCollapsed ? (
        <div className='mb-2.5'>
          <ChatUploadManifest
            files={pendingFiles}
            aggregate={aggregate}
            isUploading={isUploading}
            onRemove={onRemoveFile}
            lockedCount={aggregate.locked}
            isPro={isPro}
            collapsed
            onExpand={onExpandManifest}
          />
        </div>
      ) : null}

      {showChips ? (
        <div className='mb-2.5'>
          <ChatFileChips files={pendingFiles} onRemove={onRemoveFile} />
        </div>
      ) : null}

      <ChatInput
        {...chatInputProps}
        placeholder='Ask Jovie...' // ui-casing-allow: brand placeholder
        variant={showThreadView ? 'compact' : 'hero'}
      />
    </div>
  );
}

interface ChatInlineErrorProps {
  readonly chatError: ChatError;
  readonly onRetry: () => void;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
}

export function ChatInlineError({
  chatError,
  onRetry,
  isLoading,
  isSubmitting,
}: ChatInlineErrorProps) {
  return (
    <div
      className={`${CHAT_CONTENT_SHELL_CLASSNAME} pb-4`}
      data-testid='chat-inline-error-slot'
    >
      <ErrorDisplay
        chatError={chatError}
        onRetry={onRetry}
        isLoading={isLoading}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

interface ChatThreadMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly status?: string;
  readonly parts: MessagePart[];
  readonly toolStepCapExhausted?: boolean;
  /** Persisted chat turn id — enables 👍/👎 model attribution (JOV #11460). */
  readonly turnId?: string;
}

interface ChatThreadMessagesProps {
  readonly messages: readonly ChatThreadMessage[];
  readonly shouldVirtualizeMessages: boolean;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly virtualizedMessageViewportHeight: number | string;
  readonly virtualizedMinHeight: number;
  readonly messageViewportPaddingBottom: string | undefined;
  readonly totalSizeRef: RefCallback<HTMLDivElement>;
  readonly bottomSentinelRef: RefCallback<HTMLDivElement>;
  readonly isStreaming: boolean;
  readonly lastAssistantIndex: number;
  readonly avatarUrl?: string | null;
  readonly profileId?: string;
  readonly knownMessageIds: ReadonlySet<string>;
  readonly inlineChatError: ReactNode;
  readonly isStuckToBottom: boolean;
  readonly onScrollToBottom: () => void;
  /** Conversation id for 👍/👎 feedback attribution. */
  readonly conversationId?: string | null;
}

export function ChatThreadMessages({
  messages,
  shouldVirtualizeMessages,
  virtualizer,
  virtualizedMessageViewportHeight,
  virtualizedMinHeight,
  messageViewportPaddingBottom,
  totalSizeRef,
  bottomSentinelRef,
  isStreaming,
  lastAssistantIndex,
  avatarUrl,
  profileId,
  knownMessageIds,
  inlineChatError,
  isStuckToBottom,
  onScrollToBottom,
  conversationId,
}: ChatThreadMessagesProps) {
  return (
    <div>
      {shouldVirtualizeMessages ? (
        <div
          ref={totalSizeRef}
          className={`${CHAT_MESSAGE_CONTENT_SHELL_CLASSNAME} flex min-h-full flex-col`}
          style={{
            position: 'relative',
            height: virtualizedMessageViewportHeight,
            minHeight: virtualizedMinHeight || undefined,
          }}
        >
          {virtualizer.getVirtualItems().map(virtualItem => {
            const message = messages[virtualItem.index];
            const index = virtualItem.index;
            const isThinking =
              message.role === 'assistant' && message.status === 'pending';
            return (
              <div
                key={message.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className='pb-4'>
                  <ChatMessage
                    id={message.id}
                    role={message.role}
                    parts={message.parts}
                    isStreaming={isStreaming && index === lastAssistantIndex}
                    isThinking={isThinking}
                    avatarUrl={message.role === 'user' ? avatarUrl : undefined}
                    profileId={profileId}
                    skipEntrance={knownMessageIds.has(message.id)}
                    toolStepCapExhausted={message.toolStepCapExhausted}
                    turnId={message.turnId}
                    conversationId={conversationId ?? undefined}
                    enableFeedback
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          ref={totalSizeRef}
          className={`${CHAT_MESSAGE_CONTENT_SHELL_CLASSNAME} flex min-h-full flex-col`}
          style={{
            paddingBottom: messageViewportPaddingBottom,
          }}
        >
          {messages.map((message, index) => {
            const isThinking =
              message.role === 'assistant' && message.status === 'pending';
            return (
              <div key={message.id} className='pb-4'>
                <ChatMessage
                  id={message.id}
                  role={message.role}
                  parts={message.parts}
                  isStreaming={isStreaming && index === lastAssistantIndex}
                  isThinking={isThinking}
                  avatarUrl={message.role === 'user' ? avatarUrl : undefined}
                  profileId={profileId}
                  skipEntrance={knownMessageIds.has(message.id)}
                  toolStepCapExhausted={message.toolStepCapExhausted}
                  turnId={message.turnId}
                  conversationId={conversationId ?? undefined}
                  enableFeedback
                />
              </div>
            );
          })}
        </div>
      )}

      {inlineChatError}

      <div
        ref={bottomSentinelRef}
        aria-hidden
        className='h-px w-full shrink-0'
        data-testid='chat-bottom-sentinel'
      />

      <ScrollToBottom visible={!isStuckToBottom} onClick={onScrollToBottom} />
    </div>
  );
}

export function ChatLoadingConversationSkeleton() {
  return (
    <div
      className='system-b-chat-conversation-loading'
      data-testid='chat-loading-conversation-skeleton'
      aria-busy='true'
      aria-live='polite'
    >
      <div className='system-b-chat-conversation-loading-viewport'>
        <ChatMessageSkeleton />
      </div>
      <div className='system-b-chat-conversation-loading-dock'>
        <ChatConversationComposerSkeleton />
      </div>
    </div>
  );
}

export {
  CHAT_COMPOSER_DOCK_CLASSNAME,
  CHAT_COMPOSER_SCROLL_FADE_CLASSNAME,
  CHAT_COMPOSER_THREAD_SCROLL_PADDING_CLASSNAME,
  ChatEmptyStateComposerRegion,
};
