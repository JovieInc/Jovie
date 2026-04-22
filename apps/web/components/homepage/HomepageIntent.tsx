'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHAT_PROMPT_RAIL_CLASS,
  CHAT_PROMPT_RAIL_MASK_STYLE,
  CHAT_PROMPT_RAIL_SCROLL_CLASS,
  getChatPromptPillClass,
} from '@/components/jovie/components/chat-prompt-styles';
import { track } from '@/lib/analytics';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import {
  HOMEPAGE_INTENT_EXPERIMENT_ID,
  HOMEPAGE_INTENT_KEY,
  HOMEPAGE_INTENT_VARIANT_ID,
  type HomepageIntent,
  type HomepagePill,
  PILLS,
} from './intent';

const INPUT_ID = 'homepage-intent-input';

function persistIntent(intent: HomepageIntent) {
  if (globalThis.window === undefined) return;
  try {
    globalThis.localStorage?.setItem(
      HOMEPAGE_INTENT_KEY,
      JSON.stringify(intent)
    );
  } catch {
    // Private mode / disabled storage — intent capture is best-effort; redirect proceeds.
  }
}

function buildSigninUrl(): string {
  return buildAuthRouteUrl(
    '/signin',
    new URLSearchParams({ redirect_url: '/onboarding' })
  );
}

export function HomepageIntent() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const editedFiredRef = useRef(false);
  const viewedFiredRef = useRef(false);
  const [value, setValue] = useState('');
  const [activePill, setActivePill] = useState<HomepagePill | null>(null);

  useEffect(() => {
    if (viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    track('homepage_viewed', {
      experimentId: HOMEPAGE_INTENT_EXPERIMENT_ID,
      variantId: HOMEPAGE_INTENT_VARIANT_ID,
    });
  }, []);

  const handlePillClick = useCallback((pill: HomepagePill) => {
    setActivePill(pill);
    setValue(pill.insertedPrompt);
    track('homepage_pill_clicked', { pillId: pill.id, pillLabel: pill.label });
    const input = inputRef.current;
    if (input) {
      input.focus();
      const cursor = pill.insertedPrompt.length;
      input.setSelectionRange(cursor, cursor);
    }
  }, []);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (activePill && !next.startsWith(activePill.insertedPrompt)) {
        setActivePill(null);
      }
      if (!editedFiredRef.current && next.length > 0) {
        editedFiredRef.current = true;
        track('homepage_prompt_edited', {
          experimentId: HOMEPAGE_INTENT_EXPERIMENT_ID,
        });
      }
    },
    [activePill]
  );

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const intent: HomepageIntent = {
      source: 'homepage',
      finalPrompt: trimmed,
      pillId: activePill?.id ?? null,
      pillLabel: activePill?.label ?? null,
      insertedPrompt: activePill?.insertedPrompt ?? null,
      experimentId: HOMEPAGE_INTENT_EXPERIMENT_ID,
      variantId: HOMEPAGE_INTENT_VARIANT_ID,
      createdAt: new Date().toISOString(),
    };

    persistIntent(intent);

    track('homepage_prompt_submitted', {
      pillId: intent.pillId,
      pillUsed: intent.pillId !== null,
      promptLength: trimmed.length,
    });

    router.push(buildSigninUrl());
  }, [value, activePill, router]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setValue('');
        setActivePill(null);
      }
    },
    [submit]
  );

  const canSubmit = value.trim().length > 0;

  return (
    <div className='flex w-full max-w-[720px] flex-col items-stretch gap-3'>
      <label
        htmlFor={INPUT_ID}
        className='text-center text-[13px] font-medium tracking-tight text-secondary-token'
      >
        What do you want to create?
      </label>

      <div className='relative flex w-full items-center'>
        <input
          ref={inputRef}
          id={INPUT_ID}
          type='text'
          autoComplete='off'
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Tell Jovie what you want to create...'
          className='h-12 w-full rounded-full border border-black/8 bg-surface-1 pl-5 pr-14 text-[15px] text-primary-token placeholder:text-quaternary-token shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-colors duration-150 focus-visible:border-(--linear-border-focus) focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 dark:border-white/[0.08] dark:bg-surface-1 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
        />
        <button
          type='button'
          aria-label='Submit prompt'
          aria-disabled={!canSubmit}
          onClick={submit}
          className='absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-quaternary-token transition-colors duration-150 hover:text-primary-token aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-40'
        >
          <ArrowRight className='h-4 w-4' />
        </button>
      </div>

      <div
        className={CHAT_PROMPT_RAIL_SCROLL_CLASS}
        style={CHAT_PROMPT_RAIL_MASK_STYLE}
      >
        <div className={`${CHAT_PROMPT_RAIL_CLASS} justify-center px-4`}>
          {PILLS.map(pill => (
            <button
              key={pill.id}
              type='button'
              onClick={() => handlePillClick(pill)}
              className={`${getChatPromptPillClass('compact')} whitespace-nowrap`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
