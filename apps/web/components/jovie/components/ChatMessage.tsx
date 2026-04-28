'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useClipboard } from '@/hooks/useClipboard';
import type { JovieChatMessageMetadata } from '@/lib/chat/types';
import { cn } from '@/lib/utils';
import { getRenderableToolEvents, ToolPartsRenderer } from '../tool-ui';
import type { MessagePart } from '../types';
import { getMessageText } from '../utils';
import { MessageFeedback } from './MessageFeedback';
import { MessageSourceChips } from './MessageSourceChips';
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
  /** Whether this is a synthetic thinking placeholder (bouncing dots). */
  readonly isThinking?: boolean;
  /** Avatar URL for user messages. */
  readonly avatarUrl?: string | null;
  /** Profile ID for interactive tool cards (avatar upload, link confirmation). */
  readonly profileId?: string;
  /** Skip entrance animation for messages loaded from persistence. */
  readonly skipEntrance?: boolean;
  /**
   * Server-emitted metadata: trace_id (for feedback POSTs) + retrieved
   * canon sources (for source chips). Present on assistant messages
   * once the stream's `start` event lands.
   */
  readonly metadata?: JovieChatMessageMetadata;
}

export function ChatMessage({
  id,
  role,
  parts,
  isStreaming,
  isThinking,
  avatarUrl,
  profileId,
  skipEntrance,
  metadata,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const { copy, isSuccess } = useClipboard();
  const messageText = getMessageText(parts);
  const shouldReduceMotion = useReducedMotion();
  const toolEvents = getRenderableToolEvents(parts);
  const fileParts = parts.filter(
    (p): p is MessagePart & { url: string; mediaType: string } =>
      p.type === 'file' &&
      typeof p.url === 'string' &&
      typeof p.mediaType === 'string' &&
      p.mediaType.startsWith('image/')
  );
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
        <div className='max-w-[78%] rounded-[18px] border border-(--linear-app-frame-seam) bg-surface-2 px-4 py-3.5 text-primary-token shadow-none'>
          {fileParts.length > 0 && (
            <div className={cn('flex flex-wrap gap-2', messageText && 'mb-2')}>
              {(() => {
                const seenFileKeys = new Map<string, number>();

                return fileParts.map(file => {
                  const seenCount = seenFileKeys.get(file.url) ?? 0;
                  seenFileKeys.set(file.url, seenCount + 1);

                  return (
                    <div
                      key={
                        seenCount === 0
                          ? file.url
                          : `${file.url}-${seenCount + 1}`
                      }
                      className='relative h-32 w-32 overflow-hidden rounded-lg'
                    >
                      <Image
                        src={file.url}
                        alt='Attached image'
                        fill
                        className='object-cover'
                        unoptimized
                      />
                    </div>
                  );
                });
              })()}
            </div>
          )}
          {messageText && (
            <div className='text-mid leading-6 tracking-[-0.01em]'>
              <TokenizedText content={messageText} />
            </div>
          )}
        </div>
      ) : (
        <div className='flex max-w-[78%] flex-col'>
          {/* Thinking indicator — bouncing dots inside the virtualizer */}
          {isThinking && (
            <div className='space-y-2'>
              <div className='flex items-center gap-2 pl-0.5'>
                <span
                  data-testid='chat-loading-avatar'
                  className='flex h-5.5 w-5.5 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'
                >
                  <BrandLogo size={10} tone='auto' rounded={false} />
                </span>
                <span className='text-2xs font-semibold tracking-[-0.01em] text-secondary-token'>
                  Jovie
                </span>
                <span className='text-2xs text-tertiary-token'>
                  Writing reply…
                </span>
              </div>
              <div
                data-testid='chat-loading-bubble'
                className='rounded-[18px] border border-subtle bg-surface-1 px-4 py-3.5 shadow-card'
              >
                <div className='flex items-center gap-1.5'>
                  <span className='flex items-center gap-1' aria-hidden='true'>
                    <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none' />
                    <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none' />
                    <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce motion-reduce:animate-none' />
                  </span>
                </div>
              </div>
              <span className='sr-only' aria-live='polite'>
                Jovie is writing a reply
              </span>
            </div>
          )}

          {!isThinking && hasAssistantContent && (
            <div className='space-y-1.5'>
              <div className='flex items-center gap-2 pl-0.5'>
                <span className='flex h-5.5 w-5.5 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
                  <BrandLogo size={10} tone='auto' rounded={false} />
                </span>
                <span className='text-2xs font-semibold tracking-[-0.01em] text-secondary-token'>
                  Jovie
                </span>
                <span className='text-2xs text-tertiary-token'>
                  {isStreaming ? 'Writing reply…' : 'Reply'}
                </span>
              </div>
              {messageText ? (
                <div
                  data-testid='chat-message-reply-bubble'
                  className='rounded-[18px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_70%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_92%,var(--linear-surface))] px-4 py-3.5 text-primary-token shadow-none'
                >
                  <ChatMarkdown
                    content={messageText}
                    isStreaming={Boolean(isStreaming)}
                  />
                </div>
              ) : null}
              {/*
                Source chips render between the bubble and the tool UI per
                the /autoplan design phase. Empty sources = no row at all.
              */}
              {metadata && metadata.retrievedSources.length > 0 && (
                <MessageSourceChips sources={metadata.retrievedSources} />
              )}
            </div>
          )}

          <ToolPartsRenderer
            parts={parts}
            profileId={profileId}
            variant='chat'
            hasMessageText={Boolean(messageText)}
          />

          {!isStreaming && hasAssistantContent && (
            <div className='mt-1.5 flex items-center justify-between gap-3 pr-0.5'>
              {/*
                Feedback affordance — left-aligned. Renders whenever an
                assistant message has content AND we received a trace_id
                from the server (i.e., the chat-rag stack is wired). Tool-
                only answers also get feedback per the /autoplan design
                consensus on `messageHasAssistantText`.
              */}
              <div className='min-h-[28px]'>
                {metadata?.chatTraceId && (
                  <MessageFeedback traceId={metadata.chatTraceId} />
                )}
              </div>
              {messageText && (
                <SimpleTooltip
                  content={isSuccess ? 'Copied!' : 'Copy response'}
                >
                  <button
                    type='button'
                    onClick={() => copy(messageText)}
                    className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token shadow-none transition-colors duration-150 hover:bg-surface-1 hover:text-secondary-token focus-visible:bg-surface-1 focus-visible:outline-none'
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
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
