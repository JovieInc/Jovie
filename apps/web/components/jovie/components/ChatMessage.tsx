'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useMemo } from 'react';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import {
  type ChatInsightsToolResult,
  isToolInvocationPart,
  type MessagePart,
  type SocialLinkToolResult,
} from '../types';
import { getMessageText } from '../utils';
import { ChatAnalyticsCard } from './ChatAnalyticsCard';
import { ChatAvatarUploadCard } from './ChatAvatarUploadCard';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';
import { ChatLinkRemovalCard } from './ChatLinkRemovalCard';

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
  /** Avatar URL for user messages. */
  readonly avatarUrl?: string | null;
  /** Profile ID for interactive tool cards (avatar upload, link confirmation). */
  readonly profileId?: string;
}

export function ChatMessage({
  id,
  role,
  parts,
  isStreaming,
  avatarUrl,
  profileId,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const { copy, isSuccess } = useClipboard();
  const messageText = getMessageText(parts);
  const shouldReduceMotion = useReducedMotion();
  const fileParts = parts.filter(
    (p): p is MessagePart & { url: string; mediaType: string } =>
      p.type === 'file' &&
      typeof p.url === 'string' &&
      typeof p.mediaType === 'string' &&
      p.mediaType.startsWith('image/')
  );

  const toolInvocations = useMemo(
    () => parts.filter(isToolInvocationPart),
    [parts]
  );

  return (
    <motion.div
      data-message-id={id}
      className={cn('flex gap-3.5', isUser ? 'justify-end' : 'justify-start')}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {isUser ? (
        <div className='max-w-[78%] rounded-2xl bg-accent/95 px-4 py-3.5 text-accent-foreground'>
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
            <div className='whitespace-pre-wrap text-[15px] leading-7 tracking-[-0.01em]'>
              {messageText}
            </div>
          )}
        </div>
      ) : (
        <div className='flex max-w-[78%] flex-col'>
          {messageText && (
            <div className='rounded-[20px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_95%,var(--linear-bg-surface-0))] px-5 py-4 text-primary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
              <div className='mb-3 flex items-center gap-2'>
                <span className='rounded-full border border-subtle bg-surface-2/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary-token'>
                  Jovie
                </span>
                <span className='text-[11px] text-tertiary-token'>
                  {isStreaming ? 'Writing reply…' : 'Reply'}
                </span>
              </div>
              <ChatMarkdown
                content={messageText}
                isStreaming={Boolean(isStreaming)}
              />
            </div>
          )}

          {/* Interactive tool cards */}
          {toolInvocations.map(toolInvocation => {
            if (
              toolInvocation.toolName === 'proposeAvatarUpload' &&
              toolInvocation.state === 'result' &&
              toolInvocation.result?.success
            ) {
              return (
                <div
                  key={toolInvocation.toolInvocationId}
                  className={cn(messageText && 'mt-3')}
                >
                  <ChatAvatarUploadCard />
                </div>
              );
            }

            if (
              toolInvocation.toolName === 'showTopInsights' &&
              toolInvocation.state === 'result' &&
              toolInvocation.result?.success
            ) {
              return (
                <div
                  key={toolInvocation.toolInvocationId}
                  className={cn(messageText && 'mt-3')}
                >
                  <ChatAnalyticsCard
                    result={
                      toolInvocation.result as unknown as ChatInsightsToolResult
                    }
                  />
                </div>
              );
            }

            if (
              toolInvocation.toolName === 'proposeSocialLink' &&
              toolInvocation.state === 'result' &&
              toolInvocation.result?.success &&
              profileId
            ) {
              const result =
                toolInvocation.result as unknown as SocialLinkToolResult;
              return (
                <div
                  key={toolInvocation.toolInvocationId}
                  className={cn(messageText && 'mt-3')}
                >
                  <ChatLinkConfirmationCard
                    profileId={profileId}
                    platform={result.platform}
                    normalizedUrl={result.normalizedUrl}
                    originalUrl={result.originalUrl}
                  />
                </div>
              );
            }

            if (
              toolInvocation.toolName === 'proposeSocialLinkRemoval' &&
              toolInvocation.state === 'result' &&
              toolInvocation.result?.success &&
              profileId
            ) {
              const result = toolInvocation.result as {
                linkId: string;
                platform: string;
                url: string;
              };
              return (
                <div
                  key={toolInvocation.toolInvocationId}
                  className={cn(messageText && 'mt-3')}
                >
                  <ChatLinkRemovalCard
                    profileId={profileId}
                    linkId={result.linkId}
                    platform={result.platform}
                    url={result.url}
                  />
                </div>
              );
            }

            return null;
          })}

          {!isStreaming && messageText && (
            <div className='mt-2 flex items-center gap-2 pl-1.5'>
              <span className='text-[10px] font-medium uppercase tracking-[0.14em] text-tertiary-token'>
                Response
              </span>
              <SimpleTooltip content={isSuccess ? 'Copied!' : 'Copy'}>
                <button
                  type='button'
                  onClick={() => copy(messageText)}
                  className='flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-3 text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:bg-interactive-hover'
                  aria-label={
                    isSuccess ? 'Copied to clipboard' : 'Copy message'
                  }
                >
                  {isSuccess ? (
                    <Check className='h-3.5 w-3.5' />
                  ) : (
                    <Copy className='h-3.5 w-3.5' />
                  )}
                  <span className='text-[11px] font-medium uppercase tracking-[0.12em]'>
                    {isSuccess ? 'Copied' : 'Copy'}
                  </span>
                </button>
              </SimpleTooltip>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
