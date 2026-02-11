'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Check, Copy, User } from 'lucide-react';

import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';

import type { MessagePart } from '../types';
import { getMessageText } from '../utils';

interface ChatMessageProps {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly parts: MessagePart[];
}

export function ChatMessage({ id, role, parts }: ChatMessageProps) {
  const isUser = role === 'user';
  const { copy, isSuccess } = useClipboard();
  const messageText = getMessageText(parts);

  return (
    <div
      data-message-id={id}
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
          <BrandLogo size={16} tone='auto' />
        </div>
      )}
      {isUser ? (
        <div className='max-w-[80%] rounded-2xl px-4 py-3 bg-accent text-accent-foreground'>
          <div className='whitespace-pre-wrap text-sm leading-relaxed'>
            {messageText}
          </div>
        </div>
      ) : (
        <div className='flex max-w-[80%] flex-col'>
          <div className='rounded-2xl bg-surface-2 px-4 py-3 text-primary-token'>
            <div className='whitespace-pre-wrap text-sm leading-relaxed'>
              {messageText}
            </div>
          </div>
          <div className='mt-1 flex items-center gap-0.5 pl-1'>
            <SimpleTooltip content={isSuccess ? 'Copied!' : 'Copy'}>
              <button
                type='button'
                onClick={() => copy(messageText)}
                className='rounded-md p-1.5 text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token'
                aria-label={isSuccess ? 'Copied to clipboard' : 'Copy message'}
              >
                {isSuccess ? (
                  <Check className='h-3.5 w-3.5' />
                ) : (
                  <Copy className='h-3.5 w-3.5' />
                )}
              </button>
            </SimpleTooltip>
          </div>
        </div>
      )}
      {isUser && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
          <User className='h-4 w-4 text-secondary-token' />
        </div>
      )}
    </div>
  );
}
