'use client';

import {
  motion,
  useReducedMotion as useMotionReducedMotion,
} from 'motion/react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContributionGraph } from '@/components/ui/contribution-graph';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import {
  countFridaysInYear,
  FRIDAY_RELEASE_KINDS,
  FRIDAY_RHYTHM_YEAR,
  generateFridayRhythmData,
  INITIAL_ACTIVE_FRIDAYS,
} from './friday-rhythm-data';

const SCROLL_START = 0.15;
const SCROLL_END = 0.85;
const HEARTBEAT_WIDTH = 100;
const HEARTBEAT_HEIGHT = 28;

type RhythmMode = 'before' | 'after';

const RHYTHM_ACTION_CARDS = [
  {
    accent: '#7c5cff',
    label: 'Merch Drop',
    text: "Nothing scheduled for next Friday? Should we drop some new merch? Here's 3 designs I think you'll love. Reply thumbs up to schedule.",
    className: 'bottom-[7%] left-[5vw] w-[19rem]',
  },
  {
    accent: '#2fcf7f',
    label: 'New Single',
    text: 'New ISRC code detected on Spotify. Notifying 4,379 fans right now.',
    className: 'right-[7vw] top-[30%] w-[18rem]',
  },
  {
    accent: '#2f80d8',
    label: 'Video Hold',
    text: 'Your 9:00 AM slot is open. I drafted the teaser, caption, and smart-link update.',
    className: 'right-[13vw] bottom-[7%] w-[17rem]',
  },
  {
    accent: '#c04494',
    label: 'Tour Recap',
    text: 'Top listeners from the last drop are ready for a private preview before Friday.',
    className: 'bottom-[3%] left-[22vw] w-[17rem]',
  },
] as const;

function getScrollActiveCount(progress: number, totalFridays: number): number {
  if (progress <= SCROLL_START) return INITIAL_ACTIVE_FRIDAYS;
  if (progress >= SCROLL_END) return totalFridays;

  const normalized = (progress - SCROLL_START) / (SCROLL_END - SCROLL_START);

  return Math.round(
    INITIAL_ACTIVE_FRIDAYS +
      normalized * (totalFridays - INITIAL_ACTIVE_FRIDAYS)
  );
}

function formatSvgNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function getHeartbeatBaseline(x: number, progress: number): number {
  const normalizedX = x / HEARTBEAT_WIDTH;

  return 14 - progress * 1.4 - progress * 6.8 * normalizedX ** 2.25;
}

function buildHeartbeatPath(
  data: ReturnType<typeof generateFridayRhythmData>,
  totalFridays: number
): string {
  const activeCount = data.filter(day => day.count > 0).length;
  const progress = totalFridays > 0 ? activeCount / totalFridays : 0;
  const spikeCount = Math.min(
    totalFridays,
    progress >= 0.86
      ? 52
      : progress >= 0.68
        ? 26
        : progress >= 0.46
          ? 13
          : progress >= 0.24
            ? 7
            : 3
  );

  if (spikeCount === 0) {
    return `M 2 ${formatSvgNumber(getHeartbeatBaseline(2, 0))} L 98 ${formatSvgNumber(
      getHeartbeatBaseline(98, 0)
    )}`;
  }

  const pathCommands = [
    `M 2 ${formatSvgNumber(getHeartbeatBaseline(2, progress))}`,
  ];

  Array.from({ length: spikeCount }, (_, index) => index).forEach(index => {
    const rankProgress = spikeCount > 1 ? index / (spikeCount - 1) : 0;
    const x = 4 + rankProgress * 92;
    const baseline = getHeartbeatBaseline(x, progress);
    const amplitude = 1.7 + progress * 3.6 * rankProgress;

    pathCommands.push(
      `L ${formatSvgNumber(x - 0.72)} ${formatSvgNumber(baseline)}`,
      `L ${formatSvgNumber(x - 0.18)} ${formatSvgNumber(baseline)}`,
      `L ${formatSvgNumber(x)} ${formatSvgNumber(baseline - amplitude)}`,
      `L ${formatSvgNumber(x + 0.36)} ${formatSvgNumber(baseline + 1.35)}`,
      `L ${formatSvgNumber(x + 0.92)} ${formatSvgNumber(baseline)}`
    );
  });

  pathCommands.push(
    `L 98 ${formatSvgNumber(getHeartbeatBaseline(98, progress))}`
  );

  return pathCommands.join(' ');
}

export function FridayRhythmSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useMotionReducedMotion();
  const totalFridays = useMemo(
    () => countFridaysInYear(FRIDAY_RHYTHM_YEAR),
    []
  );
  const [desktopActiveFridays, setDesktopActiveFridays] = useState(
    INITIAL_ACTIVE_FRIDAYS
  );
  const [mobileMode, setMobileMode] = useState<RhythmMode>('before');

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;

    const updateProgress = () => {
      frame = 0;

      const rect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const stickyTravel = Math.max(rect.height - viewportHeight, 1);
      const rawProgress = -rect.top / stickyTravel;
      const progress = Math.min(Math.max(rawProgress, 0), 1);
      const nextCount = prefersReducedMotion
        ? progress >= 0.5
          ? totalFridays
          : INITIAL_ACTIVE_FRIDAYS
        : getScrollActiveCount(progress, totalFridays);

      setDesktopActiveFridays(current =>
        current === nextCount ? current : nextCount
      );
    };

    const scheduleProgressUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener('scroll', scheduleProgressUpdate, {
      passive: true,
    });
    window.addEventListener('resize', scheduleProgressUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleProgressUpdate);
      window.removeEventListener('resize', scheduleProgressUpdate);
    };
  }, [prefersReducedMotion, totalFridays]);

  const mobileActiveFridays =
    mobileMode === 'after' ? totalFridays : INITIAL_ACTIVE_FRIDAYS;
  const desktopData = useMemo(
    () => generateFridayRhythmData(FRIDAY_RHYTHM_YEAR, desktopActiveFridays),
    [desktopActiveFridays]
  );
  const mobileData = useMemo(
    () => generateFridayRhythmData(FRIDAY_RHYTHM_YEAR, mobileActiveFridays),
    [mobileActiveFridays]
  );

  return (
    <section
      ref={sectionRef}
      aria-label='Make every Friday count.'
      className='relative isolate bg-[#020303]'
      data-testid='friday-rhythm-section'
    >
      <RhythmAtmosphere
        activeFridays={desktopActiveFridays}
        reducedMotion={Boolean(prefersReducedMotion)}
        totalFridays={totalFridays}
      />
      <div className='hidden min-h-[160svh] md:block'>
        <div className='sticky top-[4.5rem] z-10 flex min-h-[calc(100svh-4.5rem)] items-center py-16'>
          <FridayRhythmContent
            activeFridays={desktopActiveFridays}
            data={desktopData}
            mode='desktop'
            reducedMotion={Boolean(prefersReducedMotion)}
            totalFridays={totalFridays}
          />
        </div>
      </div>

      <div className='relative z-10 md:hidden'>
        <FridayRhythmContent
          activeFridays={mobileActiveFridays}
          data={mobileData}
          mode='mobile'
          mobileMode={mobileMode}
          onMobileModeChange={setMobileMode}
          reducedMotion={Boolean(prefersReducedMotion)}
          totalFridays={totalFridays}
        />
      </div>
    </section>
  );
}

function FridayRhythmContent({
  activeFridays,
  data,
  mode,
  mobileMode,
  onMobileModeChange,
  reducedMotion,
  totalFridays,
}: Readonly<{
  activeFridays: number;
  data: ReturnType<typeof generateFridayRhythmData>;
  mode: 'desktop' | 'mobile';
  mobileMode?: RhythmMode;
  onMobileModeChange?: (mode: RhythmMode) => void;
  reducedMotion: boolean;
  totalFridays: number;
}>) {
  const graphSummary = `Jovie rhythm model showing ${activeFridays} of ${totalFridays} Fridays active`;

  return (
    <div className='mx-auto w-full max-w-[var(--homepage-section-max)] px-[var(--homepage-page-gutter)] py-20 sm:py-24 md:py-0'>
      <div className='max-w-[45rem] text-left'>
        <h2 className='text-[clamp(2.55rem,5.8vw,5rem)] font-semibold leading-[0.92] text-white'>
          <span className='block'>Make Every Friday</span>
          <span className='block'>Count.</span>
        </h2>
        <p className='mt-5 max-w-[34rem] text-[15px] leading-[1.65] text-white/58 sm:text-[17px]'>
          Jovie turns open Fridays into a planned release rhythm people come
          back to.
        </p>
      </div>

      {mode === 'mobile' ? (
        <div className='mt-9 flex w-fit rounded-full border border-white/10 bg-white/[0.035] p-1'>
          <RhythmModeButton
            active={mobileMode === 'before'}
            label='Before Jovie'
            onClick={() => onMobileModeChange?.('before')}
          />
          <RhythmModeButton
            active={mobileMode === 'after'}
            label='With Jovie'
            onClick={() => onMobileModeChange?.('after')}
          />
        </div>
      ) : null}

      <motion.div
        animate={{
          opacity: 1,
          y: 0,
        }}
        className='mx-auto mt-12 max-w-[61rem] md:mt-16'
        initial={false}
        transition={{
          duration: reducedMotion ? 0 : 0.4,
          ease: 'easeOut',
        }}
      >
        <div className='relative'>
          <RhythmHeartbeatLine
            data={data}
            reducedMotion={reducedMotion}
            totalFridays={totalFridays}
          />
          <ContributionGraph
            ariaLabel={graphSummary}
            className='relative z-10'
            data={data}
            reducedMotion={reducedMotion}
            showLegend={false}
            showTooltips={false}
            year={FRIDAY_RHYTHM_YEAR}
          />
          <RhythmReleaseKey />
        </div>
      </motion.div>

      <div className='mx-auto mt-10 flex flex-col items-center gap-5 text-center'>
        <p
          aria-live={mode === 'mobile' ? 'polite' : 'off'}
          className='text-[15px] leading-6 text-white/56'
        >
          <span className='font-medium text-white'>
            {activeFridays} Fridays.
          </span>{' '}
          Singles, merch, remixes, videos, and recaps.
        </p>
        <Link
          className='public-action-secondary focus-ring-themed'
          href={APP_ROUTES.SIGNUP}
        >
          Build Your Weekly Rhythm
        </Link>
      </div>
    </div>
  );
}

function RhythmReleaseKey() {
  return (
    <ul
      aria-label='Friday release mix'
      className='relative z-10 mx-auto mt-5 flex max-w-[44rem] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] leading-none text-white/38'
    >
      {FRIDAY_RELEASE_KINDS.map(kind => (
        <li key={kind.key} className='flex items-center gap-1.5'>
          <span
            aria-hidden='true'
            className='h-2 w-2 rounded-[2px]'
            style={{
              backgroundColor: kind.accentColor,
              opacity: kind.muted ? 0.68 : 1,
            }}
          />
          <span>{kind.label}</span>
        </li>
      ))}
    </ul>
  );
}

function RhythmAtmosphere({
  activeFridays,
  reducedMotion,
  totalFridays,
}: Readonly<{
  activeFridays: number;
  reducedMotion: boolean;
  totalFridays: number;
}>) {
  const progress = totalFridays > 0 ? activeFridays / totalFridays : 0;

  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 z-0 overflow-hidden'
    >
      <div className='absolute inset-y-0 left-1/2 w-[150vw] -translate-x-1/2 bg-[radial-gradient(circle_at_50%_42%,rgba(94,106,210,0.13),transparent_32%),linear-gradient(90deg,transparent,rgba(94,106,210,0.11)_18%,rgba(94,106,210,0.045)_50%,rgba(94,106,210,0.11)_82%,transparent)] opacity-80 blur-3xl' />
      <div className='absolute left-1/2 top-[52%] h-px w-[160vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-[var(--linear-accent,#5e6ad2)]/28 to-transparent opacity-75 blur-[0.5px]' />
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_15%_58%,rgba(139,92,246,0.08),transparent_16%),radial-gradient(circle_at_86%_32%,rgba(20,184,166,0.07),transparent_18%),linear-gradient(180deg,transparent,rgba(0,0,0,0.45)_76%)]' />
      {Array.from({ length: 34 }, (_, index) => {
        const x = (index * 29) % 100;
        const y = 18 + ((index * 17) % 64);
        const opacity = 0.06 + (index % 5) * 0.018;

        return (
          <span
            key={`rhythm-star-${x}-${y}`}
            className='absolute h-1 w-1 rounded-full bg-white'
            style={{
              left: `${x}%`,
              top: `${y}%`,
              opacity,
            }}
          />
        );
      })}
      <div className='hidden md:block'>
        {RHYTHM_ACTION_CARDS.map((card, index) => {
          const threshold = index * 0.15;
          const cardProgress = Math.min(
            Math.max((progress - threshold) / 0.46, 0),
            1
          );
          const baseOpacity = index < 2 ? 0.24 : 0.1;
          const opacity =
            baseOpacity + cardProgress * (index < 2 ? 0.52 : 0.58);
          const translateY = 56 - cardProgress * 56;
          const scale = 0.86 + cardProgress * 0.14;

          return (
            <motion.div
              key={card.label}
              animate={{
                opacity,
                scale,
                y: reducedMotion ? 0 : translateY,
              }}
              className={cn(
                'absolute rounded-lg border border-white/[0.09] bg-black/34 p-4 text-left shadow-[0_24px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl',
                card.className
              )}
              initial={false}
              style={
                {
                  '--rhythm-card-accent': card.accent,
                } as CSSProperties
              }
              transition={{
                duration: reducedMotion ? 0 : 0.42,
                ease: 'easeOut',
              }}
            >
              <div className='mb-3 h-px w-16 bg-[var(--rhythm-card-accent)] opacity-70 shadow-[0_0_22px_var(--rhythm-card-accent)]' />
              <p className='text-[11px] font-medium leading-none text-white/46'>
                {card.label}
              </p>
              <p className='mt-2 text-[13px] leading-5 text-white/80'>
                {card.text}
              </p>
              <div className='mt-4 space-y-2'>
                <span className='block h-1.5 w-full rounded-full bg-white/[0.07]' />
                <span className='block h-1.5 w-3/4 rounded-full bg-white/[0.045]' />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function RhythmHeartbeatLine({
  data,
  reducedMotion,
  totalFridays,
}: Readonly<{
  data: ReturnType<typeof generateFridayRhythmData>;
  reducedMotion: boolean;
  totalFridays: number;
}>) {
  const heartbeatPath = useMemo(
    () => buildHeartbeatPath(data, totalFridays),
    [data, totalFridays]
  );

  return (
    <svg
      aria-hidden='true'
      className='pointer-events-none absolute inset-x-8 top-8 z-0 h-[calc(100%-3.25rem)] w-[calc(100%-4rem)] overflow-visible text-[var(--linear-accent,#5e6ad2)]'
      focusable='false'
      preserveAspectRatio='none'
      viewBox={`0 0 ${HEARTBEAT_WIDTH} ${HEARTBEAT_HEIGHT}`}
    >
      <motion.path
        animate={{ d: heartbeatPath }}
        d={heartbeatPath}
        fill='none'
        initial={false}
        stroke='currentColor'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeOpacity='0.025'
        strokeWidth='2'
        transition={{
          duration: reducedMotion ? 0 : 0.45,
          ease: 'easeOut',
        }}
      />
      <motion.path
        animate={{ d: heartbeatPath }}
        d={heartbeatPath}
        fill='none'
        initial={false}
        stroke='currentColor'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeOpacity='0.07'
        strokeWidth='0.46'
        transition={{
          duration: reducedMotion ? 0 : 0.45,
          ease: 'easeOut',
        }}
      />
    </svg>
  );
}

function RhythmModeButton({
  active,
  label,
  onClick,
}: Readonly<{
  active: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'rounded-full px-4 py-2 text-[12px] font-medium transition-colors duration-150',
        active ? 'bg-white text-black' : 'text-white/58 hover:text-white'
      )}
      onClick={onClick}
      type='button'
    >
      {label}
    </button>
  );
}
