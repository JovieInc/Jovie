'use client';

/**
 * Shared primitives for phone showcase sections (hero, sticky tour).
 *
 * Extracted to avoid duplication between HeroCinematic (static phone)
 * and StickyPhoneTour (scroll-driven phone with mode transitions).
 */

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { Avatar } from '@/components/molecules/Avatar';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  type MODE_IDS,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

/* ------------------------------------------------------------------ */
/*  Mode data                                                          */
/* ------------------------------------------------------------------ */

export interface ModeData {
  id: (typeof MODE_IDS)[number];
  headline: string;
  description: string;
  outcome: string;
}

export const MODES: ModeData[] = [
  {
    id: 'profile',
    headline: 'Keep the fan before they disappear.',
    description:
      'First-time visitors can subscribe fast. Returning fans see the next best action instead of a generic stack of links.',
    outcome: 'Grow',
  },
  {
    id: 'tour',
    headline: 'Show the closest show first.',
    description:
      'A fan in Los Angeles should not scroll through 30 cities. Jovie surfaces the nearest date and ticket button first.',
    outcome: 'Sell tickets',
  },
  {
    id: 'tip',
    headline: 'Turn in-person moments into revenue.',
    description:
      'When someone scans your QR code after a set, Jovie opens the fastest tip flow instead of another menu of links.',
    outcome: 'Earn tips',
  },
  {
    id: 'listen',
    headline: 'Open the right streaming app instantly.',
    description:
      'A new listener taps once. Jovie routes them to Spotify, Apple Music, or YouTube Music without the usual friction.',
    outcome: 'Boost streams',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Scroll-to-index pure function (testable)                           */
/* ------------------------------------------------------------------ */

export function scrollToActiveIndex(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number,
  modeCount: number
): number {
  const scrollableHeight = sectionHeight - viewportHeight;
  if (scrollableHeight <= 0) return 0;
  const scrolled = -sectionTop;
  const progress = Math.max(0, Math.min(1, scrolled / scrollableHeight));
  return Math.min(modeCount - 1, Math.floor(progress * modeCount));
}

/* ------------------------------------------------------------------ */
/*  CrossfadeBlock                                                     */
/* ------------------------------------------------------------------ */

export function CrossfadeBlock({
  activeIndex,
  children,
}: {
  readonly activeIndex: number;
  readonly children: React.ReactNode;
}) {
  const childNodes = Children.toArray(children);
  return (
    <div className='grid'>
      {childNodes.map((child, index) => {
        const childKey =
          isValidElement(child) && child.key !== null
            ? String(child.key)
            : `crossfade-${index}`;
        return (
          <div
            key={childKey}
            aria-hidden={index !== activeIndex}
            className='transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
            style={{
              opacity: index === activeIndex ? 1 : 0,
              gridArea: '1 / 1',
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PhoneShowcase — auto-rotating with tabs                            */
/* ------------------------------------------------------------------ */

const ROTATION_INTERVAL = 3500;
const ROTATION_DELAY = 1500;

/** Tab labels shown beneath the phone, using URL-style paths. */
export const MODE_TAB_LABELS: Record<string, string> = {
  profile: '/profile',
  tour: '/tour',
  tip: '/tip',
  listen: '/listen',
};

interface PhoneShowcaseProps {
  readonly activeIndex?: number;
  readonly modes: readonly ModeData[];
  /** Auto-rotate through modes. Defaults to true. */
  readonly autoRotate?: boolean;
  /** Called when active index changes (for external tab rendering). */
  readonly onIndexChange?: (index: number) => void;
  /** Hide built-in tabs (render them externally instead). */
  readonly hideTabs?: boolean;
}

export function PhoneShowcase({
  activeIndex: controlledIndex,
  modes,
  autoRotate = true,
  onIndexChange,
  hideTabs = false,
}: PhoneShowcaseProps) {
  const [internalIndex, setInternalIndex] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [started, setStarted] = useState(!autoRotate);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeIndex = controlledIndex ?? internalIndex;

  // Notify parent of index changes
  useEffect(() => {
    onIndexChange?.(internalIndex);
  }, [internalIndex, onIndexChange]);

  const goTo = useCallback(
    (next: number) => {
      setDirection(next > internalIndex ? 'left' : 'right');
      setInternalIndex(next);
    },
    [internalIndex]
  );

  // Delayed start + auto-rotation
  useEffect(() => {
    if (!autoRotate) return;

    const delayTimer = setTimeout(() => {
      setStarted(true);
      setDirection('left');
      setInternalIndex(1);
    }, ROTATION_DELAY);

    return () => clearTimeout(delayTimer);
  }, [autoRotate]);

  useEffect(() => {
    if (!autoRotate || !started) return;

    timerRef.current = setInterval(() => {
      setInternalIndex(prev => {
        const next = (prev + 1) % modes.length;
        setDirection('left');
        return next;
      });
    }, ROTATION_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRotate, started, modes.length]);

  const handleTabClick = useCallback(
    (index: number) => {
      goTo(index);
      // Reset the auto-rotation timer on manual click
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoRotate) {
        timerRef.current = setInterval(() => {
          setInternalIndex(prev => {
            const next = (prev + 1) % modes.length;
            setDirection('left');
            return next;
          });
        }, ROTATION_INTERVAL);
      }
    },
    [goTo, autoRotate, modes.length]
  );

  // Slide direction: entering slides in from left/right, exiting slides out the other way
  const slideOffset = direction === 'left' ? '100%' : '-100%';
  const slideOffsetOut = direction === 'left' ? '-100%' : '100%';

  return (
    <div className='flex flex-col items-center'>
      <PhoneFrame>
        {/* Minimal profile header */}
        <div className='flex flex-col items-center px-5 pt-14 pb-3'>
          <div className='rounded-full p-[2px] ring-1 ring-white/6 shadow-sm'>
            <Avatar
              src={MOCK_ARTIST.image}
              alt={MOCK_ARTIST.name}
              name={MOCK_ARTIST.name}
              size='display-md'
            />
          </div>
          <div className='mt-2.5 text-center'>
            <ArtistName
              name={MOCK_ARTIST.name}
              handle={MOCK_ARTIST.handle}
              isVerified={MOCK_ARTIST.isVerified}
              size='md'
              showLink={false}
              as='p'
            />
          </div>
        </div>

        {/* Mode content — slide transitions */}
        <div
          className='relative overflow-hidden'
          style={{ height: PHONE_CONTENT_HEIGHT }}
        >
          {modes.map((mode, i) => {
            const isActive = i === activeIndex;
            let transform = `translateX(${slideOffset})`;
            if (isActive) transform = 'translateX(0)';
            else if (
              i < activeIndex ||
              (activeIndex === 0 && i === modes.length - 1)
            )
              transform = `translateX(${slideOffsetOut})`;

            return (
              <div
                key={mode.id}
                className='absolute inset-0 px-5 transition-transform duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
                style={{
                  transform,
                  opacity: isActive ? 1 : 0,
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
              >
                {MODE_CONTENT[mode.id]}
              </div>
            );
          })}
        </div>

        <div className='pb-3 pt-1 text-center'>
          <p className='text-[9px] uppercase tracking-[0.15em] text-quaternary-token'>
            Powered by Jovie
          </p>
        </div>
      </PhoneFrame>

      {/* Tabs beneath the phone (can be hidden when rendered externally) */}
      {!hideTabs && (
        <nav
          className='mt-4 flex items-center gap-1'
          aria-label='Phone mode tabs'
        >
          {modes.map((mode, i) => (
            <button
              key={mode.id}
              type='button'
              onClick={() => handleTabClick(i)}
              className='rounded-full px-3 py-1 text-[11px] font-mono tracking-[-0.02em] transition-all duration-300'
              style={{
                backgroundColor:
                  i === activeIndex
                    ? 'var(--linear-bg-surface-2)'
                    : 'transparent',
                color:
                  i === activeIndex
                    ? 'var(--linear-text-primary)'
                    : 'var(--linear-text-quaternary)',
                border:
                  i === activeIndex
                    ? '1px solid var(--linear-border-default)'
                    : '1px solid transparent',
              }}
            >
              {MODE_TAB_LABELS[mode.id] ?? `/${mode.id}`}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MobileCard                                                         */
/* ------------------------------------------------------------------ */

export function MobileCard({ mode }: { readonly mode: ModeData }) {
  return (
    <div
      className='rounded-xl px-6 py-6'
      style={{
        backgroundColor: 'var(--linear-bg-hover)',
        border: '1px solid var(--linear-border-subtle)',
      }}
    >
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-lg font-semibold tracking-tight text-primary-token'>
          {mode.headline}
        </h3>
        <span className='shrink-0 rounded-full border border-subtle px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-secondary-token'>
          {mode.outcome}
        </span>
      </div>
      <p className='mt-2 text-[14px] leading-[1.6] text-secondary-token'>
        {mode.description}
      </p>
    </div>
  );
}
