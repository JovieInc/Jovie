'use client';

import { Bell } from 'lucide-react';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { Avatar } from '@/components/molecules/Avatar';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  MODE_IDS,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

/* ------------------------------------------------------------------ */
/*  Mode data                                                          */
/* ------------------------------------------------------------------ */

interface ModeData {
  id: (typeof MODE_IDS)[number];
  headline: string;
  description: string;
  outcome: string;
}

const MODES: ModeData[] = [
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
/*  Crossfade helper                                                   */
/* ------------------------------------------------------------------ */

function CrossfadeBlock({
  activeIndex,
  children,
}: {
  readonly activeIndex: number;
  readonly children: React.ReactNode[];
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
/*  Sticky phone (reused from DeeplinksGrid pattern)                   */
/* ------------------------------------------------------------------ */

function StickyPhone({ activeIndex }: { readonly activeIndex: number }) {
  return (
    <PhoneFrame>
      <div className='flex items-center justify-end px-4 pt-10 pb-1'>
        <CircleIconButton size='xs' variant='ghost' ariaLabel='Notifications'>
          <Bell className='h-4 w-4' />
        </CircleIconButton>
      </div>

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
          <p className='mt-0.5 text-xs text-tertiary-token tracking-[0.2em] uppercase'>
            Artist
          </p>
        </div>
      </div>

      {/* Dot indicators with keyboard nav */}
      <div
        className='flex items-center justify-center gap-1.5 py-2.5'
        role='tablist'
        aria-label='Profile modes'
      >
        {MODES.map((mode, i) => (
          <div
            key={mode.id}
            role='tab'
            aria-selected={i === activeIndex}
            aria-label={mode.outcome}
            tabIndex={i === activeIndex ? 0 : -1}
            className='rounded-full transition-all duration-[var(--linear-duration-slow)] ease-[var(--linear-ease)]'
            style={{
              width: i === activeIndex ? 16 : 6,
              height: 6,
              backgroundColor:
                i === activeIndex
                  ? 'var(--linear-text-primary)'
                  : 'var(--linear-border-default)',
            }}
          />
        ))}
      </div>

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

      <div className='pb-3 pt-1 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-quaternary-token'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile card                                                        */
/* ------------------------------------------------------------------ */

function MobileCard({ mode }: { readonly mode: ModeData }) {
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

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function StickyPhoneTour() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const newIndex = scrollToActiveIndex(
      rect.top,
      rect.height,
      globalThis.innerHeight,
      MODES.length
    );
    setActiveIndex(newIndex);
  }, []);

  useEffect(() => {
    globalThis.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => globalThis.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const headlines = useMemo(
    () =>
      MODES.map(mode => (
        <h3
          key={mode.id}
          className='text-xl font-[590] leading-snug tracking-[-0.012em] text-secondary-token'
        >
          {mode.headline}
        </h3>
      )),
    []
  );

  const descriptions = useMemo(
    () =>
      MODES.map(mode => (
        <p
          key={mode.id}
          className='max-w-[400px] marketing-lead-linear text-secondary-token'
        >
          {mode.description}
        </p>
      )),
    []
  );

  return (
    <>
      {/* Desktop: sticky scroll */}
      <section
        ref={sectionRef}
        className='relative hidden lg:block'
        style={{
          height: `${MODES.length * 75}vh`,
          /* No overflow:hidden — stacking context would break logo bar wipe */
        }}
      >
        <div className='sticky top-0 z-10 flex h-dvh items-center justify-center'>
          <Container size='homepage'>
            <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
              <div className='grid items-center grid-cols-[1fr_auto_1fr] gap-8 xl:gap-16'>
                {/* Left: text panels */}
                <div className='flex flex-col gap-6'>
                  <span className='inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token border border-subtle'>
                    One profile. Every way fans support you.
                  </span>

                  <h2 className='marketing-h2-linear text-primary-token'>
                    The right action for every fan.
                  </h2>

                  <CrossfadeBlock activeIndex={activeIndex}>
                    {headlines}
                  </CrossfadeBlock>

                  <CrossfadeBlock activeIndex={activeIndex}>
                    {descriptions}
                  </CrossfadeBlock>

                  {/* Outcome pills */}
                  <div className='flex flex-wrap gap-2'>
                    {MODES.map((mode, i) => (
                      <span
                        key={mode.id}
                        className='rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-300'
                        style={{
                          borderColor:
                            i === activeIndex
                              ? 'var(--linear-border-strong)'
                              : 'var(--linear-border-subtle)',
                          backgroundColor:
                            i === activeIndex
                              ? 'var(--linear-bg-hover)'
                              : 'transparent',
                          color:
                            i === activeIndex
                              ? 'var(--linear-text-secondary)'
                              : 'var(--linear-text-tertiary)',
                        }}
                      >
                        {mode.outcome}
                      </span>
                    ))}
                  </div>

                  {/* Progress dots */}
                  <div className='flex gap-2'>
                    {MODES.map((mode, i) => (
                      <div
                        key={mode.id}
                        className='h-1 rounded-full'
                        style={{
                          width: i === activeIndex ? 32 : 8,
                          backgroundColor:
                            i === activeIndex
                              ? 'var(--linear-text-primary)'
                              : 'var(--linear-border-default)',
                          transition: `width 0.3s var(--linear-ease), background-color 0.3s var(--linear-ease)`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Center: phone */}
                <div className='flex flex-col items-center gap-4'>
                  <StickyPhone activeIndex={activeIndex} />
                </div>

                {/* Right: mode URLs */}
                <div className='flex flex-col items-end justify-center gap-4'>
                  {MODES.map((mode, i) => {
                    const slug = mode.id === 'profile' ? '' : `/${mode.id}`;
                    return (
                      <div
                        key={mode.id}
                        className='text-right transition-all duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
                        style={{
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
                                : 'var(--linear-text-secondary)',
                            transition:
                              'font-size 0.5s cubic-bezier(0.33,.01,.27,1), font-weight 0.5s cubic-bezier(0.33,.01,.27,1), color 0.5s cubic-bezier(0.33,.01,.27,1)',
                          }}
                        >
                          <span
                            className='mr-2 text-xs uppercase tracking-[0.12em]'
                            style={{
                              color:
                                i === activeIndex
                                  ? 'var(--linear-text-secondary)'
                                  : 'var(--linear-text-tertiary)',
                            }}
                          >
                            {mode.outcome}
                          </span>
                          jov.ie/tim
                          {slug && (
                            <span
                              style={{
                                color:
                                  i === activeIndex
                                    ? 'var(--linear-text-secondary)'
                                    : 'var(--linear-text-tertiary)',
                              }}
                            >
                              {slug}
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Container>
        </div>
      </section>

      {/* Mobile: card grid */}
      <section className='lg:hidden section-spacing-linear'>
        <Container size='homepage'>
          <div
            aria-hidden='true'
            className='mb-16 h-px max-w-lg mx-auto'
            style={{
              background:
                'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
            }}
          />

          <div className='mx-auto max-w-[var(--linear-content-max)]'>
            <div className='flex flex-col items-center text-center gap-6 mb-12'>
              <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token border border-subtle'>
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
        </Container>
      </section>
    </>
  );
}
