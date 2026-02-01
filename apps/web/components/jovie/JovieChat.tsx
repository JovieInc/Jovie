'use client';

import { useChat } from '@ai-sdk/react';
import { Button } from '@jovie/ui';
import { DefaultChatTransport } from 'ai';
import { AlertCircle, ArrowUp, Loader2, User } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useThrottledCallback } from '@/lib/pacer';
import { cn } from '@/lib/utils';

// Use useLayoutEffect on client, useEffect on server
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface ArtistContext {
  readonly displayName: string;
  readonly username: string;
  readonly bio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly profileViews: number;
  readonly hasSocialLinks: boolean;
  readonly hasMusicLinks: boolean;
  readonly tippingStats: {
    readonly tipClicks: number;
    readonly tipsSubmitted: number;
    readonly totalReceivedCents: number;
    readonly monthReceivedCents: number;
  };
}

interface JovieChatProps {
  readonly artistContext: ArtistContext;
}

/** Maximum allowed message length */
const MAX_MESSAGE_LENGTH = 4000;

/** Minimum time between message submissions (ms) */
const SUBMIT_THROTTLE_MS = 1000;

const SUGGESTED_PROMPTS = [
  'What should I focus on this week?',
  'How can I grow my audience?',
  'What are my strengths based on my profile?',
  "Help me understand what's working",
];

// Helper to extract text content from message parts
function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('');
}

interface ChatError {
  readonly message: string;
  readonly retryAfter?: number;
}

export function JovieChat({ artistContext }: JovieChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Create transport with artist context in body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { artistContext },
      }),
    [artistContext]
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    onError: error => {
      // Parse error response for rate limiting info
      try {
        const errorData = JSON.parse(error.message);
        setChatError({
          message: errorData.message || 'An error occurred. Please try again.',
          retryAfter: errorData.retryAfter,
        });
      } catch {
        setChatError({
          message: error.message || 'An error occurred. Please try again.',
        });
      }
      setIsSubmitting(false);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  // Clear error when user starts typing
  useEffect(() => {
    if (input && chatError) {
      setChatError(null);
    }
  }, [input, chatError]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Reset submitting state when streaming completes
  useEffect(() => {
    if (status === 'ready') {
      setIsSubmitting(false);
    }
  }, [status]);

  // Handle visual viewport changes (mobile keyboard)
  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;

    const handleViewportResize = () => {
      // When keyboard opens, scroll messages to keep context visible
      if (isInputFocused && messagesEndRef.current) {
        // Small delay to let the viewport settle
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    };

    viewport.addEventListener('resize', handleViewportResize);
    return () => viewport.removeEventListener('resize', handleViewportResize);
  }, [isInputFocused]);

  // Scroll to bottom when input is focused (mobile context guarantee)
  const handleInputFocus = useCallback(() => {
    setIsInputFocused(true);
    // Delay scroll to allow keyboard to appear
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleInputBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  // Core submit logic
  const doSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading || isSubmitting) return;

      // Validate message length
      if (text.length > MAX_MESSAGE_LENGTH) {
        setChatError({
          message: `Message is too long. Maximum is ${MAX_MESSAGE_LENGTH} characters.`,
        });
        return;
      }

      setChatError(null);
      setIsSubmitting(true);
      sendMessage({ text: text.trim() });
      setInput('');

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    },
    [isLoading, isSubmitting, sendMessage]
  );

  // Throttled submit to prevent rapid submissions
  const throttledSubmit = useThrottledCallback(doSubmit, {
    wait: SUBMIT_THROTTLE_MS,
    leading: true,
    trailing: false,
  });

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      throttledSubmit(input);
    },
    [input, throttledSubmit]
  );

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    // Focus the input after setting the prompt
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
  }, []);

  // Character count display
  const characterCount = input.length;
  const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.9;
  const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;

  return (
    <div className='flex h-full flex-col'>
      {hasMessages ? (
        // Chat view - messages + sticky input at bottom
        <>
          {/* Messages area - with bottom padding for sticky composer */}
          <div className='flex-1 overflow-y-auto px-4 py-4 sm:py-6'>
            <div className='mx-auto max-w-2xl space-y-4 sm:space-y-6'>
              {messages.map(message => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 sm:h-8 sm:w-8 sm:rounded-lg'>
                      <BrandLogo
                        size={16}
                        tone='auto'
                        className='h-[18px] w-[18px] sm:h-4 sm:w-4'
                      />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[80%]',
                      message.role === 'user'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-surface-2 text-primary-token'
                    )}
                  >
                    <div className='whitespace-pre-wrap text-[15px] leading-relaxed sm:text-sm'>
                      {getMessageText(message.parts)}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 sm:h-8 sm:w-8 sm:rounded-lg'>
                      <User className='h-5 w-5 text-secondary-token sm:h-4 sm:w-4' />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className='flex gap-3'>
                  <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 sm:h-8 sm:w-8 sm:rounded-lg'>
                    <BrandLogo
                      size={16}
                      tone='auto'
                      className='h-[18px] w-[18px] sm:h-4 sm:w-4'
                    />
                  </div>
                  <div className='rounded-2xl bg-surface-2 px-4 py-3'>
                    <Loader2 className='h-5 w-5 animate-spin text-secondary-token sm:h-4 sm:w-4' />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Sticky composer at bottom with safe area */}
          <div
            className={cn(
              'sticky bottom-0 z-10 border-t border-subtle bg-bg-base/95 backdrop-blur-lg',
              'px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3',
              'supports-[backdrop-filter]:bg-bg-base/80'
            )}
          >
            {/* Error display above composer */}
            {chatError && (
              <div className='mx-auto mb-3 max-w-2xl'>
                <div className='flex items-start gap-3 rounded-xl border border-error/20 bg-error-subtle p-3 sm:p-4'>
                  <AlertCircle className='mt-0.5 h-5 w-5 shrink-0 text-error' />
                  <div className='flex-1'>
                    <p className='text-sm font-medium text-primary-token'>
                      {chatError.message}
                    </p>
                    {chatError.retryAfter && (
                      <p className='mt-1 text-xs text-secondary-token'>
                        Try again in {chatError.retryAfter} seconds
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className='mx-auto max-w-2xl'>
              <div className='relative'>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder='Ask a follow-up...'
                  rows={1}
                  className={cn(
                    'w-full resize-none rounded-xl border bg-surface-1 py-3 pl-4 pr-14',
                    'text-[16px] text-primary-token placeholder:text-tertiary-token sm:text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-1',
                    'transition-colors duration-fast',
                    'max-h-32 min-h-[48px]',
                    isOverLimit
                      ? 'border-error focus:border-error focus:ring-error/20'
                      : 'border-subtle focus:border-accent focus:ring-accent/20'
                  )}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  maxLength={MAX_MESSAGE_LENGTH + 100}
                  aria-label='Chat message input'
                />
                <Button
                  type='submit'
                  size='icon'
                  disabled={
                    !input.trim() || isLoading || isSubmitting || isOverLimit
                  }
                  className='absolute bottom-1.5 right-1.5 h-11 w-11 rounded-lg sm:h-9 sm:w-9'
                  aria-label='Send message'
                >
                  {isLoading || isSubmitting ? (
                    <Loader2 className='h-5 w-5 animate-spin sm:h-4 sm:w-4' />
                  ) : (
                    <ArrowUp className='h-5 w-5 sm:h-4 sm:w-4' />
                  )}
                </Button>

                {/* Character count in chat view */}
                {isNearLimit && (
                  <div
                    className={cn(
                      'absolute bottom-3 left-3 text-xs',
                      isOverLimit ? 'text-error' : 'text-tertiary-token'
                    )}
                  >
                    {characterCount}/{MAX_MESSAGE_LENGTH}
                  </div>
                )}
              </div>
            </form>
          </div>
        </>
      ) : (
        // Empty state - centered content with safe area padding
        <div className='flex flex-1 flex-col items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]'>
          <div className='w-full max-w-2xl space-y-6 sm:space-y-8'>
            {/* Error display */}
            {chatError && (
              <div className='flex items-start gap-3 rounded-xl border border-error/20 bg-error-subtle p-3 sm:p-4'>
                <AlertCircle className='mt-0.5 h-5 w-5 shrink-0 text-error' />
                <div className='flex-1'>
                  <p className='text-sm font-medium text-primary-token'>
                    {chatError.message}
                  </p>
                  {chatError.retryAfter && (
                    <p className='mt-1 text-xs text-secondary-token'>
                      Try again in {chatError.retryAfter} seconds
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className='relative'>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder='What do you wanna ask Jovie?'
                className={cn(
                  'w-full resize-none rounded-xl border bg-surface-1 px-4 py-4 pr-16',
                  'text-[16px] text-primary-token placeholder:text-tertiary-token sm:text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-1',
                  'transition-colors duration-fast',
                  'min-h-[120px]',
                  isOverLimit
                    ? 'border-error focus:border-error focus:ring-error/20'
                    : 'border-subtle focus:border-accent focus:ring-accent/20'
                )}
                onKeyDown={handleKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                maxLength={MAX_MESSAGE_LENGTH + 100}
                aria-label='Chat message input'
                aria-describedby={isOverLimit ? 'char-limit-error' : undefined}
              />
              <Button
                type='submit'
                size='icon'
                disabled={
                  !input.trim() || isLoading || isSubmitting || isOverLimit
                }
                className='absolute bottom-3 right-3 h-11 w-11 rounded-lg'
                aria-label='Send message'
              >
                {isLoading || isSubmitting ? (
                  <Loader2 className='h-5 w-5 animate-spin sm:h-4 sm:w-4' />
                ) : (
                  <ArrowUp className='h-5 w-5 sm:h-4 sm:w-4' />
                )}
              </Button>

              {/* Character count */}
              {isNearLimit && (
                <div
                  id='char-limit-error'
                  className={cn(
                    'absolute bottom-3 left-3 text-xs',
                    isOverLimit ? 'text-error' : 'text-tertiary-token'
                  )}
                >
                  {characterCount}/{MAX_MESSAGE_LENGTH}
                </div>
              )}
            </form>

            {/* Suggested prompts - larger tap targets on mobile */}
            <div className='space-y-3'>
              <p className='text-center text-sm text-tertiary-token'>
                Try asking about:
              </p>
              <div className='flex flex-wrap justify-center gap-2'>
                {SUGGESTED_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type='button'
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className={cn(
                      'rounded-full border border-subtle bg-surface-1 px-4 py-2.5 text-sm',
                      'min-h-[44px] text-secondary-token transition-colors duration-fast',
                      'hover:border-default hover:bg-surface-2 hover:text-primary-token',
                      'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:ring-offset-2',
                      'active:scale-[0.98]'
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
