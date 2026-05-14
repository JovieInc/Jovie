'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import { getRenderableToolEvents, ToolPartsRenderer } from '../tool-ui';
import type { MessagePart } from '../types';
import { getMessageText } from '../utils';
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
  avatarUrl,
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
        <div className='grid w-full max-w-full grid-cols-[24px_minmax(0,1fr)] gap-3'>
          <span
            data-testid={isThinking ? 'chat-loading-avatar' : undefined}
            className='mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'
          >
            <BrandLogo size={11} tone='auto' rounded={false} />
          </span>
          <div className='min-w-0'>
            {isThinking ? (
              <div
                data-testid='chat-loading-indicator'
                className='flex min-h-7 items-center gap-2 text-[15px] leading-7 text-secondary-token'
                role='status'
                aria-live='polite'
              >
                <span>Thinking</span>
                <span className='flex items-center gap-1' aria-hidden='true'>
                  <span className='h-1.5 w-1.5 animate-bounce rounded-full bg-tertiary-token [animation-delay:-0.3s] motion-reduce:animate-none' />
                  <span className='h-1.5 w-1.5 animate-bounce rounded-full bg-tertiary-token [animation-delay:-0.15s] motion-reduce:animate-none' />
                  <span className='h-1.5 w-1.5 animate-bounce rounded-full bg-tertiary-token motion-reduce:animate-none' />
                </span>
                <span className='sr-only'>Jovie is thinking</span>
              </div>
            ) : null}

            {!isThinking && hasAssistantContent ? (
              <div className='space-y-3'>
                {messageText ? (
                  <div
                    data-testid='chat-message-reply'
                    className='text-[15px] leading-7 text-primary-token tracking-[-0.008em] sm:text-[15.5px]'
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
                <SimpleTooltip
                  content={isSuccess ? 'Copied!' : 'Copy response'}
                >
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
        </div>
      )}
    </motion.div>
  );
}
