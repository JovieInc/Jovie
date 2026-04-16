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
}

const MODE_CONTROLS_PROGRESS = 0.38;

interface RailFrame {
  readonly left: number;
  readonly width: number;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getPathSuffix(pathLabel: string): string {
  const lastSlashIndex = pathLabel.lastIndexOf('/');
  return lastSlashIndex >= 0 ? pathLabel.slice(lastSlashIndex) : pathLabel;
}

export function ArtistProfileModeSwitcher({
  adaptive,
  phoneCaption,
  phoneSubcaption,
}: Readonly<ArtistProfileModeSwitcherProps>) {
  const sequenceRef = useRef<HTMLDivElement>(null);
  const tabRailRef = useRef<HTMLDivElement>(null);
  const pathRailRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pathRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tabFrame, setTabFrame] = useState<RailFrame | null>(null);
  const [pathFrame, setPathFrame] = useState<RailFrame | null>(null);
  const activeMode = adaptive.modes[activeIndex] ?? adaptive.modes[0];
  const tabsVisible = reducedMotion || progress >= MODE_CONTROLS_PROGRESS;
  const activePath = getPathSuffix(activeMode.pathLabel);
  const cueIndex = Math.min(
    adaptive.contextCues.length - 1,
    Math.floor(
      (progress / MODE_CONTROLS_PROGRESS) * adaptive.contextCues.length
    )
  );

  const syncActiveRails = useCallback(() => {
    const tabRail = tabRailRef.current;
    const activeTab = tabRefs.current[activeIndex];
    if (tabRail && activeTab) {
      const railRect = tabRail.getBoundingClientRect();
      const activeRect = activeTab.getBoundingClientRect();
      setTabFrame({
        left: activeRect.left - railRect.left,
        width: activeRect.width,
      });
    }

    const pathRail = pathRailRef.current;
    const activePathChip = pathRefs.current[activeIndex];
    if (pathRail && activePathChip) {
      const railRect = pathRail.getBoundingClientRect();
      const activeRect = activePathChip.getBoundingClientRect();
      setPathFrame({
        left: activeRect.left - railRect.left,
        width: activeRect.width,
      });
    }
  }, [activeIndex]);

  const updateProgress = useCallback(() => {
    const section = sequenceRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const scrollable = rect.height - globalThis.innerHeight;
    const nextProgress =
      scrollable <= 0 ? 1 : clampProgress(-rect.top / scrollable);
    setProgress(nextProgress);
  }, []);

  useLayoutEffect(() => {
    syncActiveRails();
  }, [syncActiveRails, tabsVisible]);

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
    if (pathRailRef.current) {
      resizeObserver.observe(pathRailRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [syncActiveRails]);

  return (
    <div
      ref={sequenceRef}
      className={cn(
        'relative',
        reducedMotion ? 'py-10 sm:py-12 lg:py-14' : 'min-h-[130svh]'
      )}
    >
      <div
        className={cn(
          'flex justify-center px-5 sm:px-6',
          reducedMotion
            ? 'min-h-0 items-start'
            : 'sticky top-0 min-h-[100svh] items-start pt-20 sm:top-0 sm:min-h-[100svh] sm:pt-24'
        )}
      >
        <div className='mx-auto w-full max-w-[29rem] text-center'>
          <div className='mx-auto mb-4 max-w-[34rem] sm:mb-5'>
            <h2 className='mx-auto max-w-[8ch] text-[clamp(2.9rem,6vw,5.25rem)] font-semibold leading-[0.88] tracking-[-0.07em] text-primary-token'>
              {phoneCaption}
            </h2>
            <p className='mt-3 text-[clamp(1rem,1.7vw,1.22rem)] font-medium leading-[1.28] tracking-[-0.03em] text-secondary-token'>
              {phoneSubcaption}
            </p>
            <div className='mx-auto mt-3 flex max-w-[29rem] flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-x-5'>
              {adaptive.contextCues.map((cue, index) => {
                const isActive = index === cueIndex && !tabsVisible;
                return (
                  <span
                    key={cue}
                    className={cn(
                      'text-[12px] font-medium tracking-[-0.01em] transition-colors duration-300 sm:text-[13px]',
                      isActive ? 'text-primary-token' : 'text-tertiary-token'
                    )}
                  >
                    {cue}
                  </span>
                );
              })}
            </div>
          </div>

          <motion.div
            className='relative mx-auto w-[min(100%,20.5rem,31svh)]'
            initial={false}
            animate={
              reducedMotion
                ? { y: 0, scale: 1 }
                : {
                    y: tabsVisible ? -10 : -2,
                    scale: tabsVisible ? 1 : 0.988,
                  }
            }
            transition={{ type: 'spring', stiffness: 170, damping: 23 }}
          >
            <motion.div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-8 top-4 h-24 rounded-full bg-white/10 blur-3xl'
              initial={false}
              animate={
                reducedMotion
                  ? { opacity: 0.58, scale: 1 }
                  : {
                      opacity: tabsVisible ? 0.82 : 0.52,
                      scale: tabsVisible ? 1.08 : 0.94,
                    }
              }
              transition={{ type: 'spring', stiffness: 140, damping: 24 }}
            />
            <ArtistProfilePhoneFrame className='relative z-10 max-w-none'>
              <div className='relative h-full w-full'>
                <AnimatePresence mode='wait'>
                  <motion.div
                    key={activeMode.id}
                    className='absolute inset-0'
                    initial={
                      reducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: 18, scale: 1.025 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -12, scale: 0.985 }
                    }
                    transition={{
                      duration: reducedMotion ? 0.2 : 0.42,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Image
                      src={activeMode.screenshotSrc}
                      alt={activeMode.screenshotAlt}
                      fill
                      sizes='(max-width: 640px) 100vw, 376px'
                      className='object-cover object-top'
                      priority={activeMode.id === 'listen'}
                    />
                  </motion.div>
                </AnimatePresence>
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),transparent_22%,transparent_78%,rgba(0,0,0,0.2))]'
                />
              </div>
            </ArtistProfilePhoneFrame>
          </motion.div>

          <div
            aria-hidden={!tabsVisible}
            className={cn(
              'transition-all duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]',
              tabsVisible
                ? '-translate-y-3 opacity-100 sm:-translate-y-4'
                : 'pointer-events-none translate-y-3 opacity-0'
            )}
          >
            <div
              ref={tabRailRef}
              className='supports-[backdrop-filter]:bg-black/60 relative mx-auto mt-3 flex w-fit max-w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded-full border border-white/10 bg-black/85 p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.34)] supports-[backdrop-filter]:backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            >
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-6 top-px h-8 rounded-full bg-white/[0.045] blur-2xl'
              />
              {tabFrame ? (
                <motion.div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-y-1.5 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(231,231,235,0.92))] shadow-[0_10px_26px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.72)] ring-1 ring-black/5'
                  initial={false}
                  animate={{ x: tabFrame.left, width: tabFrame.width }}
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
                    tabIndex={tabsVisible ? 0 : -1}
                    ref={node => {
                      tabRefs.current[index] = node;
                    }}
                    onClick={() => {
                      setActiveIndex(index);
                    }}
                    className={cn(
                      'relative z-10 inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4.5 text-[13px] font-medium tracking-[-0.025em] transition-colors sm:h-11 sm:px-5 sm:text-[13.5px]',
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

            <div
              ref={pathRailRef}
              className='supports-[backdrop-filter]:bg-white/[0.03] relative mx-auto mt-2.5 flex w-fit max-w-full flex-nowrap items-center justify-center gap-1 overflow-x-auto rounded-full border border-white/[0.055] bg-white/[0.02] px-1.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] supports-[backdrop-filter]:backdrop-blur-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            >
              {pathFrame ? (
                <motion.div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-y-1 rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  initial={false}
                  animate={{ x: pathFrame.left, width: pathFrame.width }}
                  transition={
                    reducedMotion
                      ? { duration: 0.18, ease: 'easeOut' }
                      : {
                          type: 'spring',
                          stiffness: 360,
                          damping: 30,
                          mass: 0.7,
                        }
                  }
                />
              ) : null}
              {adaptive.modes.map((mode, index) => {
                const path = getPathSuffix(mode.pathLabel);
                const isActive = path === activePath;
                return (
                  <span
                    key={path}
                    ref={node => {
                      pathRefs.current[index] = node;
                    }}
                    className={cn(
                      'relative z-10 rounded-full px-3 py-1 font-mono text-[10px] tracking-[-0.035em] transition-colors duration-200 sm:text-[11px]',
                      isActive ? 'text-primary-token' : 'text-tertiary-token'
                    )}
                  >
                    {path}
                  </span>
                );
              })}
            </div>

            <div className='relative mx-auto mt-3 min-h-[2.6rem] max-w-[21rem]'>
              <AnimatePresence mode='wait'>
                <motion.p
                  key={activeMode.id}
                  className='absolute inset-x-0 text-[15px] font-medium leading-[1.35] tracking-[-0.03em] text-primary-token/88'
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 10, filter: 'blur(6px)' }
                  }
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -8, filter: 'blur(6px)' }
                  }
                  transition={{
                    duration: reducedMotion ? 0.16 : 0.34,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {activeMode.headline}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
