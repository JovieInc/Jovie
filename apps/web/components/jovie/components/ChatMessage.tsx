'use client';

import { Button, SimpleTooltip, Skeleton } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { memo, useEffect, useRef, useState } from 'react';
import { useClipboard } from '@/hooks/useClipboard';
import { copyMarkdownToClipboard } from '@/lib/chat/copy-markdown';
import { cn } from '@/lib/utils';
import { getRenderableToolEvents, ToolPartsRenderer } from '../tool-ui';
import type { MessagePart } from '../types';
import { getMessageText } from '../utils';
import { AssistantMessageText } from './AssistantMessageText';
import { ChatFeedbackControl } from './ChatFeedbackControl';
import { ChatStepLimitAffordance } from './ChatStepLimitAffordance';
import { ImageAttachmentChip } from './ImageAttachmentChip';
import { TokenizedText } from './TokenizedText';

interface ChatMessageProps {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly parts: MessagePart[];
  /** Whether this message is actively being streamed from the AI. */
  readonly isStreaming?: boolean;
  /** Whether this is a synthetic thinking placeholder (now rendered as shimmer skeleton). */
  readonly isThinking?: boolean;
  /** Avatar URL for user messages. */
  readonly avatarUrl?: string | null;
  /** Profile ID for interactive tool cards (avatar upload, link confirmation). */
  readonly profileId?: string;
  /** Skip entrance animation for messages loaded from persistence. */
  readonly skipEntrance?: boolean;
  /** Show the inline continue affordance after a tool-step cap stop. */
  readonly toolStepCapExhausted?: boolean;
  /** Persisted chat turn id — enables model attribution for feedback votes. */
  readonly turnId?: string;
  /** Conversation id for feedback rows. */
  readonly conversationId?: string;
  /**
   * Render 👍/👎 feedback controls on assistant messages and tool results.
   * Enabled on the authenticated app chat surface; off for onboarding and
   * other anonymous embeds where votes cannot be attributed to a user.
   */
  readonly enableFeedback?: boolean;
  /**
   * Render generic app tool cards/status rows. Callers with surface-specific
   * tool cards can opt out and render their own tool UI beside the message.
   */
  readonly renderTools?: boolean;
}

function areChatMessagePropsEqual(
  previous: ChatMessageProps,
  next: ChatMessageProps
): boolean {
  return (
    previous.id === next.id &&
    previous.role === next.role &&
    previous.parts === next.parts &&
    previous.isStreaming === next.isStreaming &&
    previous.isThinking === next.isThinking &&
    previous.avatarUrl === next.avatarUrl &&
    previous.profileId === next.profileId &&
    previous.skipEntrance === next.skipEntrance &&
    previous.renderTools === next.renderTools &&
    previous.toolStepCapExhausted === next.toolStepCapExhausted &&
    previous.turnId === next.turnId &&
    previous.conversationId === next.conversationId &&
    previous.enableFeedback === next.enableFeedback
  );
}

export const ChatMessage = memo(function ChatMessage({
  id,
  role,
  parts,
  isStreaming,
  isThinking,
  profileId,
  skipEntrance,
  renderTools = true,
  toolStepCapExhausted = false,
  turnId,
  conversationId,
  enableFeedback = false,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const { copy, isSuccess: fallbackCopySuccess } = useClipboard();
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const markdownCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const messageText = getMessageText(parts);
  const isCopySuccess = markdownCopied || fallbackCopySuccess;

  useEffect(() => {
    return () => {
      if (markdownCopyTimeoutRef.current) {
        clearTimeout(markdownCopyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyMessage = () => {
    void copyMarkdownToClipboard(messageText).then(success => {
      if (success) {
        setMarkdownCopied(true);
        if (markdownCopyTimeoutRef.current) {
          clearTimeout(markdownCopyTimeoutRef.current);
        }
        markdownCopyTimeoutRef.current = setTimeout(() => {
          setMarkdownCopied(false);
        }, 2000);
        return;
      }
      void copy(messageText);
    });
  };
  const shouldReduceMotion = useReducedMotion();
  const toolEvents = getRenderableToolEvents(parts);
  const fileParts = parts.filter(
    (p): p is MessagePart & { url: string; mediaType: string; name?: string } =>
      p.type === 'file' &&
      typeof p.url === 'string' &&
      typeof p.mediaType === 'string' &&
      p.mediaType.startsWith('image/')
  );
  const imageChips = (() => {
    const seenFileKeys = new Map<string, number>();
    return fileParts.map(file => {
      const seenCount = seenFileKeys.get(file.url) ?? 0;
      seenFileKeys.set(file.url, seenCount + 1);
      const dedupeKey =
        seenCount === 0 ? file.url : `${file.url}-${seenCount + 1}`;
      return { dedupeKey, url: file.url, name: file.name };
    });
  })();
  const hasAssistantContent =
    Boolean(messageText) || toolEvents.length > 0 || toolStepCapExhausted;
  // Keep the thinking shimmer up while the stream is open but no renderable
  // content has arrived yet. Without this, the pending→streaming transition
  // collapses the reply row to blank until the first token lands (GH-11921).
  const showThinkingIndicator =
    Boolean(isThinking) ||
    (!isUser && Boolean(isStreaming) && !hasAssistantContent);
  const useUserPillBubble =
    isUser &&
    imageChips.length === 0 &&
    !messageText.includes('\n') &&
    messageText.length <= 44;

  return (
    <motion.div
      data-message-id={id}
      data-role={role}
      className={cn(
        'system-b-chat-message-row group/message',
        isUser ? 'justify-end' : 'justify-start'
      )}
      initial={skipEntrance || shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {isUser ? (
        <div
          data-testid='chat-user-bubble'
          data-bubble-shape={useUserPillBubble ? 'pill' : 'rectangle'}
          className='system-b-chat-user-bubble'
        >
          {imageChips.length > 0 && (
            <div
              className='system-b-chat-user-attachments'
              data-has-message={messageText ? 'true' : 'false'}
            >
              {imageChips.map(chip => (
                <ImageAttachmentChip
                  key={chip.dedupeKey}
                  url={chip.url}
                  name={chip.name}
                  tone='onLight'
                />
              ))}
            </div>
          )}
          {messageText && (
            <div className='system-b-chat-user-text'>
              <TokenizedText content={messageText} tone='onLight' />
            </div>
          )}
        </div>
      ) : (
        <div className='system-b-chat-assistant-frame'>
          {showThinkingIndicator ? (
            <div
              data-testid='chat-loading-indicator'
              className='system-b-chat-loading-indicator'
              role='status'
              aria-live='polite'
              aria-label='Jovie Is Thinking'
            >
              {/* Assistant thinking shimmer — ChatMessageSkeleton-style reserved space */}
              <div className='system-b-chat-loading-head'>
                <Skeleton
                  className='system-b-chat-loading-avatar'
                  rounded='full'
                  aria-hidden='true'
                />
                <Skeleton
                  className='system-b-chat-loading-label'
                  rounded='sm'
                  aria-hidden='true'
                />
              </div>
              <div className='system-b-chat-loading-body'>
                <Skeleton
                  className='system-b-chat-loading-line'
                  rounded='lg'
                  aria-hidden='true'
                />
              </div>
            </div>
          ) : null}

          {!showThinkingIndicator && hasAssistantContent ? (
            <div className='system-b-chat-assistant-stack'>
              {messageText ? (
                <div
                  data-testid='chat-message-reply'
                  className='system-b-chat-message-reply'
                >
                  <AssistantMessageText
                    content={messageText}
                    isStreaming={Boolean(isStreaming)}
                  />
                </div>
              ) : null}

              {renderTools ? (
                <ToolPartsRenderer
                  parts={parts}
                  profileId={profileId}
                  variant='chat'
                  hasMessageText={Boolean(messageText)}
                  feedback={
                    enableFeedback && !isStreaming
                      ? { messageId: id, turnId, conversationId }
                      : undefined
                  }
                />
              ) : null}

              {toolStepCapExhausted ? <ChatStepLimitAffordance /> : null}
            </div>
          ) : null}

          {/* Copy row is always rendered when there is content to reserve its
              height and prevent a layout shift when streaming ends (JOV-11948).
              The button is hidden via aria-hidden + pointer-events while
              streaming; CSS opacity:0 already hides it visually on non-hover. */}
          {!showThinkingIndicator && messageText ? (
            <div
              className='system-b-chat-copy-row'
              aria-hidden={isStreaming ? true : undefined}
              style={isStreaming ? { pointerEvents: 'none' } : undefined}
            >
              {!isStreaming ? (
                <>
                  <SimpleTooltip
                    content={isCopySuccess ? 'Copied!' : 'Copy response'}
                  >
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={handleCopyMessage}
                      className='h-7 w-7 shadow-none'
                      aria-label={
                        isCopySuccess ? 'Copied to clipboard' : 'Copy message'
                      }
                    >
                      {isCopySuccess ? (
                        <Check className='system-b-chat-copy-icon' />
                      ) : (
                        <Copy className='system-b-chat-copy-icon' />
                      )}
                    </Button>
                  </SimpleTooltip>
                  {enableFeedback ? (
                    <ChatFeedbackControl
                      messageId={id}
                      turnId={turnId}
                      conversationId={conversationId}
                      excerpt={messageText}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}, areChatMessagePropsEqual);
