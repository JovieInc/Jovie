'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { Avatar } from '@/components/molecules/Avatar';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

interface ModeData {
  id: string;
  headline: string;
  description: string;
  slug: string;
  outcome: string;
}

const MODES: ModeData[] = [
  {
    id: 'profile',
    headline: 'Capture the fan before they disappear.',
    description:
      'First-time visitors can subscribe fast. Returning fans see the next best action instead of a generic stack of links.',
    slug: '',
    outcome: 'Grow audience',
  },
  {
    id: 'tour',
    headline: 'Show the closest show first.',
    description:
      'A fan in Los Angeles should not scroll through 30 cities. Jovie surfaces the nearest date and ticket button first.',
    slug: 'tour',
    outcome: 'Sell tickets',
  },
  {
    id: 'tip',
    headline: 'Turn in-person moments into revenue.',
    description:
      'When someone scans your QR code after a set, Jovie opens the fastest tip flow instead of another menu of links.',
    slug: 'tip',
    outcome: 'Earn tips',
  },
  {
    id: 'listen',
    headline: 'Open the right streaming app instantly.',
    description:
      'A new listener taps once. Jovie routes them to Spotify, Apple Music, or YouTube Music without the usual friction.',
    slug: 'listen',
    outcome: 'Boost streams',
  },
] as const;

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
          <p className='mt-0.5 text-[11px] text-[var(--linear-text-tertiary)] tracking-[0.2em] uppercase'>
            Artist
          </p>
        </div>
      </div>

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
        <p className='text-[9px] uppercase tracking-[0.15em] text-[var(--linear-text-quaternary)]'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

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
          key={`${i}-${activeIndex}`}
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

function MobileCard({ mode }: { readonly mode: ModeData }) {
  return (
    <div
      className='rounded-xl px-6 py-6'
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-lg font-semibold tracking-tight text-[var(--linear-text-primary)]'>
          {mode.headline}
        </h3>
        <span className='shrink-0 rounded-full border border-[var(--linear-border-subtle)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--linear-text-secondary)]'>
          {mode.outcome}
        </span>
      </div>
      <p className='mt-2 text-[14px] leading-[1.6] text-[var(--linear-text-secondary)]'>
        {mode.description}
      </p>
      <div className='mt-4 flex items-center justify-end'>
        <span className='font-mono text-[12px] text-[var(--linear-text-tertiary)]'>
          jov.ie/tim{mode.slug ? `/${mode.slug}` : ''}
        </span>
      </div>
    </div>
  );
}

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

  const headlines = useMemo(
    () =>
      MODES.map(mode => (
        <h3
          key={mode.id}
          className='text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--linear-text-primary)]'
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
          className='max-w-[400px] marketing-lead-linear text-[var(--linear-text-secondary)]'
        >
          {mode.description}
        </p>
      )),
    []
  );

  return (
    <>
      <section
        ref={sectionRef}
        className='relative hidden lg:block bg-[var(--linear-bg-page)]'
        style={{ height: `${MODES.length * 75}vh` }}
      >
        <div className='sticky top-0 flex h-dvh items-center justify-center overflow-hidden'>
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
                <div className='flex flex-col gap-6'>
                  <span className='inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)]'>
                    One profile, many conversion paths
                  </span>

                  <h2 className='marketing-h2-linear text-[var(--linear-text-primary)]'>
                    Jovie changes the CTA based on what the fan wants next.
                  </h2>

                  <CrossfadeBlock activeIndex={activeIndex}>
                    {headlines}
                  </CrossfadeBlock>

                  <CrossfadeBlock activeIndex={activeIndex}>
                    {descriptions}
                  </CrossfadeBlock>

                  <div className='flex flex-wrap gap-2'>
                    {MODES.map((mode, i) => (
                      <span
                        key={mode.id}
                        className='rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-300'
                        style={{
                          borderColor:
                            i === activeIndex
                              ? 'rgba(255,255,255,0.12)'
                              : 'var(--linear-border-subtle)',
                          backgroundColor:
                            i === activeIndex
                              ? 'rgba(255,255,255,0.08)'
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
                        <span className='mr-2 text-[11px] uppercase tracking-[0.12em] text-[var(--linear-text-quaternary)]'>
                          {mode.outcome}
                        </span>
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

      <section className='lg:hidden section-spacing-linear bg-[var(--linear-bg-page)]'>
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
              <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)]'>
                One profile, many conversion paths
              </span>
              <h2 className='marketing-h2-linear text-[var(--linear-text-primary)]'>
                Jovie changes the CTA based on what the fan wants next.
              </h2>
              <p className='max-w-[400px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
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
