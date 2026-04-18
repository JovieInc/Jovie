'use client';

/**
 * Shared primitives for phone showcase sections (hero, sticky tour).
 *
 * Extracted to avoid duplication between HeroCinematic (static phone)
 * and StickyPhoneTour (scroll-driven phone with mode transitions).
 */

import { motion } from 'motion/react';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { Avatar } from '@/components/molecules/Avatar';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';
import {
  PHONE_SHOWCASE_MODES,
  type PhoneShowcaseModeData,
} from './phone-showcase-modes';

/* ------------------------------------------------------------------ */
/*  Mode data                                                          */
/* ------------------------------------------------------------------ */

export type ModeData = PhoneShowcaseModeData;

export const MODES: readonly ModeData[] = PHONE_SHOWCASE_MODES;

export const PHONE_TOUR_CONTAINER_CLASS =
  'mx-auto w-full max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0';

export const PHONE_TOUR_SHOWCASE_SHADOW =
  'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))';

export function PhoneTourDivider() {
  return (
    <div
      aria-hidden='true'
      className='mx-auto mb-16 h-px max-w-lg'
      style={{
        background:
          'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
      }}
    />
  );
}

export function PhoneTourMobileSection() {
  return (
    <section className='lg:hidden section-spacing-linear'>
      <div className={PHONE_TOUR_CONTAINER_CLASS}>
        <PhoneTourDivider />

        <div>
          <div className='mb-12 flex flex-col items-center gap-6 text-center'>
            <span className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token'>
              One profile. Every way fans support you.
            </span>
            <h2 className='marketing-h2-linear text-primary-token'>
              The right action for every fan.
            </h2>
            <p className='max-w-[400px] marketing-lead-linear text-secondary-token'>
              Every visitor sees the action most likely to convert in that
              moment: listen, tip, tour, or subscribe.
            </p>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            {MODES.map(mode => (
              <MobileCard key={mode.id} mode={mode} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

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

interface TabFrame {
  readonly left: number;
  readonly width: number;
}

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
  const [tabFrame, setTabFrame] = useState<TabFrame | null>(null);
  const reducedMotion = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabRailRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = controlledIndex ?? internalIndex;

  const syncActiveTab = useCallback(() => {
    const tabRail = tabRailRef.current;
    const activeTab = tabRefs.current[activeIndex];
    if (!tabRail || !activeTab) {
      return;
    }

    const railRect = tabRail.getBoundingClientRect();
    const activeRect = activeTab.getBoundingClientRect();
    setTabFrame({
      left: activeRect.left - railRect.left,
      width: activeRect.width,
    });
  }, [activeIndex]);

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

  useLayoutEffect(() => {
    syncActiveTab();
  }, [syncActiveTab]);

  useEffect(() => {
    if (globalThis.ResizeObserver === undefined) {
      globalThis.addEventListener('resize', syncActiveTab);
      return () => {
        globalThis.removeEventListener('resize', syncActiveTab);
      };
    }

    const resizeObserver = new globalThis.ResizeObserver(() => {
      syncActiveTab();
    });

    if (tabRailRef.current) {
      resizeObserver.observe(tabRailRef.current);
    }

    for (const tab of tabRefs.current) {
      if (tab) {
        resizeObserver.observe(tab);
      }
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [syncActiveTab]);

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
          <p className='text-[9px] uppercase tracking-[0.15em] text-secondary-token'>
            Powered by Jovie
          </p>
        </div>
      </PhoneFrame>

      {/* Tabs beneath the phone (can be hidden when rendered externally) */}
      {!hideTabs && (
        <nav
          ref={tabRailRef}
          className='relative mt-4 flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-subtle bg-surface-0/80 p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.18)] [scrollbar-width:none] supports-[backdrop-filter]:bg-surface-0/70 supports-[backdrop-filter]:backdrop-blur-lg [&::-webkit-scrollbar]:hidden'
          aria-label='Phone mode tabs'
        >
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-5 top-px h-8 rounded-full bg-white/[0.04] blur-2xl'
          />
          {tabFrame ? (
            <motion.div
              aria-hidden='true'
              className='pointer-events-none absolute inset-y-1.5 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,244,255,0.94))] shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/5'
              initial={false}
              animate={{ x: tabFrame.left, width: tabFrame.width }}
              transition={
                reducedMotion
                  ? { duration: 0.16, ease: 'easeOut' }
                  : {
                      type: 'spring',
                      stiffness: 360,
                      damping: 30,
                      mass: 0.7,
                    }
              }
            />
          ) : null}
          {modes.map((mode, i) => (
            <button
              key={mode.id}
              type='button'
              aria-pressed={i === activeIndex}
              onClick={() => handleTabClick(i)}
              ref={node => {
                tabRefs.current[i] = node;
              }}
              className={`relative z-10 rounded-full px-3 py-1 text-[11px] font-mono tracking-[-0.02em] transition-colors duration-300 ${
                i === activeIndex
                  ? 'text-[var(--linear-text-primary)]'
                  : 'text-[var(--linear-text-quaternary)] hover:text-[var(--linear-text-secondary)]'
              }`}
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
