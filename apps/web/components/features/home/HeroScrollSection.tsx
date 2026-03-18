'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { Avatar } from '@/components/molecules/Avatar';
import { Container } from '@/components/site/Container';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ClaimHandleForm } from './claim-handle';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

/* ------------------------------------------------------------------ */
/*  Mode data (same as DeeplinksGrid)                                   */
/* ------------------------------------------------------------------ */

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
    headline: 'Keep the fan before they disappear.',
    description:
      'First-time visitors can subscribe fast. Returning fans see the next best action instead of a generic stack of links.',
    slug: '',
    outcome: 'Grow',
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

/* ------------------------------------------------------------------ */
/*  Scroll phase constants                                              */
/* ------------------------------------------------------------------ */

/** Total section height in vh units */
const SECTION_VH = 550;

/** Phase boundaries (as fraction of total scroll progress 0-1) */
const PHASE_HERO_END = 0.15;
const PHASE_MIGRATE_END = 0.3;
const PHASE_CAROUSEL_END = 0.92;

/** Easing function for smooth phone movement */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Clamp a value between 0 and 1 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/* ------------------------------------------------------------------ */
/*  Phone content (reused from DeeplinksGrid)                           */
/* ------------------------------------------------------------------ */

function ScrollPhone({ activeIndex }: { readonly activeIndex: number }) {
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
/*  Crossfade helper                                                    */
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

/* ------------------------------------------------------------------ */
/*  Mobile card fallback                                                */
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
      <div className='mt-4 flex items-center justify-end'>
        <span className='font-mono text-xs text-tertiary-token'>
          jov.ie/tim{mode.slug ? `/${mode.slug}` : ''}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function HeroScrollSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const deeplinksTextRef = useRef<HTMLDivElement>(null);
  const phoneWrapperRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const urlColumnRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const handleScroll = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const scrolled = -rect.top;
    const scrollableHeight = rect.height - globalThis.innerHeight;

    if (scrollableHeight <= 0) return;

    const progress = clamp01(scrolled / scrollableHeight);

    // Phase sub-progress values (all 0-1)
    const migrateP = clamp01(
      (progress - PHASE_HERO_END) / (PHASE_MIGRATE_END - PHASE_HERO_END)
    );
    const carouselP = clamp01(
      (progress - PHASE_MIGRATE_END) / (PHASE_CAROUSEL_END - PHASE_MIGRATE_END)
    );

    const eased = easeOutCubic(migrateP);

    // Phone position: starts offset right, ends at center
    // 30% = roughly right-side of a 2-col layout
    const phoneX = (1 - eased) * 30;

    // Hero text fades out as phone starts migrating
    const heroOpacity = 1 - clamp01(migrateP / 0.6);
    const heroY = migrateP * -20;

    // Deeplinks text + URL column fades in during second half of migration
    const deeplinksOpacity = clamp01((migrateP - 0.4) / 0.6);

    // Apply transforms via refs (no React re-renders)
    if (heroTextRef.current) {
      heroTextRef.current.style.opacity = String(heroOpacity);
      heroTextRef.current.style.transform = `translateY(${heroY}px)`;
    }
    if (deeplinksTextRef.current) {
      deeplinksTextRef.current.style.opacity = String(deeplinksOpacity);
    }
    if (phoneWrapperRef.current) {
      phoneWrapperRef.current.style.transform = `translateX(${phoneX}%)`;
    }
    if (separatorRef.current) {
      separatorRef.current.style.opacity = String(deeplinksOpacity);
    }
    if (urlColumnRef.current) {
      urlColumnRef.current.style.opacity = String(deeplinksOpacity);
    }
    if (glowRef.current) {
      glowRef.current.style.opacity = String(deeplinksOpacity);
    }

    // Active mode index (only during carousel phase)
    const newIndex =
      carouselP >= 1
        ? MODES.length - 1
        : Math.min(MODES.length - 1, Math.floor(carouselP * MODES.length));

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

  /* ---- Reduced motion: static layout ---- */
  if (prefersReducedMotion) {
    return (
      <>
        {/* Static hero */}
        <section className='relative flex flex-col items-center overflow-hidden px-5 pt-[8.2rem] pb-[5rem] sm:px-6 md:pt-[5.7rem] md:pb-[4rem] xl:pt-[12.5rem] xl:pb-[7rem]'>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0'
            style={{ background: 'var(--linear-hero-backdrop)' }}
          />
          <div className='hero-stagger relative z-10 mx-auto flex w-full max-w-[var(--linear-content-max)] flex-col items-center text-center'>
            <h1 className='marketing-h1-linear text-balance text-primary-token'>
              One link to launch your music career.
            </h1>
            <p className='marketing-lead-linear mt-8 max-w-[40rem] text-balance text-tertiary-token'>
              Import your catalog. Fans get notified when you release.
            </p>
            <div className='mt-10 w-full max-w-[32rem]'>
              <ClaimHandleForm size='hero' />
            </div>
            <p className='mt-5 text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)] tracking-[0.01em] text-tertiary-token'>
              <span
                aria-hidden='true'
                className='mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
              />{' '}
              Free forever · Live in 60 seconds
            </p>
          </div>
        </section>

        {/* Static mode cards */}
        <section className='section-spacing-linear bg-page'>
          <Container size='homepage'>
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

  return (
    <>
      {/* ============================================================= */}
      {/*  Desktop: scroll-hijack hero → phone migration → mode carousel */}
      {/* ============================================================= */}
      <section
        ref={sectionRef}
        className='relative hidden lg:block'
        style={{
          height: `${SECTION_VH}vh`,
          backgroundColor: 'var(--linear-bg-footer)',
        }}
      >
        <div className='sticky top-0 flex h-dvh items-center justify-center overflow-hidden'>
          {/* Hero backdrop gradient */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0'
            style={{ background: 'var(--linear-hero-backdrop)' }}
          />

          {/* Deeplinks glow (fades in during migration) */}
          <div
            ref={glowRef}
            aria-hidden='true'
            className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
            style={{
              width: '600px',
              height: '600px',
              borderRadius: '50%',
              background: 'var(--linear-deeplinks-glow)',
              opacity: 0,
            }}
          />

          <Container size='homepage'>
            <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
              {/* Separator line (visible once deeplinks text appears) */}
              <div
                ref={separatorRef}
                aria-hidden='true'
                className='absolute top-0 left-1/2 -translate-x-1/2 h-px w-full max-w-lg'
                style={{
                  background:
                    'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
                  opacity: 0,
                }}
              />

              {/* Layout grid: left column | phone | right column */}
              <div className='grid items-center grid-cols-[1fr_auto_1fr] gap-8 xl:gap-16'>
                {/* ---- Left column ---- */}
                <div className='relative'>
                  {/* Hero text (visible at start, fades out during migration) */}
                  <div
                    ref={heroTextRef}
                    className='flex flex-col gap-6'
                    style={{ willChange: 'opacity, transform' }}
                  >
                    <h1 className='marketing-h1-linear text-balance text-primary-token'>
                      One link to launch your music career.
                    </h1>
                    <p className='marketing-lead-linear max-w-[28rem] text-balance text-tertiary-token'>
                      Import your catalog. Fans get notified when you release.
                    </p>
                    <div className='w-full max-w-[28rem]'>
                      <ClaimHandleForm size='hero' />
                    </div>
                    <p className='text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)] tracking-[0.01em] text-tertiary-token'>
                      <span
                        aria-hidden='true'
                        className='mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
                      />{' '}
                      Free forever · Live in 60 seconds
                    </p>
                  </div>

                  {/* Deeplinks text (fades in during migration, visible during carousel) */}
                  <div
                    ref={deeplinksTextRef}
                    className='absolute inset-0 flex flex-col gap-6'
                    style={{ opacity: 0, willChange: 'opacity' }}
                  >
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
                                : 'var(--linear-border-default)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* ---- Center: Phone (position animated via ref) ---- */}
                <div
                  ref={phoneWrapperRef}
                  className='flex flex-col items-center gap-4'
                  style={{
                    willChange: 'transform',
                    transform: 'translateX(30%)',
                  }}
                >
                  <ScrollPhone activeIndex={activeIndex} />
                  <a
                    href='https://jov.ie/tim'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-[var(--linear-duration-normal)]'
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

                {/* ---- Right column: URL variants (fades in with deeplinks) ---- */}
                <div
                  ref={urlColumnRef}
                  className='flex flex-col items-end justify-center gap-4'
                  style={{ opacity: 0, willChange: 'opacity' }}
                >
                  {MODES.map((mode, i) => (
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
                        {mode.slug && (
                          <span
                            style={{
                              color:
                                i === activeIndex
                                  ? 'var(--linear-text-secondary)'
                                  : 'var(--linear-text-tertiary)',
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

      {/* ============================================================= */}
      {/*  Mobile: standard hero + deeplinks cards (no scroll hijacking) */}
      {/* ============================================================= */}
      <section className='lg:hidden relative flex flex-col items-center overflow-hidden px-5 pt-[8.2rem] pb-[5rem] sm:px-6 md:pt-[5.7rem] md:pb-[4rem]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <div className='hero-stagger relative z-10 mx-auto flex w-full max-w-[var(--linear-content-max)] flex-col items-center text-center'>
          <h1 className='marketing-h1-linear text-balance text-primary-token'>
            One link to launch your music career.
          </h1>
          <p className='marketing-lead-linear mt-8 max-w-[40rem] text-balance text-tertiary-token'>
            Import your catalog. Fans get notified when you release.
          </p>
          <div className='mt-10 w-full max-w-[32rem]'>
            <ClaimHandleForm size='hero' />
          </div>
          <p className='mt-5 text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)] tracking-[0.01em] text-tertiary-token'>
            <span
              aria-hidden='true'
              className='mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
            />{' '}
            Free forever · Live in 60 seconds
          </p>
        </div>
      </section>

      {/* Mobile deeplinks cards */}
      <section className='lg:hidden section-spacing-linear bg-page'>
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
