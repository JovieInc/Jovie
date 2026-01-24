'use client';

import { useChat } from '@ai-sdk/react';
import { Button } from '@jovie/ui';
import { DefaultChatTransport } from 'ai';
import { ArrowUp, Loader2, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { cn } from '@/lib/utils';

interface ArtistContext {
  displayName: string;
  username: string;
  bio: string | null;
  genres: string[];
  spotifyFollowers: number | null;
  spotifyPopularity: number | null;
  profileViews: number;
  hasSocialLinks: boolean;
  hasMusicLinks: boolean;
  tippingStats: {
    tipClicks: number;
    tipsSubmitted: number;
    totalReceivedCents: number;
    monthReceivedCents: number;
  };
}

interface JovieChatProps {
  artistContext: ArtistContext;
}

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

export function JovieChat({ artistContext }: JovieChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

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
  });

  const isLoading = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    sendMessage({ text: input.trim() });
    setInput('');
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className='flex h-full flex-col'>
      {!hasMessages ? (
        // Empty state - centered content
        <div className='flex flex-1 flex-col items-center justify-center px-4'>
          <div className='w-full max-w-2xl space-y-8'>
            {/* Header */}
            <div className='text-center'>
              <div className='mb-4 flex justify-center'>
                <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2'>
                  <BrandLogo size={32} tone='auto' />
                </div>
              </div>
              <h1 className='text-2xl font-semibold text-primary-token'>
                Ask Jovie
              </h1>
              <p className='mt-2 text-secondary-token'>
                Get personalized insights about your music career based on your
                profile and analytics.
              </p>
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className='relative'>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder='What do you want to know about your career?'
                className={cn(
                  'w-full resize-none rounded-xl border border-subtle bg-surface-1 px-4 py-4 pr-14',
                  'text-primary-token placeholder:text-tertiary-token',
                  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
                  'min-h-[120px]'
                )}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Button
                type='submit'
                size='icon'
                disabled={!input.trim() || isLoading}
                className='absolute bottom-3 right-3 h-10 w-10 rounded-lg'
              >
                {isLoading ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <ArrowUp className='h-4 w-4' />
                )}
              </Button>
            </form>

            {/* Suggested prompts */}
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
                      'rounded-full border border-subtle bg-surface-1 px-4 py-2 text-sm',
                      'text-secondary-token transition-colors',
                      'hover:border-accent hover:bg-surface-2 hover:text-primary-token'
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Chat view - messages + input at bottom
        <>
          {/* Messages area */}
          <div className='flex-1 overflow-y-auto px-4 py-6'>
            <div className='mx-auto max-w-2xl space-y-6'>
              {messages.map(message => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                      <BrandLogo size={16} tone='auto' />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3',
                      message.role === 'user'
                        ? 'bg-accent text-white'
                        : 'bg-surface-2 text-primary-token'
                    )}
                  >
                    <div className='whitespace-pre-wrap text-sm leading-relaxed'>
                      {getMessageText(message.parts)}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                      <User className='h-4 w-4 text-secondary-token' />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className='flex gap-3'>
                  <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                    <BrandLogo size={16} tone='auto' />
                  </div>
                  <div className='rounded-2xl bg-surface-2 px-4 py-3'>
                    <Loader2 className='h-4 w-4 animate-spin text-secondary-token' />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input at bottom */}
          <div className='border-t border-subtle bg-base px-4 py-4'>
            <form onSubmit={handleSubmit} className='mx-auto max-w-2xl'>
              <div className='relative'>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder='Ask a follow-up...'
                  rows={1}
                  className={cn(
                    'w-full resize-none rounded-xl border border-subtle bg-surface-1 px-4 py-3 pr-14',
                    'text-primary-token placeholder:text-tertiary-token',
                    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
                    'max-h-32'
                  )}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  onInput={e => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                  }}
                />
                <Button
                  type='submit'
                  size='icon'
                  disabled={!input.trim() || isLoading}
                  className='absolute bottom-2 right-2 h-8 w-8 rounded-lg'
                >
                  {isLoading ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <ArrowUp className='h-4 w-4' />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
