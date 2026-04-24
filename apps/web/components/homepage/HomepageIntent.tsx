'use client';

import { ArrowUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import {
  HERO_COPY,
  HOMEPAGE_INTENT_EXPERIMENT_ID,
  HOMEPAGE_INTENT_VARIANT_ID,
  type HomepagePill,
  PILLS,
} from './intent';
import {
  clearHomepageDraft,
  createHomepageIntent,
  persistHomepageIntent,
  readHomepageDraft,
  writeHomepageDraft,
} from './intent-store';

const INPUT_ID = 'homepage-intent-input';

/**
 * Viewport gate: desktop (≥768px) gets an intercepted modal via `router.push`;
 * mobile (<768px) gets a hard full-page navigation via `window.location.assign`.
 *
 * Fails closed to mobile until hydration so we never briefly open the modal on
 * a touch device while the media query is still resolving.
 */
function isDesktopViewport(): boolean {
  if (globalThis.window === undefined) return false;
  const matcher = globalThis.window.matchMedia;
  if (typeof matcher !== 'function') return false;
  // Require both viewport width AND hover+fine pointer so laptops with touch
  // still qualify but iPads in desktop mode don't get the modal.
  return matcher('(min-width: 768px) and (hover: hover) and (pointer: fine)')
    .matches;
}

function buildAuthUrl(intentId: string): string {
  const destination = `${APP_ROUTES.ONBOARDING}?intent_id=${encodeURIComponent(intentId)}`;
  return buildAuthRouteUrl(
    APP_ROUTES.SIGNUP,
    new URLSearchParams({ redirect_url: destination })
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

    // Rehydrate any in-progress draft from a previous visit so the fan picks
    // up where they left off. Cleared on submit and on successful signup
    // (via consumeHomepageIntent at the end of onboarding).
    const draft = readHomepageDraft();
    if (draft) {
      setValue(draft);
    }
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
      writeHomepageDraft(next);
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

    const intent = createHomepageIntent({
      finalPrompt: trimmed,
      pillId: activePill?.id ?? null,
      pillLabel: activePill?.label ?? null,
      insertedPrompt: activePill?.insertedPrompt ?? null,
    });

    // Intent capture is best-effort: if storage fails (private mode, quota,
    // disabled), we still redirect so the user isn't stranded — but we
    // surface the failure via analytics so we can see it in prod.
    let persisted = true;
    try {
      persistHomepageIntent(intent);
    } catch (error) {
      persisted = false;
      track('homepage_intent_persist_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }

    const desktop = isDesktopViewport();
    const surface: 'desktop_modal' | 'mobile_fullpage' = desktop
      ? 'desktop_modal'
      : 'mobile_fullpage';

    track('homepage_prompt_submitted', {
      pillId: intent.pillId,
      pillUsed: intent.pillId !== null,
      promptLength: intent.finalPrompt.length,
      persisted,
      surface,
      intentId: intent.id,
    });

    // The intent is now the source of truth in flight; the draft is
    // superseded and should not resurface if the fan navigates back here.
    clearHomepageDraft();

    const authUrl = buildAuthUrl(intent.id);
    if (desktop) {
      // Soft nav: the @auth parallel slot's intercepting route renders the
      // modal over the homepage. Browser-back closes it.
      router.push(authUrl);
    } else {
      // Hard nav: skips the intercept entirely and loads the full-page
      // /signup route. iOS Safari + modal + OAuth popup is a known jank.
      globalThis.window.location.assign(authUrl);
    }
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
        clearHomepageDraft();
      }
    },
    [submit]
  );

  const canSubmit = value.trim().length > 0;

  return (
    <div
      className='homepage-intent flex w-full min-w-0 flex-col items-center'
      style={{
        fontFeatureSettings: '"cv01", "ss03"',
      }}
    >
      <h1
        id='home-hero-heading'
        className='homepage-hero-headline self-center text-center text-white'
      >
        {HERO_COPY.headline}
      </h1>
      <p className='homepage-hero-subhead mt-5 max-w-[700px] self-center text-center text-[17px] leading-[1.55] tracking-[-0.015em] text-white/72 sm:text-[18px]'>
        {HERO_COPY.subhead}
      </p>

      <label htmlFor={INPUT_ID} className='sr-only'>
        Ask Jovie
      </label>
      <div className='relative mt-8 flex w-full max-w-[720px] items-center'>
        <input
          ref={inputRef}
          id={INPUT_ID}
          type='text'
          autoComplete='off'
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Ask Jovie...'
          className='h-[58px] w-full rounded-full border border-white/[0.1] bg-[linear-gradient(180deg,rgba(22,24,30,0.96)_0%,rgba(13,14,18,0.98)_100%)] pl-6 pr-[4.5rem] text-[15px] tracking-[-0.01em] text-white shadow-[0_18px_48px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.07)] outline-none transition-[border-color,box-shadow,transform] duration-150 placeholder:text-white/34 hover:border-white/[0.16] focus-visible:border-white/[0.24] focus-visible:shadow-[0_20px_60px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_4px_rgba(255,255,255,0.04)]'
        />
        <button
          type='button'
          aria-label='Submit prompt'
          aria-disabled={!canSubmit}
          onClick={submit}
          className={[
            'absolute right-[8px] inline-flex h-11 w-11 items-center justify-center rounded-full transition-all duration-150',
            canSubmit
              ? 'bg-white text-black shadow-[0_10px_24px_rgba(0,0,0,0.24)] hover:bg-white/94 active:scale-[0.97]'
              : 'bg-white/[0.05] text-white/32 pointer-events-none opacity-70',
          ].join(' ')}
        >
          <ArrowUp className='h-[18px] w-[18px]' strokeWidth={2.4} />
        </button>
      </div>

      <div
        className='mt-4 flex w-full min-w-0 max-w-[760px] items-center justify-center gap-2 overflow-x-auto scroll-smooth px-4 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, black 36px, black calc(100% - 36px), transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0, black 36px, black calc(100% - 36px), transparent 100%)',
        }}
      >
        {PILLS.map(pill => (
          <button
            key={pill.id}
            type='button'
            onClick={() => handlePillClick(pill)}
            className='shrink-0 whitespace-nowrap rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-[13px] font-medium tracking-[-0.012em] text-white/66 transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-[0.5px] hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white/88 focus-visible:border-white/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/8 active:translate-y-0'
          >
            {pill.label}
          </button>
        ))}
      </div>
    </div>
  );
}
