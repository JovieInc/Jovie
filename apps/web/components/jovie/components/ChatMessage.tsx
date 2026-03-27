'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import React, { useMemo } from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import {
  type ChatInsightsToolResult,
  isToolInvocationPart,
  type MessagePart,
  type SocialLinkToolResult,
  type ToolInvocationPart,
} from '../types';
import { getMessageText } from '../utils';
import { ChatAnalyticsCard } from './ChatAnalyticsCard';
import { ChatAvatarUploadCard } from './ChatAvatarUploadCard';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';
import { ChatLinkRemovalCard } from './ChatLinkRemovalCard';
import { ChatPitchCard } from './ChatPitchCard';

const ChatMarkdown = dynamic(
  () => import('./ChatMarkdown').then(m => ({ default: m.ChatMarkdown })),
  { ssr: false }
);

function renderToolCard(
  toolInvocation: ToolInvocationPart,
  profileId?: string
): React.ReactNode {
  if (
    toolInvocation.toolName === 'proposeAvatarUpload' &&
    toolInvocation.state === 'result' &&
    toolInvocation.result?.success
  ) {
    return <ChatAvatarUploadCard />;
  }

  if (
    toolInvocation.toolName === 'showTopInsights' &&
    toolInvocation.state === 'result' &&
    toolInvocation.result?.success
  ) {
    return (
      <ChatAnalyticsCard
        result={toolInvocation.result as unknown as ChatInsightsToolResult}
      />
    );
  }

  if (
    toolInvocation.toolName === 'proposeSocialLink' &&
    toolInvocation.state === 'result' &&
    toolInvocation.result?.success &&
    profileId
  ) {
    const result = toolInvocation.result as unknown as SocialLinkToolResult;
    return (
      <ChatLinkConfirmationCard
        profileId={profileId}
        platform={result.platform}
        normalizedUrl={result.normalizedUrl}
        originalUrl={result.originalUrl}
      />
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
      <ChatLinkRemovalCard
        profileId={profileId}
        linkId={result.linkId}
        platform={result.platform}
        url={result.url}
      />
    );
  }

  if (toolInvocation.toolName === 'generateReleasePitch') {
    if (toolInvocation.state === 'call') {
      return <ChatPitchCard state='loading' />;
    }

    if (toolInvocation.state === 'result') {
      const result = toolInvocation.result as {
        success: boolean;
        releaseTitle?: string;
        pitches?: {
          spotify: string;
          appleMusic: string;
          amazon: string;
          generic: string;
        };
        error?: string;
      };

      return (
        <ChatPitchCard
          state={result.success ? 'success' : 'error'}
          releaseTitle={result.releaseTitle}
          pitches={result.pitches}
          error={result.error}
        />
      );
    }
  }

  return null;
}

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
            <div className='whitespace-pre-wrap text-[15px] leading-7 tracking-[-0.01em]'>
              {messageText}
            </div>
          )}
        </div>
      ) : (
        <div className='flex max-w-[78%] flex-col'>
          {messageText && (
            <div className='space-y-2'>
              <div className='flex items-center gap-2 pl-0.5'>
                <span className='flex h-5.5 w-5.5 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
                  <BrandLogo size={10} tone='auto' rounded={false} />
                </span>
                <span className='text-[11px] font-[560] tracking-[-0.01em] text-secondary-token'>
                  Jovie
                </span>
                <span className='text-[11px] text-tertiary-token'>
                  {isStreaming ? 'Writing reply…' : 'Reply'}
                </span>
              </div>
              <div
                data-testid='chat-message-reply-bubble'
                className='rounded-[18px] border border-subtle bg-surface-1 px-4 py-3.5 text-primary-token shadow-card'
              >
                <ChatMarkdown
                  content={messageText}
                  isStreaming={Boolean(isStreaming)}
                />
              </div>
            </div>
          )}

          {/* Interactive tool cards */}
          {toolInvocations.map(toolInvocation => {
            const card = renderToolCard(toolInvocation, profileId);
            if (!card) {
              return null;
            }
            return (
              <div
                key={toolInvocation.toolInvocationId}
                className={cn(messageText && 'mt-3')}
              >
                {card}
              </div>
            );
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
                  className={cn(
                    APP_CONTROL_BUTTON_CLASS,
                    'h-7 px-2.5 text-secondary-token'
                  )}
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
