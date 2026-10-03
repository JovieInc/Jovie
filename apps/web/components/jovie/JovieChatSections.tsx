'use client';

import { Button } from '@jovie/ui';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ReactNode, RefCallback } from 'react';
import { useDesktopChatWorkState } from '@/lib/desktop/chat-work-state';
import { composerPlaceholderForChatMode } from './chat-composer-copy';
import {
  CHAT_COMPOSER_DOCK_CLASSNAME,
  CHAT_COMPOSER_SCROLL_FADE_CLASSNAME,
  CHAT_COMPOSER_THREAD_SCROLL_PADDING_CLASSNAME,
  CHAT_CONTENT_SHELL_CLASSNAME,
  CHAT_EMPTY_TOP_SPACING_OWNER,
  CHAT_EMPTY_VIEWPORT_CLASSNAME,
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
import { AudioPreviewStrip } from './components/AudioPreviewStrip';
import { ChatFileChips } from './components/ChatFileChips';
import type { ChatInputProps } from './components/ChatInput';
import { ChatUploadManifest } from './components/ChatUploadManifest';
import { ChatUsageAlert } from './components/ChatUsageAlert';
import type { PendingAudio } from './hooks/useChatAudioAttachments';
import type { PendingFile } from './hooks/useChatFileAttachments';
import { type ComposerDraft, useComposerDraft } from './hooks/useComposerDraft';
import type { ChatError, MessagePart } from './types';

interface ChatComposerSurfaceProps {
  readonly chatInputProps: ChatInputProps;
  readonly chatMode?: 'ov';
  readonly showThreadView: boolean;
  /**
   * one-chrome-layer-v1: when the empty state already shows a chrome
   * affordance (prompt suggests, starter/action cards), the usage banner
   * stays hidden — at most one non-content chrome layer at a time.
   */
  readonly suppressUsageAlert?: boolean;
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

interface ChatDraftComposerSurfaceProps
  extends Omit<ChatComposerSurfaceProps, 'chatInputProps'> {
  readonly draft: ComposerDraft;
  readonly chatInputProps: Omit<ChatInputProps, 'value'>;
}

/** Only this leaf subscribes to characters; the transcript owns the runtime. */
export function ChatDraftComposerSurface({
  draft,
  chatInputProps,
  ...surface
}: ChatDraftComposerSurfaceProps) {
  const value = useComposerDraft(draft);
  return (
    <ChatComposerSurface
      {...surface}
      chatInputProps={{ ...chatInputProps, value }}
    />
  );
}

/** Keep committed draft safety live without rerendering the transcript owner. */
export function ChatDraftWorkState({
  draft,
  ...work
}: Omit<Parameters<typeof useDesktopChatWorkState>[0], 'input'> & {
  readonly draft: ComposerDraft;
}) {
  const input = useComposerDraft(draft);
  useDesktopChatWorkState({ ...work, input });
  return null;
}

export function ChatComposerSurface({
  chatInputProps,
  chatMode,
  showThreadView,
  suppressUsageAlert = false,
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
  const audioFiles = pendingFiles.filter(file => file.kind === 'audio');
  const otherFiles = pendingFiles.filter(file => file.kind !== 'audio');
  const showOtherManifest = showManifest && otherFiles.length > 0;
  const showOtherChips =
    showChips && otherFiles.some(file => file.status === 'ready');

  return (
    <div className={CHAT_CONTENT_SHELL_CLASSNAME}>
      {suppressUsageAlert ? null : <ChatUsageAlert />}

      {isRateLimited ? (
        <p className='mb-1.5 text-xs text-tertiary-token' aria-live='polite'>
          Sending too fast. Please wait a second before your next message.
        </p>
      ) : null}

      {showOtherManifest && !manifestCollapsed ? (
        <div className='mb-2.5'>
          <ChatUploadManifest
            files={otherFiles}
            aggregate={aggregate}
            isUploading={isUploading}
            onRemove={onRemoveFile}
            lockedCount={aggregate.locked}
            isPro={isPro}
            onCollapse={onCollapseManifest}
          />
        </div>
      ) : null}

      {showOtherManifest && manifestCollapsed ? (
        <div className='mb-2.5'>
          <ChatUploadManifest
            files={otherFiles}
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

      {audioFiles.map(file => (
        <div className='mb-2.5' key={file.id}>
          <AudioPreviewStrip
            audio={toPendingAudio(file)}
            onRemove={() => onRemoveFile(file.id)}
          />
        </div>
      ))}

      {showOtherChips ? (
        <div className='mb-2.5'>
          <ChatFileChips files={otherFiles} onRemove={onRemoveFile} />
        </div>
      ) : null}

      <ChatInput
        {...chatInputProps}
        placeholder={composerPlaceholderForChatMode(chatMode)}
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
  readonly chatMode?: 'ov';
}

export function ChatInlineError({
  chatError,
  onRetry,
  isLoading,
  isSubmitting,
  chatMode,
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
        presentation={chatMode === 'ov' ? 'operator' : 'default'}
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
  readonly modelRotationNotice?: string;
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
  /** Earlier unanswered turns hidden behind one control (Summer only). */
  readonly collapsedFailureCount?: number;
  readonly onShowCollapsedFailures?: () => void;
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
  collapsedFailureCount = 0,
  onShowCollapsedFailures,
}: ChatThreadMessagesProps) {
  // Reads live `virtualizer` state each render; see JovieChat (JOV-6702).
  'use no memo';
  const renderMessage = (message: ChatThreadMessage, index: number) => {
    const isThinking =
      message.role === 'assistant' && message.status === 'pending';

    return (
      <div key={message.id} className='pb-4'>
        {message.modelRotationNotice ? (
          <ChatModelRotationMetadata notice={message.modelRotationNotice} />
        ) : null}
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
  };

  return (
    <div>
      {collapsedFailureCount > 0 && onShowCollapsedFailures ? (
        <div className={`${CHAT_CONTENT_SHELL_CLASSNAME} pb-4`}>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onShowCollapsedFailures}
            data-testid='chat-collapsed-failures'
          >
            {collapsedFailureCount === 1
              ? '1 earlier message went unanswered. Show it'
              : `${collapsedFailureCount} earlier messages went unanswered. Show them`}
          </Button>
        </div>
      ) : null}
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
                {renderMessage(message, index)}
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
          {messages.map((message, index) => renderMessage(message, index))}
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

function toPendingAudio(file: PendingFile): PendingAudio {
  const status: PendingAudio['status'] =
    file.status === 'queued'
      ? 'uploading'
      : file.status === 'duplicate' || file.status === 'locked'
        ? 'failed'
        : file.status;

  return {
    id: file.id,
    name: file.name,
    mediaType: file.mediaType,
    status,
    error:
      file.error ??
      (file.status === 'duplicate'
        ? 'Duplicate file skipped'
        : file.status === 'locked'
          ? 'Upload limit reached'
          : undefined),
    previewUrl: file.previewUrl,
    inference: file.inference,
    releaseId: file.releaseId,
    releaseTitle: file.releaseTitle,
    prompt: file.prompt,
  };
}

function ChatModelRotationMetadata({ notice }: { readonly notice: string }) {
  return (
    <p
      role='status'
      aria-live='polite'
      aria-atomic='true'
      data-testid='chat-model-rotation-notice'
      className='pb-2 text-center text-xs text-tertiary-token'
    >
      {notice}
    </p>
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
  CHAT_EMPTY_TOP_SPACING_OWNER,
  CHAT_EMPTY_VIEWPORT_CLASSNAME,
  ChatEmptyStateComposerRegion,
};
