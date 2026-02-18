'use client';

import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
import { useChatImageAttachments, useJovieChat } from './hooks';
import type { JovieChatProps, MessagePart } from './types';
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
        part.toolInvocation?.state === 'call'
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
  username,
}: JovieChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initialQuerySubmitted = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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

  // Image attachments for chat messages
  const {
    pendingImages,
    isDragOver,
    isProcessing: isImageProcessing,
    addFiles,
    removeImage,
    clearImages,
    toFileUIParts,
    dropZoneRef,
  } = useChatImageAttachments({
    onError: error => setChatError({ type: 'unknown', message: error }),
    disabled: isLoading || isSubmitting,
  });

  // Open file picker for image attachments
  const openImagePicker = useCallback(() => {
    imageFileInputRef.current?.click();
  }, []);

  const handleImageFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  // Handle clipboard paste for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const imageFiles = Array.from(e.clipboardData.items)
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  // Submit with image attachments
  const handleSubmitWithImages = useCallback(
    (e?: React.FormEvent) => {
      if (isLoading || isSubmitting) return;
      const files = toFileUIParts();
      handleSubmit(e, files.length > 0 ? files : undefined);
      clearImages();
    },
    [handleSubmit, toFileUIParts, clearImages, isLoading, isSubmitting]
  );

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

  // Determine the active tool label for contextual loading state
  const isStreaming = status === 'streaming';
  const activeToolLabel = useMemo(
    () => (isLoading ? getActiveToolLabel(messages) : null),
    [isLoading, messages]
  );
  const thinkingLabel = activeToolLabel ?? 'Thinking...';

  // Show skeleton while fetching existing conversation
  if (isLoadingConversation) {
    return (
      <div className='flex h-full flex-col'>
        <ChatMessageSkeleton />
      </div>
    );
  }

  // Shared ChatInput props for both views
  const chatInputProps = {
    ref: inputRef,
    value: input,
    onChange: setInput,
    onSubmit: handleSubmitWithImages,
    isLoading,
    isSubmitting,
    onImageAttach: openImagePicker,
    isImageProcessing,
    pendingImages,
    onRemoveImage: removeImage,
    onPaste: handlePaste,
  } as const;

  return (
    <div ref={dropZoneRef} className='relative flex h-full flex-col'>
      {/* Hidden file input for image attachments */}
      <input
        ref={imageFileInputRef}
        type='file'
        accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
        onChange={handleImageFileChange}
        multiple
        className='hidden'
        tabIndex={-1}
      />

      {/* Drag-and-drop overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            className='absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/50 bg-accent/5 backdrop-blur-sm'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className='flex flex-col items-center gap-2 text-accent'>
              <ImagePlus className='h-6 w-6' />
              <span className='text-sm font-medium'>Drop images here</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                {...chatInputProps}
                placeholder='Ask a follow-up...'
                variant='compact'
              />
            </div>
          </div>
        </>
      ) : (
        // Empty state - input near bottom with carousel + pills
        <div className='flex flex-1 flex-col items-center justify-end px-4 pb-8'>
          <div className='chat-stagger w-full max-w-2xl space-y-4'>
            {/* Suggested profiles carousel (DSP matches, social links, avatars, profile ready) */}
            {profileId && (
              <SuggestedProfilesCarousel
                profileId={profileId}
                username={username}
                displayName={displayName}
                avatarUrl={avatarUrl}
              />
            )}

            {/* One-liner + input + pills */}
            <div className='space-y-3'>
              <p className='text-center text-[15px] text-secondary-token'>
                What can I help you with?
              </p>
              <ChatInput {...chatInputProps} />
              <SuggestedPrompts onSelect={handleSuggestedPrompt} />
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
          </div>
        </div>
      )}
    </div>
  );
}
