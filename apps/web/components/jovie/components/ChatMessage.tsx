'use client';

import { User } from 'lucide-react';

import { BrandLogo } from '@/components/atoms/BrandLogo';
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
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-accent text-accent-foreground'
            : 'bg-surface-2 text-primary-token'
        )}
      >
        <div className='whitespace-pre-wrap text-sm leading-relaxed'>
          {getMessageText(parts)}
        </div>
      </div>
      {isUser && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
          <User className='h-4 w-4 text-secondary-token' />
        </div>
      )}
    </div>
  );
}
