'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { SendHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type FormEvent, useCallback, useId, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import {
  ASK_JOVIE_SUGGESTIONS,
  type AskJovieIntent,
  classifyAskJovieIntent,
} from '@/lib/ask-jovie/intent';
import { BRAND_WORDMARKS, type BrandVariant } from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';

interface AskJovieMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly intent?: AskJovieIntent;
}

const INTENT_RESPONSES: Record<AskJovieIntent, string> = {
  education:
    'Jovie is your agent for the work on this page — releases, audience, links, and earnings. Ask it to explain a screen, walk you through a flow, or draft the next step.',
  support:
    'Sorry something is off. Describe what happened and where — I logged this as a support issue so the team can look.',
  task: 'That sounds like something I can help with directly. Continue in Jovie chat and I will pick it up from there.',
  'feature-request':
    'Got it — I recorded this as a feature request. Requests like this shape what Jovie builds next.',
  feedback: 'Thanks — I recorded your feedback. Anything else you want to add?',
};

function responseForIntent(intent: AskJovieIntent): string {
  return INTENT_RESPONSES[intent];
}

interface AskJoviePanelProps {
  readonly pathname: string;
}

function AskJoviePanel({ pathname }: AskJoviePanelProps) {
  const [messages, setMessages] = useState<readonly AskJovieMessage[]>([]);
  const [draft, setDraft] = useState('');
  const idRef = useRef(0);
  const listId = useId();

  const send = useCallback(
    (text: string, intentOverride?: AskJovieIntent) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const intent = intentOverride ?? classifyAskJovieIntent(trimmed);
      const next: AskJovieMessage[] = [
        {
          id: `m${++idRef.current}`,
          role: 'user',
          text: trimmed,
          intent,
        },
        {
          id: `m${++idRef.current}`,
          role: 'assistant',
          text: responseForIntent(intent),
          intent,
        },
      ];
      setMessages(prev => [...prev, ...next]);
      setDraft('');
      // Every Ask Jovie turn is structured demand signal: capture the message
      // with its classified intent and the page the user was on.
      globalThis
        .fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            source: 'ask-jovie',
            pathname,
            intent,
          }),
        })
        .catch(() => {
          // Best-effort signal capture; never block the chat surface.
        });
    },
    [pathname]
  );

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      send(draft);
    },
    [draft, send]
  );

  return (
    <div
      className='ask-jovie-panel flex w-80 flex-col gap-3'
      data-testid='ask-jovie-panel'
    >
      <div className='flex flex-col gap-1'>
        <p className='text-sm font-medium text-primary-token'>Ask Jovie</p>
        <p className='text-xs text-secondary-token'>
          Ask how Jovie works, get help with what you are doing, request a
          feature, or send feedback.
        </p>
      </div>

      {messages.length === 0 ? (
        <div
          className='flex flex-wrap gap-1.5'
          data-testid='ask-jovie-suggestions'
        >
          {ASK_JOVIE_SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion.id}
              type='button'
              onClick={() => send(suggestion.label, suggestion.intent)}
              className={cn(
                'rounded-full border border-subtle px-3 py-1 text-xs text-secondary-token',
                'transition-colors duration-subtle hover:bg-white/[0.06] hover:text-primary-token',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
              )}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : (
        <ul
          id={listId}
          className='flex max-h-64 flex-col gap-2 overflow-y-auto'
          aria-live='polite'
          data-testid='ask-jovie-messages'
        >
          {messages.map(message => (
            <li
              key={message.id}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs',
                message.role === 'user'
                  ? 'self-end bg-white/[0.08] text-primary-token'
                  : 'self-start bg-white/[0.04] text-secondary-token'
              )}
              data-role={message.role}
              data-intent={message.intent}
            >
              {message.text}
              {message.role === 'assistant' && message.intent === 'task' ? (
                <>
                  {' '}
                  <Link
                    href={APP_ROUTES.CHAT}
                    className='font-medium text-primary-token underline underline-offset-2'
                  >
                    Open Jovie chat
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className='flex items-center gap-1.5'>
        <input
          type='text'
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder='Ask Jovie anything…'
          aria-label='Message Jovie'
          className={cn(
            'h-8 min-w-0 flex-1 rounded-md border border-subtle bg-transparent px-2 text-xs text-primary-token',
            'placeholder:text-tertiary-token',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
          )}
        />
        <button
          type='submit'
          disabled={!draft.trim()}
          aria-label='Send Message'
          data-testid='ask-jovie-send'
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-secondary-token',
            'transition-colors duration-subtle hover:bg-white/[0.06] hover:text-primary-token',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
            'disabled:pointer-events-none disabled:opacity-30'
          )}
        >
          <SendHorizontal className='h-3.5 w-3.5' strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}

export interface AskJovieMarkProps {
  readonly variant?: BrandVariant;
  readonly railOwner?: 'left' | 'right';
}

/**
 * Global "Ask Jovie" entry point. Resting state is a faded mark; hover/focus
 * spins the mark once and slides the wordmark out. Click opens the contextual
 * chat surface instead of navigating. Honors prefers-reduced-motion.
 */
export function AskJovieMark({
  variant = 'jovie',
  railOwner,
}: AskJovieMarkProps) {
  const pathname = usePathname();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label='Ask Jovie'
          data-testid='ask-jovie-trigger'
          className={cn(
            'ask-jovie-mark group flex h-7 sidebar-touch-row items-center gap-1.5 rounded-md px-1',
            'text-sidebar-item-foreground opacity-60',
            'transition-opacity duration-subtle hover:opacity-100 focus-visible:opacity-100',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
          )}
        >
          <span className='ask-jovie-mark-icon inline-flex shrink-0'>
            <BrandLogo
              size={24}
              tone='auto'
              variant={variant}
              rounded={false}
              className='rounded-sm'
              aria-hidden
            />
          </span>
          <span className='ask-jovie-wordmark'>
            <span className='overflow-hidden whitespace-nowrap text-app tracking-tight'>
              {BRAND_WORDMARKS[variant]}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side='right'
        align='start'
        aria-label='Ask Jovie'
        data-rail-owned-overlay={railOwner}
      >
        <AskJoviePanel pathname={pathname} />
      </PopoverContent>
    </Popover>
  );
}
