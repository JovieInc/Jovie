'use client';

import { User } from 'lucide-react';

import { BrandLogo } from '@/components/atoms/BrandLogo';
import { cn } from '@/lib/utils';

import type { MessagePart } from '../types';
import { getMessageText } from '../utils';
import {
  type ReleaseProposal,
  ReleaseProposalCard,
} from './ReleaseProposalCard';

interface ChatMessageProps {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly parts: MessagePart[];
  readonly onReleaseConfirm?: (proposal: ReleaseProposal) => void;
  readonly onReleaseCancel?: () => void;
  readonly isConfirmingRelease?: boolean;
}

/**
 * Extract proposeNewRelease tool invocation result from message parts.
 */
function extractReleaseProposal(parts: MessagePart[]): ReleaseProposal | null {
  for (const part of parts) {
    if (part.type !== 'tool-invocation') continue;
    const { toolInvocation } = part;
    if (!toolInvocation) continue;
    if (toolInvocation.toolName !== 'proposeNewRelease') continue;
    if (toolInvocation.state !== 'result') continue;
    const result = toolInvocation.result;
    if (!result?.success || !result.preview) continue;
    return result.preview as ReleaseProposal;
  }
  return null;
}

export function ChatMessage({
  id,
  role,
  parts,
  onReleaseConfirm,
  onReleaseCancel,
  isConfirmingRelease,
}: ChatMessageProps) {
  const isUser = role === 'user';

  // Check for release proposal tool invocations in assistant messages
  const releaseProposal = !isUser ? extractReleaseProposal(parts) : null;

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
        {releaseProposal && onReleaseConfirm && onReleaseCancel && (
          <div className='mt-3'>
            <ReleaseProposalCard
              proposal={releaseProposal}
              onConfirm={onReleaseConfirm}
              onCancel={onReleaseCancel}
              isConfirming={isConfirmingRelease}
            />
          </div>
        )}
      </div>
      {isUser && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
          <User className='h-4 w-4 text-secondary-token' />
        </div>
      )}
    </div>
  );
}
