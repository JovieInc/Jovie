'use client';

import { SimpleTooltip, Skeleton } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import { getRenderableToolEvents, ToolPartsRenderer } from '../tool-ui';
import type { MessagePart } from '../types';
import { getMessageText } from '../utils';
import { ImageAttachmentChip } from './ImageAttachmentChip';
import { TokenizedText } from './TokenizedText';

const ChatMarkdown = dynamic(
  () => import('./ChatMarkdown').then(m => ({ default: m.ChatMarkdown })),
  { ssr: false }
);

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
  /**
   * Render generic app tool cards/status rows. Callers with surface-specific
   * tool cards can opt out and render their own tool UI beside the message.
   */
  readonly renderTools?: boolean;
}

export function ChatMessage({
  id,
  role,
  parts,
  isStreaming,
  isThinking,
  profileId,
  skipEntrance,
  renderTools = true,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const { copy, isSuccess } = useClipboard();
  const messageText = getMessageText(parts);
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
  const hasAssistantContent = Boolean(messageText) || toolEvents.length > 0;

  return (
    <motion.div
      data-message-id={id}
      data-role={role}
      className={cn('flex gap-3.5', isUser ? 'justify-end' : 'justify-start')}
      initial={
        skipEntrance || shouldReduceMotion ? false : { opacity: 0, y: 8 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {isUser ? (
        <div
          data-testid='chat-user-bubble'
          className='flex min-h-8 max-w-[78%] flex-col justify-center rounded-full border border-white/80 bg-white px-3 py-1.5 text-[#111216] shadow-[0_12px_38px_-28px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.9)]'
        >
          {imageChips.length > 0 && (
            <div
              className={cn(
                'flex flex-wrap items-center gap-1.5',
                messageText && 'mb-2'
              )}
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
            <div className='text-[13px] leading-5'>
              <TokenizedText content={messageText} tone='onLight' />
            </div>
          )}
        </div>
      ) : (
        <div className='w-full min-w-0 max-w-full'>
          {isThinking ? (
            <div
              data-testid='chat-loading-indicator'
              className='flex min-h-7 w-full max-w-[78%] flex-col gap-2 text-[15px] leading-7'
              role='status'
              aria-live='polite'
            >
              <span className='sr-only'>Jovie is thinking</span>
              {/* Assistant thinking shimmer — ChatMessageSkeleton-style reserved space */}
              <div className='flex items-center gap-2 pl-0.5'>
                <Skeleton
                  className='h-5.5 w-5.5 shrink-0'
                  rounded='full'
                  aria-hidden='true'
                />
                <Skeleton className='h-3 w-8' rounded='sm' aria-hidden='true' />
              </div>
              <div className='space-y-1.5 pl-7'>
                <Skeleton
                  className='h-4 w-[65%]'
                  rounded='lg'
                  aria-hidden='true'
                />
              </div>
            </div>
          ) : null}

          {!isThinking && hasAssistantContent ? (
            <div className='space-y-3'>
              {messageText ? (
                <div
                  data-testid='chat-message-reply'
                  className='text-[15px] leading-7 text-primary-token sm:text-[15.5px]'
                >
                  <ChatMarkdown
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
                />
              ) : null}
            </div>
          ) : null}

          {!isThinking && !isStreaming && messageText ? (
            <div className='mt-1.5 flex items-center justify-start'>
              <SimpleTooltip content={isSuccess ? 'Copied!' : 'Copy response'}>
                <button
                  type='button'
                  onClick={() => copy(messageText)}
                  className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token shadow-none transition-colors duration-subtle hover:bg-surface-1 hover:text-secondary-token focus-visible:bg-surface-1 focus-visible:outline-none'
                  aria-label={
                    isSuccess ? 'Copied to clipboard' : 'Copy message'
                  }
                >
                  {isSuccess ? (
                    <Check className='h-3.5 w-3.5' />
                  ) : (
                    <Copy className='h-3.5 w-3.5' />
                  )}
                </button>
              </SimpleTooltip>
            </div>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}
