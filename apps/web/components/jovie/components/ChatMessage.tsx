'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import React, { useMemo } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import {
  type ChatInsightsToolResult,
  isChatAlbumArtToolResult,
  isToolInvocationPart,
  type MessagePart,
  type SocialLinkRemovalToolResult,
  type SocialLinkToolResult,
  type ToolInvocationPart,
} from '../types';
import { getMessageText } from '../utils';
import { ChatAlbumArtCard } from './ChatAlbumArtCard';
import { ChatAnalyticsCard } from './ChatAnalyticsCard';
import { ChatAvatarUploadCard } from './ChatAvatarUploadCard';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';
import { ChatLinkRemovalCard } from './ChatLinkRemovalCard';
import { ChatPitchCard } from './ChatPitchCard';

const ChatMarkdown = dynamic(
  () => import('./ChatMarkdown').then(m => ({ default: m.ChatMarkdown })),
  { ssr: false }
);

function isInsightsResult(result: unknown): result is ChatInsightsToolResult {
  return typeof result === 'object' && result !== null && 'success' in result;
}

function isSocialLinkResult(result: unknown): result is SocialLinkToolResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'platform' in result &&
    'normalizedUrl' in result &&
    'originalUrl' in result
  );
}

function isSocialLinkRemovalResult(
  result: unknown
): result is SocialLinkRemovalToolResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'linkId' in result &&
    'platform' in result &&
    'url' in result
  );
}

function renderPitchResultCard(
  toolInvocation: ToolInvocationPart
): React.ReactNode {
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
    isInsightsResult(toolInvocation.result)
  ) {
    return <ChatAnalyticsCard result={toolInvocation.result} />;
  }

  if (
    toolInvocation.toolName === 'proposeSocialLink' &&
    toolInvocation.state === 'result' &&
    isSocialLinkResult(toolInvocation.result) &&
    profileId
  ) {
    const result = toolInvocation.result;
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
    isSocialLinkRemovalResult(toolInvocation.result) &&
    profileId
  ) {
    const result = toolInvocation.result;
    return (
      <ChatLinkRemovalCard
        profileId={profileId}
        linkId={result.linkId}
        platform={result.platform}
        url={result.url}
      />
    );
  }

  if (
    toolInvocation.toolName === 'generateAlbumArt' &&
    toolInvocation.state === 'result' &&
    isChatAlbumArtToolResult(toolInvocation.result) &&
    profileId
  ) {
    return (
      <ChatAlbumArtCard result={toolInvocation.result} profileId={profileId} />
    );
  }

  if (
    toolInvocation.toolName === 'generateReleasePitch' &&
    toolInvocation.state === 'call'
  ) {
    return <ChatPitchCard state='loading' />;
  }

  if (
    toolInvocation.toolName === 'generateReleasePitch' &&
    toolInvocation.state === 'result'
  ) {
    return renderPitchResultCard(toolInvocation);
  }

  return null;
}

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
            <div className='whitespace-pre-wrap text-[15px] leading-6 tracking-[-0.01em]'>
              {messageText}
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
                <span className='text-[11px] font-[560] tracking-[-0.01em] text-secondary-token'>
                  Jovie
                </span>
                <span className='text-[11px] text-tertiary-token'>
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

          {!isThinking && messageText && (
            <div className='space-y-1.5'>
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
                className='rounded-[18px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_70%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_92%,var(--linear-surface))] px-4 py-3.5 text-primary-token shadow-none'
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
            <div className='mt-1.5 flex items-center justify-end pr-0.5'>
              <SimpleTooltip content={isSuccess ? 'Copied!' : 'Copy response'}>
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
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
