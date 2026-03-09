'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { Avatar } from '@/components/molecules/Avatar';
import { Container } from '@/components/site/Container';
import { SectionLabel } from './marketing-atoms';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

/* ------------------------------------------------------------------ */
/*  Mode data                                                          */
/* ------------------------------------------------------------------ */

interface ModeData {
  id: string;
  headline: string;
  description: string;
  stat: { value: string; label: string };
  slug: string;
}

const MODES: ModeData[] = [
  {
    id: 'profile',
    headline: 'Make every tap feel intentional.',
    description:
      'First-time visitors can join your list. Returning fans see the action they are most likely to take next. The profile adapts instead of making everyone hunt.',
    stat: { value: '342', label: 'new fan contacts this month' },
    slug: '',
  },
  {
    id: 'tour',
    headline: 'Put the nearest show first.',
    description:
      'A fan in Los Angeles should not scroll through 30 cities. Jovie can surface the closest date and ticket button first.',
    stat: { value: '847', label: 'ticket clicks this month' },
    slug: 'tour',
  },
  {
    id: 'tip',
    headline: 'Turn the merch table into revenue.',
    description:
      'When someone scans your QR code after a set, Jovie can open the fastest tip flow available instead of another menu of links.',
    stat: { value: '$1,204', label: 'in tips this month' },
    slug: 'tip',
  },
  {
    id: 'listen',
    headline: 'Open the right streaming app.',
    description:
      'A new listener taps once. Jovie can route them to Spotify, Apple Music, or YouTube Music without making them choose from a grid first.',
    stat: { value: '3,421', label: 'platform clicks this month' },
    slug: 'listen',
  },
];

/* Mock artist and phone content imported from phone-mode-content.tsx */

/* ------------------------------------------------------------------ */
/*  Scroll-driven phone (desktop only)                                 */
/* ------------------------------------------------------------------ */

function StickyPhone({ activeIndex }: { readonly activeIndex: number }) {
  return (
    <PhoneFrame>
      {/* Nav bar */}
      <div className='flex items-center justify-end px-4 pt-10 pb-1'>
        <CircleIconButton size='xs' variant='ghost' ariaLabel='Notifications'>
          <Bell className='h-4 w-4' />
        </CircleIconButton>
      </div>

      {/* Artist identity */}
      <div className='flex flex-col items-center px-5 pb-2'>
        <div className='rounded-full p-[2px] ring-1 ring-white/6 shadow-sm'>
          <Avatar
            src={MOCK_ARTIST.image}
            alt={MOCK_ARTIST.name}
            name={MOCK_ARTIST.name}
            size='display-md'
            verified={false}
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
          <p className='mt-0.5 text-[11px] text-[var(--linear-text-tertiary)] tracking-[0.2em] uppercase'>
            Artist
          </p>
        </div>
      </div>

      {/* Mode dots */}
      <div className='flex items-center justify-center gap-1.5 py-2.5'>
        {MODES.map((mode, i) => (
          <div
            key={mode.id}
            className='rounded-full transition-all duration-[var(--linear-duration-slow)] ease-[var(--linear-ease)]'
            style={{
              width: i === activeIndex ? 16 : 6,
              height: 6,
              backgroundColor:
                i === activeIndex
                  ? 'rgb(247,248,248)'
                  : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </div>

      {/* Content — crossfade between modes */}
      <div
        className='relative overflow-hidden'
        style={{ height: PHONE_CONTENT_HEIGHT }}
      >
        {MODES.map((mode, i) => (
          <div
            key={mode.id}
            className='absolute inset-0 px-5 transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
            style={{
              opacity: i === activeIndex ? 1 : 0,
              pointerEvents: i === activeIndex ? 'auto' : 'none',
            }}
          >
            {MODE_CONTENT[mode.id]}
          </div>
        ))}
      </div>

      {/* Branding */}
      <div className='pb-3 pt-1 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-[var(--linear-text-quaternary)]'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Crossfade text block — sizes to tallest child                      */
/* ------------------------------------------------------------------ */

function CrossfadeBlock({
  activeIndex,
  children,
}: {
  readonly activeIndex: number;
  readonly children: React.ReactNode[];
}) {
  return (
    <div className='grid'>
      {children.map((child, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static array, order never changes
          key={i}
          aria-hidden={i !== activeIndex}
          className='transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
          style={{
            opacity: i === activeIndex ? 1 : 0,
            gridArea: '1 / 1',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile card — static mode card for non-scroll-hijack layout        */
/* ------------------------------------------------------------------ */

function MobileCard({ mode }: { readonly mode: ModeData }) {
  return (
    <div
      className='rounded-xl px-6 py-6'
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h3 className='text-lg font-semibold tracking-tight text-[var(--linear-text-primary)]'>
        {mode.headline}
      </h3>
      <p className='mt-2 text-[14px] leading-[1.6] text-[var(--linear-text-secondary)]'>
        {mode.description}
      </p>
      <div className='mt-4 flex items-baseline justify-between'>
        <div>
          <span className='text-xl font-semibold text-[var(--linear-text-primary)] tabular-nums tracking-tight'>
            {mode.stat.value}
          </span>
          <span className='ml-2 text-[12px] text-[var(--linear-text-tertiary)]'>
            {mode.stat.label}
          </span>
        </div>
        <span className='font-mono text-[12px] text-[var(--linear-text-tertiary)]'>
          /tim{mode.slug ? `/${mode.slug}` : ''}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function DeeplinksGrid() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const sectionHeight = rect.height;
    const scrolled = -rect.top;
    const scrollableHeight = sectionHeight - globalThis.innerHeight;

    if (scrollableHeight <= 0) return;

    const progress = Math.max(0, Math.min(1, scrolled / scrollableHeight));
    const newIndex = Math.min(
      MODES.length - 1,
      Math.floor(progress * MODES.length)
    );

    setActiveIndex(newIndex);
  }, []);

  useEffect(() => {
    globalThis.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => globalThis.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Pre-build crossfade children so they're stable across renders
  const headlines = useMemo(
    () =>
      MODES.map(mode => (
        <h2
          key={mode.id}
          className='marketing-h2-linear text-[var(--linear-text-primary)]'
        >
          {mode.headline}
        </h2>
      )),
    []
  );

  const descriptions = useMemo(
    () =>
      MODES.map(mode => (
        <p
          key={mode.id}
          className='max-w-[400px] marketing-lead-linear text-[var(--linear-text-secondary)]'
        >
          {mode.description}
        </p>
      )),
    []
  );

  return (
    <>
      {/* Desktop — scroll-hijack layout (lg+) */}
      <section
        ref={sectionRef}
        className='relative hidden lg:block bg-[var(--linear-bg-page)]'
        style={{ height: `${MODES.length * 75}vh` }}
      >
        <div className='sticky top-0 flex h-dvh items-center justify-center overflow-hidden'>
          {/* Ambient glow */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
            style={{
              width: '600px',
              height: '600px',
              borderRadius: '50%',
              background:
                'radial-gradient(ellipse at center, oklch(18% 0.015 260 / 0.15), transparent 60%)',
            }}
          />

          <Container size='homepage'>
            {/* Gradient separator */}
            <div
              aria-hidden='true'
              className='absolute top-0 left-1/2 -translate-x-1/2 h-px w-full max-w-lg'
              style={{
                background:
                  'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
              }}
            />

            <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
              <div className='grid items-center grid-cols-[1fr_auto_1fr] gap-8 xl:gap-16'>
                {/* Left — copy */}
                <div className='flex flex-col gap-6'>
                  {/* Section label */}
                  <span className='self-start'>
                    <SectionLabel>Adaptive fan paths</SectionLabel>
                  </span>

                  {/* Dynamic headline */}
                  <CrossfadeBlock activeIndex={activeIndex}>
                    {headlines}
                  </CrossfadeBlock>

                  {/* Dynamic description */}
                  <CrossfadeBlock activeIndex={activeIndex}>
                    {descriptions}
                  </CrossfadeBlock>

                  {/* Dynamic stat */}
                  <div
                    className='rounded-xl px-5 py-4 self-start'
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className='grid'>
                      {MODES.map((mode, i) => (
                        <div
                          key={mode.id}
                          className='transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
                          style={{
                            opacity: i === activeIndex ? 1 : 0,
                            gridArea: '1 / 1',
                          }}
                        >
                          <span className='text-2xl font-semibold text-[var(--linear-text-primary)] tabular-nums tracking-tight'>
                            {mode.stat.value}
                          </span>
                          <p className='mt-1 text-[12px] text-[var(--linear-text-tertiary)]'>
                            {mode.stat.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress dots */}
                  <div className='flex gap-2'>
                    {MODES.map((mode, i) => (
                      <div
                        key={mode.id}
                        className='h-1 rounded-full transition-all duration-[var(--linear-duration-slow)] ease-[var(--linear-ease)]'
                        style={{
                          width: i === activeIndex ? 32 : 8,
                          backgroundColor:
                            i === activeIndex
                              ? 'var(--linear-text-primary)'
                              : 'rgba(255,255,255,0.15)',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Center — phone */}
                <div className='flex flex-col items-center gap-4'>
                  <StickyPhone activeIndex={activeIndex} />
                  <a
                    href='https://jov.ie/tim'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors duration-[var(--linear-duration-normal)]'
                    style={{
                      color: 'var(--linear-text-tertiary)',
                      border: '1px solid var(--linear-border-subtle)',
                      backgroundColor: 'transparent',
                    }}
                  >
                    View a Real Page
                    <svg
                      width='14'
                      height='14'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      aria-hidden='true'
                    >
                      <path d='M5 12h14' />
                      <path d='m12 5 7 7-7 7' />
                    </svg>
                  </a>
                </div>

                {/* Right — URL slugs, bold */}
                <div className='flex flex-col items-end justify-center gap-4'>
                  {MODES.map((mode, i) => (
                    <div
                      key={mode.id}
                      className='text-right transition-all duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
                      style={{
                        opacity: i === activeIndex ? 1 : 0.2,
                        transform:
                          i === activeIndex
                            ? 'translateX(0)'
                            : 'translateX(8px)',
                      }}
                    >
                      <p
                        className='font-mono tracking-[-0.02em]'
                        style={{
                          fontSize: i === activeIndex ? '20px' : '15px',
                          fontWeight: i === activeIndex ? 600 : 400,
                          color:
                            i === activeIndex
                              ? 'var(--linear-text-primary)'
                              : 'var(--linear-text-tertiary)',
                          transition:
                            'font-size 0.5s cubic-bezier(0.33,.01,.27,1), font-weight 0.5s cubic-bezier(0.33,.01,.27,1), color 0.5s cubic-bezier(0.33,.01,.27,1)',
                        }}
                      >
                        jov.ie/tim
                        {mode.slug && (
                          <span
                            style={{
                              color:
                                i === activeIndex
                                  ? 'var(--linear-text-primary)'
                                  : 'var(--linear-text-quaternary)',
                            }}
                          >
                            /{mode.slug}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Container>
        </div>
      </section>

      {/* Mobile layout — no scroll hijacking, static cards */}
      <section className='lg:hidden section-spacing-linear bg-[var(--linear-bg-page)]'>
        <Container size='homepage'>
          {/* Gradient separator */}
          <div
            aria-hidden='true'
            className='mb-16 h-px max-w-lg mx-auto'
            style={{
              background:
                'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
            }}
          />

          <div className='mx-auto max-w-[var(--linear-content-max)]'>
            {/* Section header */}
            <div className='flex flex-col items-center text-center gap-6 mb-12'>
              <SectionLabel>AI Personalization</SectionLabel>
              <h2 className='marketing-h2-linear text-[var(--linear-text-primary)]'>
                One link. Every moment.
              </h2>
              <p className='max-w-[400px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
                Every visitor sees a personalized CTA based on the moment —
                listen, tip, tour, or follow. AI that increases conversions on
                autopilot.
              </p>
            </div>

            {/* Mode cards */}
            <div className='grid gap-4 sm:grid-cols-2'>
              {MODES.map(mode => (
                <MobileCard key={mode.id} mode={mode} />
              ))}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
