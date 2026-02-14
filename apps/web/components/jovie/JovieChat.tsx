'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';

import {
  ChatInput,
  ChatMessage,
  ChatMessageSkeleton,
  ErrorDisplay,
  ScrollToBottom,
  SuggestedProfilesCarousel,
  SuggestedPrompts,
} from './components';
import { useChatAvatarUpload, useJovieChat } from './hooks';
import type {
  JovieChatProps,
  MessagePart,
  StarterSuggestionContext,
} from './types';
import { TOOL_LABELS } from './types';

/** Scroll distance (px) from bottom before showing the scroll-to-bottom button. */
const SCROLL_THRESHOLD = 200;

/**
 * Derives a user-friendly label from the last assistant message's active tool invocation.
 * Returns null when no tool is actively being called.
 */
function getActiveToolLabel(
  messages: Array<{ role: string; parts: MessagePart[] }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;

    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (
        part.type === 'tool-invocation' &&
        part.toolInvocation &&
        part.toolInvocation.state === 'call'
      ) {
        return TOOL_LABELS[part.toolInvocation.toolName] ?? 'Working on it...';
      }
    }
    break;
  }
  return null;
}

export function JovieChat({
  profileId,
  artistContext, // NOSONAR - intentional backward compatibility for deprecated prop
  conversationId,
  onConversationCreate,
  initialQuery,
  onTitleChange,
  displayName,
  avatarUrl,
}: JovieChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initialQuerySubmitted = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [starterContext, setStarterContext] =
    useState<StarterSuggestionContext | null>(null);

  const {
    input,
    setInput,
    messages,
    chatError,
    isLoading,
    isSubmitting,
    hasMessages,
    isLoadingConversation,
    conversationTitle,
    status,
    inputRef,
    handleSubmit,
    handleRetry,
    handleSuggestedPrompt,
    submitMessage,
    setChatError,
  } = useJovieChat({
    profileId,
    artistContext,
    conversationId,
    onConversationCreate,
  });

  // Profile photo upload from chat
  const {
    fileInputRef,
    isUploading: isImageUploading,
    openFilePicker,
    handleFileChange,
  } = useChatAvatarUpload({
    onUploadSuccess: message => {
      submitMessage(message);
    },
    onError: error => {
      setChatError({ type: 'unknown', message: error });
    },
    disabled: isLoading || isSubmitting,
  });

  // Notify parent when the conversation title changes (e.g. after auto-generation)
  const prevTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationTitle !== prevTitleRef.current) {
      prevTitleRef.current = conversationTitle;
      onTitleChange?.(conversationTitle);
    }
  }, [conversationTitle, onTitleChange]);

  // Auto-submit initialQuery on mount (e.g. navigated from profile with ?q=)
  useEffect(() => {
    if (
      initialQuery &&
      !initialQuerySubmitted.current &&
      !isLoadingConversation
    ) {
      initialQuerySubmitted.current = true;
      submitMessage(initialQuery);
    }
  }, [initialQuery, isLoadingConversation, submitMessage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceFromBottom > SCROLL_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Find the last assistant message index for streaming cursor
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  // Show skeleton while fetching existing conversation
  if (isLoadingConversation) {
    return (
      <div className='flex h-full flex-col'>
        <ChatMessageSkeleton />
      </div>
    );
  }

  // Determine the active tool label for contextual loading state
  const isStreaming = status === 'streaming';
  const activeToolLabel = isLoading ? getActiveToolLabel(messages) : null;
  const thinkingLabel = activeToolLabel ?? 'Thinking...';

  return (
    <div className='flex h-full flex-col'>
      {/* Hidden file input for profile photo upload */}
      <input
        ref={fileInputRef}
        type='file'
        accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
        onChange={handleFileChange}
        className='hidden'
        tabIndex={-1}
      />

      {hasMessages ? (
        // Chat view - messages + input at bottom
        <>
          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            className='relative flex-1 overflow-y-auto px-4 py-6'
            onScroll={handleScroll}
          >
            <div className='mx-auto max-w-2xl space-y-6'>
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  role={message.role}
                  parts={message.parts}
                  isStreaming={isStreaming && index === lastAssistantIndex}
                  avatarUrl={message.role === 'user' ? avatarUrl : undefined}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className='flex gap-3'>
                  <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                    <BrandLogo size={16} tone='auto' />
                  </div>
                  <div className='rounded-2xl bg-surface-2 px-4 py-3'>
                    <div className='flex items-center gap-1.5'>
                      <span
                        className='flex items-center gap-1'
                        aria-hidden='true'
                      >
                        <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none' />
                        <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none' />
                        <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce motion-reduce:animate-none' />
                      </span>
                      {activeToolLabel && (
                        <span className='ml-1.5 text-xs text-tertiary-token'>
                          {activeToolLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className='sr-only' aria-live='polite'>
                    Jovie is {thinkingLabel.toLowerCase().replace(/\.{3}$/, '')}
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Scroll to bottom button */}
            <ScrollToBottom
              visible={showScrollToBottom}
              onClick={scrollToBottom}
            />
          </div>

          {/* Error display in chat view */}
          {chatError && (
            <div className='px-4 pb-3'>
              <div className='mx-auto max-w-2xl'>
                <ErrorDisplay
                  chatError={chatError}
                  onRetry={handleRetry}
                  isLoading={isLoading}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          )}

          {/* Input at bottom */}
          <div className='border-t border-subtle px-4 py-4'>
            <div className='mx-auto max-w-2xl'>
              <ChatInput
                ref={inputRef}
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                isSubmitting={isSubmitting}
                placeholder='Ask a follow-up...'
                variant='compact'
                onImageUpload={openFilePicker}
                isImageUploading={isImageUploading}
              />
            </div>
          </div>
        </>
      ) : (
        // Empty state - welcome hero + suggestions + input, centered
        <div className='flex flex-1 flex-col items-center justify-center px-4 pb-6'>
          <div className='mx-auto w-full max-w-2xl space-y-6'>
            {/* Welcome hero */}
            <div className='flex flex-col items-center text-center space-y-3'>
              <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2'>
                <BrandLogo size={20} tone='auto' />
              </div>
              <div className='space-y-1'>
                <h1 className='text-lg font-semibold text-primary-token tracking-tight'>
                  {displayName ? `Hey, ${displayName}` : 'Hey there'}
                </h1>
                <p className='text-sm text-secondary-token max-w-sm mx-auto'>
                  I can help you manage your profile, analyze your stats, and
                  plan your next move.
                </p>
              </div>
            </div>

            {/* Error display */}
            {chatError && (
              <ErrorDisplay
                chatError={chatError}
                onRetry={handleRetry}
                isLoading={isLoading}
                isSubmitting={isSubmitting}
              />
            )}

            {/* Suggested profiles carousel (DSP matches, social links, avatars) */}
            {profileId && (
              <SuggestedProfilesCarousel
                profileId={profileId}
                onContextLoad={setStarterContext}
              />
            )}

            {/* Suggested prompts */}
            <SuggestedPrompts
              onSelect={handleSuggestedPrompt}
              context={starterContext}
            />

            {/* Input */}
            <ChatInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              onImageUpload={openFilePicker}
              isImageUploading={isImageUploading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
