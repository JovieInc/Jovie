'use client';

import { Bell, Shirt, Sparkles, Video } from 'lucide-react';
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
    Icon: Shirt,
    label: 'Merch Drop',
    text: 'Friday is open. Three merch designs are ready to schedule.',
    className: 'bottom-[14%] left-[7vw] w-[15.5rem]',
  },
  {
    accent: '#2fcf7f',
    Icon: Bell,
    label: 'New Single',
    text: 'New ISRC detected. Notifying 4,379 fans right now.',
    className: 'right-[9vw] top-[27%] w-[15rem]',
  },
  {
    accent: '#2f80d8',
    Icon: Video,
    label: 'Video Hold',
    text: 'The 9:00 AM slot is open. Teaser and caption are drafted.',
    className: 'right-[15vw] bottom-[14%] w-[15.25rem]',
  },
  {
    accent: '#c04494',
    Icon: Sparkles,
    label: 'Tour Recap',
    text: 'Top listeners are ready for a private preview before Friday.',
    className: 'bottom-[5%] left-[25vw] w-[15rem]',
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
  const fixed = value.toFixed(2);
  const [integerPart, fractionPart] = fixed.split('.');
  let trimmedFraction = fractionPart ?? '';

  while (trimmedFraction.endsWith('0')) {
    trimmedFraction = trimmedFraction.slice(0, -1);
  }

  return trimmedFraction ? `${integerPart}.${trimmedFraction}` : integerPart;
}

function getHeartbeatBaseline(x: number, progress: number): number {
  const normalizedX = x / HEARTBEAT_WIDTH;

  return 14 - progress * 1.4 - progress * 6.8 * normalizedX ** 2.25;
}

function getHeartbeatSpikeCount(
  progress: number,
  totalFridays: number
): number {
  let spikeCount = 3;

  if (progress >= 0.86) {
    spikeCount = 52;
  } else if (progress >= 0.68) {
    spikeCount = 26;
  } else if (progress >= 0.46) {
    spikeCount = 13;
  } else if (progress >= 0.24) {
    spikeCount = 7;
  }

  return Math.min(totalFridays, spikeCount);
}

function getDesktopActiveFridayCount({
  prefersReducedMotion,
  progress,
  totalFridays,
}: Readonly<{
  prefersReducedMotion: boolean | null;
  progress: number;
  totalFridays: number;
}>): number {
  if (!prefersReducedMotion) {
    return getScrollActiveCount(progress, totalFridays);
  }

  return progress >= 0.5 ? totalFridays : INITIAL_ACTIVE_FRIDAYS;
}

function buildHeartbeatPath(
  data: ReturnType<typeof generateFridayRhythmData>,
  totalFridays: number
): string {
  const activeCount = data.filter(day => day.count > 0).length;
  const progress = totalFridays > 0 ? activeCount / totalFridays : 0;
  const spikeCount = getHeartbeatSpikeCount(progress, totalFridays);

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
      const viewportHeight = globalThis.innerHeight || 1;
      const stickyTravel = Math.max(rect.height - viewportHeight, 1);
      const rawProgress = -rect.top / stickyTravel;
      const progress = Math.min(Math.max(rawProgress, 0), 1);
      const nextCount = getDesktopActiveFridayCount({
        prefersReducedMotion,
        progress,
        totalFridays,
      });

      setDesktopActiveFridays(current =>
        current === nextCount ? current : nextCount
      );
    };

    const scheduleProgressUpdate = () => {
      if (frame) return;
      frame = globalThis.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    globalThis.addEventListener('scroll', scheduleProgressUpdate, {
      passive: true,
    });
    globalThis.addEventListener('resize', scheduleProgressUpdate);

    return () => {
      if (frame) globalThis.cancelAnimationFrame(frame);
      globalThis.removeEventListener('scroll', scheduleProgressUpdate);
      globalThis.removeEventListener('resize', scheduleProgressUpdate);
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
        <h2 className='text-[clamp(2.5rem,5.3vw,4.75rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-white'>
          <span className='block'>Make Every Friday</span>
          <span className='block'>Count.</span>
        </h2>
        <p className='mt-5 max-w-[34rem] text-[15px] leading-[1.65] tracking-[-0.005em] text-white/56 sm:text-[16px]'>
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
        className='mx-auto mt-12 max-w-[60rem] md:mt-16'
        initial={false}
        transition={{
          duration: reducedMotion ? 0 : 0.4,
          ease: 'easeOut',
        }}
      >
        <div className='relative'>
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
  const heartbeatData = useMemo(
    () => generateFridayRhythmData(FRIDAY_RHYTHM_YEAR, activeFridays),
    [activeFridays]
  );

  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 z-0 overflow-hidden'
    >
      <div className='absolute inset-y-0 left-1/2 w-[165vw] -translate-x-1/2 bg-[radial-gradient(circle_at_50%_42%,rgba(94,106,210,0.09),transparent_32%),linear-gradient(90deg,transparent,rgba(94,106,210,0.075)_20%,rgba(94,106,210,0.028)_50%,rgba(94,106,210,0.075)_80%,transparent)] opacity-80 blur-3xl' />
      <RhythmHeartbeatLine
        data={heartbeatData}
        reducedMotion={reducedMotion}
        totalFridays={totalFridays}
        variant='section'
      />
      <div className='absolute left-1/2 top-[52%] h-px w-[168vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-[var(--linear-accent,#5e6ad2)]/18 to-transparent opacity-70 blur-[0.5px]' />
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_15%_58%,rgba(139,92,246,0.045),transparent_16%),radial-gradient(circle_at_86%_32%,rgba(20,184,166,0.04),transparent_18%),linear-gradient(180deg,transparent,rgba(0,0,0,0.48)_76%)]' />
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
          const Icon = card.Icon;
          const threshold = index * 0.15;
          const cardProgress = Math.min(
            Math.max((progress - threshold) / 0.46, 0),
            1
          );
          const baseOpacity = index < 2 ? 0.2 : 0.08;
          const opacity = baseOpacity + cardProgress * (index < 2 ? 0.46 : 0.5);
          const translateY = 36 - cardProgress * 36;
          const scale = 0.94 + cardProgress * 0.06;

          return (
            <motion.div
              key={card.label}
              animate={{
                opacity,
                scale,
                y: reducedMotion ? 0 : translateY,
              }}
              className={cn(
                'absolute rounded-md border border-white/[0.08] bg-[#06070a]/46 p-3 text-left shadow-[0_18px_64px_rgba(0,0,0,0.44)] backdrop-blur-xl',
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
              <div className='flex items-start gap-2.5'>
                <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.08] bg-white/[0.045] text-[var(--rhythm-card-accent)] shadow-[0_0_24px_rgba(94,106,210,0.16)]'>
                  <Icon aria-hidden='true' className='h-3.5 w-3.5' />
                </span>
                <p className='min-w-0 text-[12px] leading-[1.45] tracking-[-0.005em] text-white/78'>
                  {card.text}
                </p>
              </div>
              <div className='mt-3 space-y-1.5 pl-[2.375rem]'>
                <span className='block h-1 w-full rounded-full bg-white/[0.07]' />
                <span className='block h-1 w-2/3 rounded-full bg-white/[0.045]' />
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
  variant = 'graph',
}: Readonly<{
  data: ReturnType<typeof generateFridayRhythmData>;
  reducedMotion: boolean;
  totalFridays: number;
  variant?: 'graph' | 'section';
}>) {
  const heartbeatPath = useMemo(
    () => buildHeartbeatPath(data, totalFridays),
    [data, totalFridays]
  );

  return (
    <svg
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute z-0 overflow-visible text-[var(--linear-accent,#5e6ad2)]',
        variant === 'section'
          ? 'left-1/2 top-[38%] h-[22rem] w-[190vw] -translate-x-1/2 opacity-45 [mask-image:linear-gradient(90deg,transparent,black_16%,black_84%,transparent)]'
          : 'inset-x-8 top-8 h-[calc(100%-3.25rem)] w-[calc(100%-4rem)]'
      )}
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
        strokeOpacity={variant === 'section' ? '0.018' : '0.025'}
        strokeWidth={variant === 'section' ? '2.6' : '2'}
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
        strokeOpacity={variant === 'section' ? '0.052' : '0.07'}
        strokeWidth={variant === 'section' ? '0.62' : '0.46'}
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
