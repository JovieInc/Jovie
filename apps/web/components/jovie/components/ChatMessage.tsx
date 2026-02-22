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
  isToolInvocationPart,
  type MessagePart,
  type SocialLinkToolResult,
} from '../types';
import { getMessageText } from '../utils';
import { ChatAvatarUploadCard } from './ChatAvatarUploadCard';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';

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
              {fileParts.map((file, index) => (
                <div
                  key={`${file.url}-${index}`}
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
              ))}
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
            <div className='px-5 py-4 text-primary-token'>
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

            return null;
          })}

          {!isStreaming && messageText && (
            <div className='mt-1.5 flex items-center gap-0.5 pl-1.5'>
              <SimpleTooltip content={isSuccess ? 'Copied!' : 'Copy'}>
                <button
                  type='button'
                  onClick={() => copy(messageText)}
                  className='rounded-md p-1.5 text-tertiary-token transition-colors hover:bg-surface-1 hover:text-secondary-token'
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
          )}
        </div>
      )}
    </motion.div>
  );
}
