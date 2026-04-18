'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';

interface ArtistProfileModeSwitcherProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption: string;
  readonly phoneSubcaption: string;
  readonly showIntroHeading?: boolean;
}

interface RailFrame {
  readonly left: number;
  readonly width: number;
}

export function ArtistProfileModeSwitcher({
  adaptive,
  phoneCaption,
  phoneSubcaption,
  showIntroHeading = true,
}: Readonly<ArtistProfileModeSwitcherProps>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRailRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sequenceTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const sequenceStartedRef = useRef(false);
  const manualSelectionRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [introVisible, setIntroVisible] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(reducedMotion);
  const [tabFrame, setTabFrame] = useState<RailFrame | null>(null);
  const activeMode =
    activeIndex === null ? null : (adaptive.modes[activeIndex] ?? null);

  const clearSequenceTimers = useCallback(() => {
    for (const timer of sequenceTimersRef.current) {
      globalThis.clearTimeout(timer);
    }
    sequenceTimersRef.current = [];
  }, []);

  const syncActiveRails = useCallback(() => {
    if (activeIndex === null) {
      setTabFrame(null);
      return;
    }

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

  useLayoutEffect(() => {
    syncActiveRails();
  }, [syncActiveRails]);

  const startSequence = useCallback(() => {
    if (manualSelectionRef.current || sequenceStartedRef.current) {
      return;
    }

    const listenIndex = adaptive.modes.findIndex(mode => mode.id === 'listen');
    const tourIndex = adaptive.modes.findIndex(mode => mode.id === 'tour');
    const firstIndex = Math.max(listenIndex, 0);

    sequenceStartedRef.current = true;
    setTabsVisible(true);

    if (reducedMotion) {
      return;
    }

    const queueSelection = (index: number, delay: number) => {
      if (index < 0) {
        return;
      }

      const timer = globalThis.setTimeout(() => {
        if (!manualSelectionRef.current) {
          setActiveIndex(index);
        }
      }, delay);
      sequenceTimersRef.current.push(timer);
    };

    queueSelection(firstIndex, 220);
    if (tourIndex >= 0 && tourIndex !== firstIndex) {
      queueSelection(tourIndex, 1320);
    }
  }, [adaptive.modes, reducedMotion]);

  useEffect(() => {
    const syncIntroVisibility = () => {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      if (globalThis.innerWidth < 768) {
        setIntroVisible(true);
        startSequence();
        return;
      }

      const rect = root.getBoundingClientRect();
      const activationOffset = Math.min(globalThis.innerHeight * 0.22, 220);
      const shouldReveal = rect.top <= activationOffset;
      setIntroVisible(shouldReveal);

      if (shouldReveal) {
        startSequence();
      }
    };

    syncIntroVisibility();
    globalThis.addEventListener('scroll', syncIntroVisibility, {
      passive: true,
    });
    globalThis.addEventListener('resize', syncIntroVisibility);

    return () => {
      globalThis.removeEventListener('scroll', syncIntroVisibility);
      globalThis.removeEventListener('resize', syncIntroVisibility);
    };
  }, [startSequence]);

  useEffect(() => {
    if (globalThis.ResizeObserver === undefined) {
      globalThis.addEventListener('resize', syncActiveRails);
      return () => {
        globalThis.removeEventListener('resize', syncActiveRails);
      };
    }

    const resizeObserver = new globalThis.ResizeObserver(() => {
      syncActiveRails();
    });

    if (tabRailRef.current) {
      resizeObserver.observe(tabRailRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [syncActiveRails]);

  useEffect(() => {
    return () => {
      clearSequenceTimers();
    };
  }, [clearSequenceTimers]);

  return (
    <div
      ref={rootRef}
      className='artist-profile-mode-switcher mx-auto flex w-full max-w-[26rem] flex-col items-center text-center'
    >
      {showIntroHeading ? (
        <motion.div
          className='artist-profile-mode-switcher-heading mx-auto max-w-[24rem]'
          initial={false}
          animate={
            introVisible
              ? { opacity: 1, y: 0, filter: 'blur(0px)' }
              : { opacity: 0, y: 18, filter: 'blur(8px)' }
          }
          transition={{
            duration: reducedMotion ? 0.16 : 0.34,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className='min-h-[4.5rem] sm:min-h-[5.1rem]'>
            <h2 className='mx-auto max-w-[9ch] text-[clamp(2.05rem,4vw,3.75rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-primary-token'>
              {phoneCaption}
            </h2>
          </div>
          <div className='min-h-[2.3rem]'>
            <p className='mt-1.5 text-[clamp(0.9rem,1.2vw,1rem)] font-medium leading-[1.28] tracking-[-0.03em] text-secondary-token'>
              {phoneSubcaption}
            </p>
          </div>
        </motion.div>
      ) : null}

      <div className='artist-profile-mode-switcher-phone relative mt-3.5 w-full max-w-[15.75rem] sm:mt-4 sm:max-w-[16.75rem]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-5 top-4 h-[4.5rem] rounded-full bg-white/10 blur-3xl'
        />
        <ArtistProfilePhoneFrame className='relative z-10 max-w-none'>
          <div className='relative h-full w-full'>
            <AnimatePresence initial={false}>
              <motion.div
                key={activeMode?.id ?? 'resting'}
                className='absolute inset-0'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reducedMotion ? 0.18 : 0.36,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Image
                  src={
                    activeMode?.screenshotSrc ?? adaptive.restingScreenshotSrc
                  }
                  alt={
                    activeMode?.screenshotAlt ?? adaptive.restingScreenshotAlt
                  }
                  fill
                  sizes='(max-width: 640px) 100vw, 330px'
                  className='object-cover object-top'
                  priority={activeMode?.id === 'listen' || activeMode === null}
                />
              </motion.div>
            </AnimatePresence>
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),transparent_22%,transparent_78%,rgba(0,0,0,0.2))]'
            />
          </div>
        </ArtistProfilePhoneFrame>
      </div>

      <div
        ref={tabRailRef}
        className={cn(
          'artist-profile-mode-switcher-tabs relative mx-auto mt-4 flex w-fit max-w-full flex-nowrap items-center justify-start gap-0.5 overflow-x-auto rounded-full border border-white/14 bg-white/[0.04] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_36px_rgba(0,0,0,0.26)] transition-opacity duration-300 supports-[backdrop-filter]:bg-black/58 supports-[backdrop-filter]:backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          tabsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-5 top-px h-6 rounded-full bg-white/[0.05] blur-2xl'
        />
        {tabFrame ? (
          <motion.div
            aria-hidden='true'
            className='homepage-pill-primary pointer-events-none absolute inset-y-[3px] !px-0 shadow-[0_10px_22px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.78)]'
            initial={false}
            animate={{ x: tabFrame.left, width: tabFrame.width }}
            style={{ boxSizing: 'border-box' }}
            transition={
              reducedMotion
                ? { duration: 0.18, ease: 'easeOut' }
                : {
                    type: 'spring',
                    stiffness: 380,
                    damping: 32,
                    mass: 0.72,
                  }
            }
          />
        ) : null}
        {adaptive.modes.map((mode, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={mode.id}
              type='button'
              aria-pressed={isActive}
              ref={node => {
                tabRefs.current[index] = node;
              }}
              onClick={() => {
                manualSelectionRef.current = true;
                clearSequenceTimers();
                setTabsVisible(true);
                setActiveIndex(index);
              }}
              className={cn(
                'relative z-10 inline-flex h-8 min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.25 text-center text-[11.5px] font-medium leading-none tracking-[-0.02em] transition-colors sm:h-9 sm:px-3.75 sm:text-[12.25px]',
                isActive
                  ? 'text-black'
                  : 'text-secondary-token/88 hover:text-primary-token'
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className='artist-profile-mode-switcher-active relative mx-auto mt-2.5 min-h-[2.2rem] w-full max-w-[20rem] px-2 sm:mt-3'>
        <AnimatePresence initial={false}>
          {activeMode ? (
            <motion.p
              key={activeMode.id}
              className='absolute inset-x-0 text-[14px] font-medium leading-[1.3] tracking-[-0.03em] text-primary-token/92 sm:text-[15px]'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reducedMotion ? 0.16 : 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {activeMode.headline}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <style>{`
        @media (max-height: 820px) {
          .artist-profile-mode-switcher-heading h2 {
            font-size: clamp(1.9rem, 3.6vw, 3.15rem);
          }

          .artist-profile-mode-switcher-heading p {
            margin-top: 0.35rem;
            font-size: clamp(0.85rem, 1.05vw, 0.95rem);
          }

          .artist-profile-mode-switcher-phone {
            max-width: 14.75rem;
            margin-top: 0.75rem;
          }

          .artist-profile-mode-switcher-tabs {
            margin-top: 0.75rem;
          }

          .artist-profile-mode-switcher-active {
            margin-top: 0.55rem;
            min-height: 2rem;
          }
        }

        @media (max-width: 640px) {
          .artist-profile-mode-switcher-tabs button {
            font-size: 12px;
            padding-left: 0.75rem;
            padding-right: 0.75rem;
          }

          .artist-profile-mode-switcher-active {
            min-height: 2.8rem;
          }

          .artist-profile-mode-switcher-active p {
            font-size: 14px;
          }

          .artist-profile-mode-switcher-phone {
            max-width: 15.5rem;
          }
        }
      `}</style>
    </div>
  );
}
