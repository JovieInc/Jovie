'use client';

import { ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { trackHomepageEvent } from './homepage-analytics';
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
  const pillRailRef = useRef<HTMLDivElement>(null);
  const editedFiredRef = useRef(false);
  const viewedFiredRef = useRef(false);
  const [value, setValue] = useState('');
  const [activePill, setActivePill] = useState<HomepagePill | null>(null);
  const [canScrollPillsLeft, setCanScrollPillsLeft] = useState(false);
  const [canScrollPillsRight, setCanScrollPillsRight] = useState(false);

  useEffect(() => {
    if (viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    const viewedTimer = globalThis.window.setTimeout(() => {
      trackHomepageEvent('homepage_viewed', {
        experimentId: HOMEPAGE_INTENT_EXPERIMENT_ID,
        variantId: HOMEPAGE_INTENT_VARIANT_ID,
      });
    }, 3000);

    // Rehydrate any in-progress draft from a previous visit so the fan picks
    // up where they left off. Cleared on submit and on successful signup
    // (via consumeHomepageIntent at the end of onboarding).
    const draft = readHomepageDraft();
    if (draft) {
      setValue(draft);
    }

    return () => {
      globalThis.window.clearTimeout(viewedTimer);
    };
  }, []);

  const syncPillRailControls = useCallback(() => {
    const rail = pillRailRef.current;
    if (!rail) return;
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    setCanScrollPillsLeft(rail.scrollLeft > 4);
    setCanScrollPillsRight(maxScrollLeft - rail.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const rail = pillRailRef.current;
    if (!rail) return;

    const onScroll = () => syncPillRailControls();
    const frame = globalThis.window.requestAnimationFrame(syncPillRailControls);
    rail.addEventListener('scroll', onScroll, { passive: true });
    globalThis.window.addEventListener('resize', onScroll);

    const ResizeObserverCtor = globalThis.ResizeObserver;
    const resizeObserver =
      typeof ResizeObserverCtor === 'function'
        ? new ResizeObserverCtor(() => syncPillRailControls())
        : null;
    resizeObserver?.observe(rail);

    return () => {
      globalThis.window.cancelAnimationFrame(frame);
      rail.removeEventListener('scroll', onScroll);
      globalThis.window.removeEventListener('resize', onScroll);
      resizeObserver?.disconnect();
    };
  }, [syncPillRailControls]);

  const handlePillClick = useCallback((pill: HomepagePill) => {
    setActivePill(pill);
    setValue(pill.insertedPrompt);
    trackHomepageEvent('homepage_pill_clicked', {
      pillId: pill.id,
      pillLabel: pill.label,
    });
    const input = inputRef.current;
    if (input) {
      input.focus();
      const cursor = pill.insertedPrompt.length;
      input.setSelectionRange(cursor, cursor);
    }
  }, []);

  const scrollPills = useCallback(
    (direction: -1 | 1) => {
      const rail = pillRailRef.current;
      if (!rail) return;
      rail.scrollBy({
        left: direction * Math.max(rail.clientWidth * 0.72, 180),
        behavior: 'smooth',
      });
      globalThis.window.requestAnimationFrame(syncPillRailControls);
    },
    [syncPillRailControls]
  );

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      writeHomepageDraft(next);
      if (activePill && !next.startsWith(activePill.insertedPrompt)) {
        setActivePill(null);
      }
      if (!editedFiredRef.current && next.length > 0) {
        editedFiredRef.current = true;
        trackHomepageEvent('homepage_prompt_edited', {
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
      trackHomepageEvent('homepage_intent_persist_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }

    const desktop = isDesktopViewport();
    const surface: 'desktop_modal' | 'mobile_fullpage' = desktop
      ? 'desktop_modal'
      : 'mobile_fullpage';

    trackHomepageEvent('homepage_prompt_submitted', {
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
      <p className='homepage-hero-subhead mt-6 max-w-[680px] self-center text-center text-[17px] leading-[1.58] tracking-[-0.015em] text-white/68 sm:text-[18px]'>
        {HERO_COPY.subhead}
      </p>

      <label htmlFor={INPUT_ID} className='sr-only'>
        Ask Jovie
      </label>
      <div className='relative mt-8 flex w-full max-w-[780px] items-center'>
        <input
          ref={inputRef}
          id={INPUT_ID}
          type='text'
          autoComplete='off'
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Ask Jovie...'
          className='h-[62px] w-full rounded-full border border-white/[0.09] bg-[linear-gradient(180deg,rgba(18,20,28,0.9)_0%,rgba(12,13,18,0.94)_100%)] pl-6 pr-[4.85rem] text-[16px] tracking-[-0.016em] text-white shadow-[0_14px_42px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] outline-none transition-[border-color,box-shadow,transform] duration-150 placeholder:text-white/26 hover:border-white/[0.13] focus-visible:border-white/[0.18] focus-visible:shadow-[0_16px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_4px_rgba(255,255,255,0.025)] sm:h-[64px]'
        />
        <button
          type='button'
          aria-label='Submit prompt'
          aria-disabled={!canSubmit}
          onClick={submit}
          className={[
            'absolute right-[9px] inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-150 sm:h-12 sm:w-12',
            canSubmit
              ? 'border-white/[0.08] bg-white/[0.09] text-white shadow-[0_10px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-white/[0.12] active:scale-[0.97]'
              : 'border-white/[0.04] bg-white/[0.04] text-white/28 pointer-events-none opacity-80',
          ].join(' ')}
        >
          <ArrowUp className='h-[18px] w-[18px]' strokeWidth={2.4} />
        </button>
      </div>

      <div className='relative mt-4 w-full max-w-[888px]'>
        <button
          type='button'
          aria-label='Scroll prompts left'
          data-testid='homepage-pill-scroll-left'
          disabled={!canScrollPillsLeft}
          onClick={() => scrollPills(-1)}
          className='absolute left-0 top-1/2 z-[1] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.05] bg-white/[0.025] text-white/56 transition-all duration-150 hover:border-white/[0.1] hover:bg-white/[0.05] hover:text-white disabled:pointer-events-none disabled:opacity-0 sm:inline-flex'
        >
          <ChevronLeft className='h-4 w-4' strokeWidth={1.8} />
        </button>
        <div
          ref={pillRailRef}
          data-testid='homepage-pill-rail'
          className='flex w-full min-w-0 items-center justify-start gap-2 overflow-x-auto scroll-smooth px-4 py-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-auto sm:max-w-[804px] sm:px-8 [&::-webkit-scrollbar]:hidden'
          style={{
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0, black 56px, black calc(100% - 56px), transparent 100%)',
            maskImage:
              'linear-gradient(to right, transparent 0, black 56px, black calc(100% - 56px), transparent 100%)',
          }}
        >
          {PILLS.map(pill => (
            <button
              key={pill.id}
              type='button'
              onClick={() => handlePillClick(pill)}
              className='shrink-0 whitespace-nowrap rounded-full border border-white/[0.05] bg-white/[0.025] px-[15px] py-[8px] text-[12.5px] font-medium tracking-[-0.012em] text-white/62 transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-[0.5px] hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-white/84 focus-visible:border-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/8 active:translate-y-0'
            >
              {pill.label}
            </button>
          ))}
        </div>
        <button
          type='button'
          aria-label='Scroll prompts right'
          data-testid='homepage-pill-scroll-right'
          disabled={!canScrollPillsRight}
          onClick={() => scrollPills(1)}
          className='absolute right-0 top-1/2 z-[1] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.05] bg-white/[0.025] text-white/56 transition-all duration-150 hover:border-white/[0.1] hover:bg-white/[0.05] hover:text-white disabled:pointer-events-none disabled:opacity-0 sm:inline-flex'
        >
          <ChevronRight className='h-4 w-4' strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
