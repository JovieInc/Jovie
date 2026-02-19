'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Check, Copy, User } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import type { MessagePart } from '../types';
import { getMessageText } from '../utils';

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
}

export function ChatMessage({
  id,
  role,
  parts,
  isStreaming,
  avatarUrl,
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

  return (
    <motion.div
      data-message-id={id}
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {!isUser && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
          <BrandLogo size={16} tone='auto' />
        </div>
      )}
      {isUser ? (
        <div className='max-w-[80%] rounded-2xl px-4 py-3 bg-accent text-accent-foreground'>
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
            <div className='whitespace-pre-wrap text-sm leading-relaxed'>
              {messageText}
            </div>
          )}
        </div>
      ) : (
        <div className='flex max-w-[80%] flex-col'>
          <div className='rounded-2xl bg-surface-2 px-4 py-3 text-primary-token'>
            <ChatMarkdown
              content={messageText}
              isStreaming={Boolean(isStreaming)}
            />
          </div>
          {!isStreaming && (
            <div className='mt-1 flex items-center gap-0.5 pl-1'>
              <SimpleTooltip content={isSuccess ? 'Copied!' : 'Copy'}>
                <button
                  type='button'
                  onClick={() => copy(messageText)}
                  className='rounded-md p-1.5 text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token'
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
      {isUser && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 overflow-hidden'>
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=''
              width={32}
              height={32}
              className='h-full w-full object-cover'
              unoptimized
            />
          ) : (
            <User className='h-4 w-4 text-secondary-token' />
          )}
        </div>
      )}
    </motion.div>
  );
}
