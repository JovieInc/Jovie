'use client';

import {
  ArrowRight,
  Bell,
  Calendar,
  FileText,
  type LucideIcon,
  Send,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import {
  HOMEPAGE_INTENT_EXPERIMENT_ID,
  HOMEPAGE_INTENT_VARIANT_ID,
  type HomepagePill,
  type HomepagePillId,
  PILLS,
} from './intent';
import { createHomepageIntent, persistHomepageIntent } from './intent-store';

const INPUT_ID = 'homepage-intent-input';

const PILL_ICONS: Record<HomepagePillId, LucideIcon> = {
  create_release_page: FileText,
  generate_album_art: Sparkles,
  generate_playlist_pitch: Send,
  plan_a_release: Calendar,
  build_artist_profile: UserCircle,
  setup_fan_notifications: Bell,
};

/**
 * Viewport gate: desktop (≥768px) gets an intercepted modal via `router.push`;
 * mobile (<768px) gets a hard full-page navigation via `window.location.assign`.
 *
 * Fails closed to mobile until hydration so we never briefly open the modal on
 * a touch device while the media query is still resolving.
 */
function isDesktopViewport(): boolean {
  if (typeof globalThis.window === 'undefined') return false;
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
      }
    },
    [submit]
  );

  const canSubmit = value.trim().length > 0;

  return (
    <div
      className='homepage-intent flex w-full min-w-0 max-w-[640px] flex-col items-stretch'
      style={{
        fontFeatureSettings: '"cv01", "ss03"',
      }}
    >
      <h1 className='text-center text-[40px] font-bold leading-[1.05] tracking-[-0.025em] text-primary-token sm:text-[48px] md:text-[56px]'>
        How can I help you today?
      </h1>
      <p className='mt-4 text-center text-[15px] leading-[1.5] tracking-[-0.005em] text-tertiary-token sm:text-[17px]'>
        Jovie helps artists &amp; labels release music faster.
      </p>

      <label htmlFor={INPUT_ID} className='sr-only'>
        Message Jovie
      </label>
      <div className='relative mt-7 flex w-full items-center'>
        <input
          ref={inputRef}
          id={INPUT_ID}
          type='text'
          autoComplete='off'
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Message...'
          className='h-[52px] w-full rounded-full border border-white/[0.06] bg-[var(--color-bg-surface-1)] pl-6 pr-14 text-[15px] tracking-[-0.005em] text-primary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.6)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-quaternary-token placeholder:tracking-[-0.005em] hover:border-white/[0.18] focus-visible:border-white/[0.32] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_3px_rgba(255,255,255,0.06),0_1px_3px_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.6)]'
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
        className='mt-4 flex w-full min-w-0 items-center justify-center gap-2 overflow-x-auto scroll-smooth px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)',
        }}
      >
        {PILLS.map(pill => {
          const Icon = PILL_ICONS[pill.id];
          return (
            <button
              key={pill.id}
              type='button'
              onClick={() => handlePillClick(pill)}
              className='group inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.05] bg-[var(--color-bg-surface-1)] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-secondary-token shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-[0.5px] hover:border-white/[0.18] hover:bg-[var(--color-bg-surface-2)] hover:text-primary-token focus-visible:border-white/[0.32] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/10 active:translate-y-0'
            >
              <Icon
                className='h-[14px] w-[14px] text-quaternary-token transition-colors duration-150 group-hover:text-secondary-token'
                strokeWidth={1.75}
                aria-hidden='true'
              />
              {pill.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
