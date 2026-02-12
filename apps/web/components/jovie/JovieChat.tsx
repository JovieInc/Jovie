'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { BrandLogo } from '@/components/atoms/BrandLogo';

import {
  ChatInput,
  ChatMessage,
  ErrorDisplay,
  SuggestedProfilesCarousel,
  SuggestedPrompts,
} from './components';
import { useJovieChat } from './hooks';
import type { JovieChatProps, StarterSuggestionContext } from './types';

export function JovieChat({
  profileId,
  artistContext, // NOSONAR - intentional backward compatibility for deprecated prop
  conversationId,
  onConversationCreate,
  initialQuery,
  onTitleChange,
}: JovieChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialQuerySubmitted = useRef(false);
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
    inputRef,
    handleSubmit,
    handleRetry,
    handleSuggestedPrompt,
    submitMessage,
  } = useJovieChat({
    profileId,
    artistContext,
    conversationId,
    onConversationCreate,
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

  // Show loading state while fetching existing conversation
  if (isLoadingConversation) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-secondary-token' />
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col'>
      {hasMessages ? (
        // Chat view - messages + input at bottom
        <>
          {/* Messages area */}
          <div className='flex-1 overflow-y-auto px-4 py-6'>
            <div className='mx-auto max-w-2xl space-y-6'>
              {messages.map(message => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  role={message.role}
                  parts={message.parts}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className='flex gap-3'>
                  <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                    <BrandLogo size={16} tone='auto' />
                  </div>
                  <div className='rounded-2xl bg-surface-2 px-4 py-3'>
                    <Loader2 className='h-4 w-4 animate-spin motion-reduce:animate-none text-secondary-token' />
                  </div>
                  <span className='sr-only' aria-live='polite'>
                    Jovie is thinking...
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
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
              />
            </div>
          </div>
        </>
      ) : (
        // Empty state - suggestions above input, pushed to bottom
        <div className='flex flex-1 flex-col justify-end px-4 pb-6'>
          <div className='mx-auto w-full max-w-2xl space-y-4'>
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

            {/* Suggested prompts above input */}
            <SuggestedPrompts
              onSelect={handleSuggestedPrompt}
              context={starterContext}
            />

            {/* Input at bottom */}
            <ChatInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
      )}
    </div>
  );
}
