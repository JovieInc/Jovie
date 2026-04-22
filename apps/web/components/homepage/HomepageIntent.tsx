'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
    <div
      className='homepage-intent flex w-full min-w-0 max-w-[720px] flex-col items-stretch'
      style={{
        fontFeatureSettings: '"cv01", "ss03"',
      }}
    >
      <label
        htmlFor={INPUT_ID}
        className='mb-3 text-center text-[12px] font-normal tracking-[0] text-quaternary-token'
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
          className='h-[52px] w-full rounded-full border border-white/[0.09] bg-[var(--color-bg-surface-1)] pl-6 pr-14 text-[15px] tracking-[-0.005em] text-primary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.6)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-quaternary-token placeholder:tracking-[-0.005em] hover:border-white/[0.14] focus-visible:border-white/[0.32] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_3px_rgba(255,255,255,0.06),0_1px_3px_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.6)]'
        />
        <button
          type='button'
          aria-label='Submit prompt'
          aria-disabled={!canSubmit}
          onClick={submit}
          className={[
            'absolute right-[6px] inline-flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150',
            canSubmit
              ? 'bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.4)] hover:bg-white/95 active:scale-95'
              : 'bg-white/[0.04] text-quaternary-token pointer-events-none opacity-60',
          ].join(' ')}
        >
          <ArrowRight className='h-[18px] w-[18px]' strokeWidth={2.25} />
        </button>
      </div>

      <div
        className='mt-5 flex w-full min-w-0 items-center justify-center gap-2 overflow-x-auto scroll-smooth px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)',
        }}
      >
        {PILLS.map(pill => (
          <button
            key={pill.id}
            type='button'
            onClick={() => handlePillClick(pill)}
            className='group inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/[0.07] bg-[var(--color-bg-surface-1)] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-secondary-token shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-[0.5px] hover:border-white/[0.14] hover:bg-[var(--color-bg-surface-2)] hover:text-primary-token focus-visible:border-white/[0.32] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/10 active:translate-y-0'
          >
            {pill.label}
          </button>
        ))}
      </div>
    </div>
  );
}
