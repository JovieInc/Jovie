'use client';

import {
  Bell,
  CalendarDays,
  Check,
  CreditCard,
  Link2,
  type LucideIcon,
  Mail,
  Music2,
  Ticket,
  WalletCards,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArtistProfileLandingCopy,
  ArtistProfileMode,
} from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface ArtistProfileModeSwitcherProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption: string;
  readonly phoneSubcaption: string;
}

const CONTEXT_CUES = [
  'Source-aware',
  'Location-aware',
  'Device-aware',
  'Release-aware',
] as const;

const DEEP_LINK_PROOF = ['/music', '/shows', '/pay', '/subscribe'] as const;

const BEAT_SWITCH_PROGRESS = 0.52;

const MODE_DRAWER_ICONS: Record<ArtistProfileMode['id'], LucideIcon> = {
  release: Music2,
  shows: CalendarDays,
  pay: WalletCards,
  subscribe: Bell,
  links: Link2,
};

const MODE_ITEM_ICONS: Record<string, LucideIcon> = {
  'apple-music': Music2,
  berlin: Ticket,
  booking: Mail,
  chicago: Ticket,
  email: Mail,
  five: CreditCard,
  instagram: Link2,
  la: Ticket,
  london: Ticket,
  'new-york': Ticket,
  notifications: Bell,
  source: Check,
  spotify: Music2,
  ten: CreditCard,
  twenty: CreditCard,
  youtube: Music2,
};

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ModeDrawerPreview({
  mode,
}: Readonly<{
  mode: ArtistProfileMode;
}>) {
  const HeaderIcon = MODE_DRAWER_ICONS[mode.id];
  const isPayMode = mode.id === 'pay';

  return (
    <div
      className='artist-profile-mode-drawer absolute inset-x-2 bottom-2 overflow-hidden rounded-t-[1.55rem] border border-white/12 bg-[#07080c]/95 p-3 text-left shadow-[0_-24px_60px_rgba(0,0,0,0.48)] backdrop-blur-xl'
      aria-hidden='true'
    >
      <div className='mx-auto mb-3 h-1 w-9 rounded-full bg-white/20' />
      <div className='flex items-start gap-2.5'>
        <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black'>
          <HeaderIcon className='h-4 w-4' strokeWidth={2} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-[15px] font-semibold leading-none tracking-[-0.04em] text-white'>
            {mode.drawer.title}
          </p>
          <p className='mt-1 text-[11px] font-medium leading-snug tracking-[-0.02em] text-white/52'>
            {mode.drawer.subtitle}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'mt-3',
          isPayMode ? 'grid grid-cols-3 gap-1.5' : 'space-y-1.5'
        )}
      >
        {mode.drawer.items.map(item => {
          const ItemIcon = MODE_ITEM_ICONS[item.id] ?? Check;
          return (
            <div
              key={item.id}
              className={cn(
                'rounded-[1rem] border border-white/10 bg-white/[0.045] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
                isPayMode
                  ? 'px-2 py-2.5 text-center'
                  : 'flex items-center gap-2.5 px-2.5 py-2'
              )}
            >
              {isPayMode ? (
                <>
                  <p className='text-[17px] font-semibold leading-none tracking-[-0.04em]'>
                    {item.label}
                  </p>
                  <p className='mt-1 truncate text-[10px] font-medium tracking-[-0.02em] text-white/48'>
                    {item.detail}
                  </p>
                </>
              ) : (
                <>
                  <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.075] text-white/76'>
                    <ItemIcon className='h-3.5 w-3.5' strokeWidth={2} />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-[12px] font-semibold leading-tight tracking-[-0.03em]'>
                      {item.label}
                    </span>
                    <span className='block truncate text-[10px] font-medium leading-tight tracking-[-0.02em] text-white/46'>
                      {item.detail}
                    </span>
                  </span>
                  <span className='shrink-0 rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-semibold leading-none tracking-[-0.02em] text-white/72'>
                    {item.action}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className='mt-2.5 flex h-9 items-center justify-center rounded-full bg-white text-[12px] font-semibold tracking-[-0.02em] text-black'>
        {mode.drawer.ctaLabel}
      </div>
    </div>
  );
}

export function ArtistProfileModeSwitcher({
  adaptive,
  phoneCaption,
  phoneSubcaption,
}: Readonly<ArtistProfileModeSwitcherProps>) {
  const sequenceRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [drawerNonce, setDrawerNonce] = useState(0);
  const [progress, setProgress] = useState(0);
  const activeMode = adaptive.modes[activeIndex] ?? adaptive.modes[0];
  const tabsVisible = reducedMotion || progress >= BEAT_SWITCH_PROGRESS;
  const tabBeatActive = !reducedMotion && tabsVisible;
  const cueIndex = Math.min(
    CONTEXT_CUES.length - 1,
    Math.floor((progress / BEAT_SWITCH_PROGRESS) * CONTEXT_CUES.length)
  );

  const updateProgress = useCallback(() => {
    const section = sequenceRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const scrollable = rect.height - globalThis.innerHeight;
    const nextProgress =
      scrollable <= 0 ? 1 : clampProgress(-rect.top / scrollable);
    setProgress(nextProgress);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const requestUpdate = () => {
      globalThis.cancelAnimationFrame(frame);
      frame = globalThis.requestAnimationFrame(updateProgress);
    };

    requestUpdate();
    globalThis.addEventListener('scroll', requestUpdate, { passive: true });
    globalThis.addEventListener('resize', requestUpdate);

    return () => {
      globalThis.removeEventListener('scroll', requestUpdate);
      globalThis.removeEventListener('resize', requestUpdate);
      globalThis.cancelAnimationFrame(frame);
    };
  }, [reducedMotion, updateProgress]);

  return (
    <div
      ref={sequenceRef}
      className={cn(
        'relative',
        reducedMotion ? 'py-20 sm:py-24 lg:py-28' : 'min-h-[190svh]'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center px-5 sm:px-6',
          reducedMotion ? 'min-h-0' : 'sticky top-0 min-h-svh py-8 sm:py-10'
        )}
      >
        <div className='mx-auto w-full max-w-[34rem] text-center'>
          <div
            className={cn(
              'mx-auto max-w-[34rem] overflow-hidden transition-[max-height,margin,opacity,transform] duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]',
              tabBeatActive
                ? 'mb-0 max-h-0 -translate-y-6 opacity-0'
                : 'mb-6 max-h-60 translate-y-0 opacity-100 sm:mb-7'
            )}
          >
            <h2 className='text-[clamp(3.25rem,7vw,6.75rem)] font-semibold leading-[0.86] tracking-[-0.08em] text-primary-token'>
              {phoneCaption}
            </h2>
            <p className='mt-3 text-[clamp(1.05rem,2vw,1.45rem)] font-medium leading-[1.2] tracking-[-0.04em] text-secondary-token'>
              {phoneSubcaption}
            </p>
            <div className='mx-auto mt-4 flex max-w-[31rem] flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:mt-5 sm:gap-x-5'>
              {CONTEXT_CUES.map((cue, index) => {
                const isActive = index === cueIndex && !tabsVisible;
                return (
                  <span
                    key={cue}
                    className={cn(
                      'relative text-[12px] font-medium tracking-[-0.01em] transition-colors duration-300 sm:text-[13px]',
                      isActive ? 'text-primary-token' : 'text-tertiary-token'
                    )}
                  >
                    {cue}
                    <span
                      aria-hidden='true'
                      className={cn(
                        'absolute -bottom-1 left-1/2 h-px w-5 -translate-x-1/2 rounded-full bg-white transition-opacity duration-300',
                        isActive ? 'opacity-70' : 'opacity-0'
                      )}
                    />
                  </span>
                );
              })}
            </div>
          </div>

          <div className='relative mx-auto aspect-[660/1368] w-[min(100%,23.5rem,36svh)]'>
            {adaptive.modes.map((mode, index) => {
              const isActive = index === activeIndex;
              return (
                <Image
                  key={mode.id}
                  src={mode.screenshotSrc}
                  alt={mode.screenshotAlt}
                  fill
                  sizes='(max-width: 640px) 100vw, 376px'
                  className={cn(
                    'object-contain object-center drop-shadow-[0_28px_82px_rgba(0,0,0,0.48)] transition-opacity duration-300 ease-out',
                    isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
                  )}
                  priority={mode.id === 'release'}
                />
              );
            })}
            <div className='artist-profile-mode-screen pointer-events-none absolute inset-x-[9.5%] bottom-[6.5%] top-[4.25%] overflow-hidden rounded-[2.15rem]'>
              <div className='artist-profile-mode-scrim absolute inset-x-0 bottom-0 h-[54%] bg-gradient-to-t from-black/72 via-black/22 to-transparent' />
              <ModeDrawerPreview
                key={`${activeMode.id}-${drawerNonce}`}
                mode={activeMode}
              />
            </div>
          </div>

          <div
            aria-hidden={!tabsVisible}
            className={cn(
              'transition-all duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]',
              tabsVisible
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-3 opacity-0'
            )}
          >
            <div className='mx-auto mt-3 flex w-full max-w-[min(100%,30rem)] flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded-full bg-white/[0.035] p-1.5 [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden'>
              {adaptive.modes.map((mode, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={mode.id}
                    type='button'
                    aria-pressed={isActive}
                    tabIndex={tabsVisible ? 0 : -1}
                    onClick={() => {
                      setActiveIndex(index);
                      setDrawerNonce(nonce => nonce + 1);
                    }}
                    className={cn(
                      'min-h-11 shrink-0 rounded-full px-3 py-2 text-[12px] font-medium transition-colors',
                      isActive
                        ? 'bg-white text-black'
                        : 'text-tertiary-token hover:bg-white/[0.06] hover:text-primary-token'
                    )}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            <div className='mx-auto mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[11px] tracking-[-0.02em] text-tertiary-token'>
              {DEEP_LINK_PROOF.map(path => (
                <span
                  key={path}
                  className={cn(
                    'transition-colors duration-200',
                    activeMode.pathLabel.endsWith(path) &&
                      'text-secondary-token'
                  )}
                >
                  {path}
                </span>
              ))}
            </div>

            <p className='mx-auto mt-4 max-w-[23rem] text-[15px] font-medium leading-[1.45] tracking-[-0.02em] text-secondary-token'>
              {activeMode.headline}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
