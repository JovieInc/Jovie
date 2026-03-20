'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ClaimHandleForm } from './claim-handle';
import { PhoneFrame } from './PhoneFrame';
import {
  DSP_LABELS,
  getDspConfig,
  RELEASES,
  SMART_LINK_DSPS,
} from './releases-data';

/* ------------------------------------------------------------------ */
/*  Scroll phase constants                                              */
/* ------------------------------------------------------------------ */

const SECTION_VH = 550;

const PHASE_HERO_END = 0.15;
const PHASE_DASHBOARD_END = 0.5;
const PHASE_PHONE_END = 0.75;
const PHASE_CYCLE_END = 0.92;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/* ------------------------------------------------------------------ */
/*  Dashboard mockup (inline, enhanced with ref props)                  */
/* ------------------------------------------------------------------ */

function DashboardMockup({
  activeIndex,
  rowRefs,
  urlRefs,
  footerRef,
}: {
  readonly activeIndex: number;
  readonly rowRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>;
  readonly urlRefs?: React.MutableRefObject<(HTMLSpanElement | null)[]>;
  readonly footerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className='relative overflow-hidden rounded-xl md:rounded-2xl'
      style={{
        border: '1px solid var(--linear-border-subtle)',
        backgroundColor: 'var(--linear-bg-surface-0)',
        boxShadow: [
          '0 0 0 1px rgba(255,255,255,0.03)',
          '0 8px 40px rgba(0,0,0,0.35)',
          '0 24px 80px rgba(0,0,0,0.25)',
        ].join(', '),
      }}
    >
      {/* Shine edge */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent)',
        }}
      />

      {/* Mac window chrome */}
      <div className='flex h-11 items-center border-b border-subtle bg-surface-1 px-5'>
        <div className='flex gap-2' aria-hidden='true'>
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#ED6A5E]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#F4BF4F]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#61C554]' />
        </div>
        <div className='flex-1 text-center text-xs text-tertiary-token'>
          Jovie - Releases
        </div>
        <div className='w-[52px]' />
      </div>

      {/* Column headers */}
      <div
        className='grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2.5 max-md:hidden'
        style={{ borderBottom: '1px solid var(--linear-border-subtle)' }}
      >
        <span className='text-[10px] font-medium uppercase tracking-[0.08em] text-quaternary-token'>
          Release
        </span>
        <span />
        <span className='text-[10px] font-medium uppercase tracking-[0.08em] text-quaternary-token'>
          Smart link
        </span>
      </div>

      {/* Release rows */}
      {RELEASES.map((release, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={release.id}
            ref={el => {
              if (rowRefs) rowRefs.current[i] = el;
            }}
            className='transition-colors duration-300'
            style={{
              backgroundColor: isActive
                ? 'rgba(255,255,255,0.035)'
                : 'transparent',
              borderBottom:
                i < RELEASES.length - 1
                  ? '1px solid var(--linear-border-subtle)'
                  : undefined,
            }}
          >
            {/* Desktop row layout */}
            <div className='hidden md:grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3'>
              <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2'>
                <Image
                  src={release.artwork}
                  alt={release.title}
                  fill
                  className='object-cover'
                  sizes='40px'
                />
              </div>

              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <p className='truncate text-sm font-medium text-primary-token'>
                    {release.title}
                  </p>
                  {release.isNew && (
                    <span className='shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400'>
                      New
                    </span>
                  )}
                </div>
                <p className='text-xs text-tertiary-token'>
                  {release.type} - {release.year}
                </p>
              </div>

              <div
                className='flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all duration-300'
                style={{
                  backgroundColor: isActive
                    ? 'rgba(255,255,255,0.07)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <svg
                  width='11'
                  height='11'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='text-tertiary-token'
                  aria-hidden='true'
                >
                  <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
                  <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
                </svg>
                <span
                  ref={el => {
                    if (urlRefs) urlRefs.current[i] = el;
                  }}
                  className='font-mono text-xs transition-colors duration-300'
                  style={{
                    color: isActive
                      ? 'var(--linear-text-secondary)'
                      : 'var(--linear-text-tertiary)',
                  }}
                >
                  jov.ie/{release.slug}
                </span>
              </div>
            </div>

            {/* Mobile row layout — stacked */}
            <div className='md:hidden px-5 py-3'>
              <div className='flex items-center gap-3'>
                <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2'>
                  <Image
                    src={release.artwork}
                    alt={release.title}
                    fill
                    className='object-cover'
                    sizes='40px'
                  />
                </div>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p className='truncate text-sm font-medium text-primary-token'>
                      {release.title}
                    </p>
                    {release.isNew && (
                      <span className='shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400'>
                        New
                      </span>
                    )}
                  </div>
                  <p className='text-xs text-tertiary-token'>
                    {release.type} - {release.year}
                  </p>
                </div>
              </div>
              <div className='mt-2 ml-[52px] flex items-center gap-1.5'>
                <svg
                  width='11'
                  height='11'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='text-tertiary-token'
                  aria-hidden='true'
                >
                  <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
                  <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
                </svg>
                <span className='font-mono text-xs text-tertiary-token'>
                  jov.ie/{release.slug}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer punchline */}
      <div
        ref={footerRef}
        className='flex items-center justify-center px-5 py-3'
      >
        <p className='text-xs text-quaternary-token'>
          + every past and future release, automatically
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Release phone (smart link page preview)                             */
/* ------------------------------------------------------------------ */

function ReleasePhone({ activeIndex }: { readonly activeIndex: number }) {
  return (
    <PhoneFrame>
      <div className='relative' style={{ minHeight: 420 }}>
        {RELEASES.map((release, i) => (
          <div
            key={release.id}
            className='absolute inset-0 transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
            style={{
              opacity: i === activeIndex ? 1 : 0,
              pointerEvents: i === activeIndex ? 'auto' : 'none',
            }}
          >
            {/* URL bar */}
            <div
              className='mx-4 mt-10 mb-1 flex items-center justify-center rounded-full bg-surface-1 px-3 py-1.5'
              style={{ border: '1px solid var(--linear-border-subtle)' }}
            >
              <span className='truncate text-[10px] text-tertiary-token'>
                jov.ie/{release.slug}
              </span>
            </div>

            {/* Artwork */}
            <div className='px-6 py-4'>
              <div
                className='relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-2'
                style={{
                  boxShadow:
                    '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                <Image
                  src={release.artwork}
                  alt={release.title}
                  fill
                  className='object-cover'
                  sizes='220px'
                />
              </div>
            </div>

            {/* Title */}
            <div className='px-6 pb-4 text-center'>
              <p className='text-[15px] font-semibold tracking-tight text-primary-token'>
                {release.title}
              </p>
              <p className='mt-0.5 text-xs text-tertiary-token'>Tim White</p>
            </div>

            {/* DSP buttons */}
            <div className='flex flex-col gap-2 px-5'>
              {SMART_LINK_DSPS.map(key => {
                const config = getDspConfig(key);
                if (!config) return null;
                return (
                  <SmartLinkProviderButton
                    key={key}
                    label={DSP_LABELS[key] ?? 'Spotify'}
                    iconPath={config.iconPath}
                    className='bg-surface-1 ring-[color:var(--linear-border-subtle)] hover:bg-hover'
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className='pb-3 pt-3 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-quaternary-token'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Persistent mini-CTA (ghost button)                                  */
/* ------------------------------------------------------------------ */

function MiniCTA() {
  return (
    <Link
      href='/signup?plan=free'
      className='inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-[var(--linear-duration-normal)]'
      style={{
        color: 'var(--linear-text-tertiary)',
        border: '1px solid var(--linear-border-subtle)',
        backgroundColor: 'transparent',
        minHeight: '44px',
      }}
    >
      Claim your handle
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
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero text block (shared between desktop/mobile/reduced-motion)      */
/* ------------------------------------------------------------------ */

function HeroText({
  innerRef,
  className,
  style,
}: {
  readonly innerRef?: React.Ref<HTMLDivElement>;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}) {
  return (
    <div ref={innerRef} className={className} style={style}>
      <h1 className='marketing-h1-linear text-balance text-primary-token'>
        Stop setting up smart links for every release.
      </h1>
      <p className='marketing-lead-linear mt-6 max-w-[28rem] text-balance text-tertiary-token'>
        Connect Spotify once. Jovie creates smart links for every song, notifies
        fans on every release, and builds your audience — automatically,
        forever.
      </p>
      <div className='mt-8 w-full max-w-[28rem]'>
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
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function HeroScrollSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const dashboardRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dashboardUrlRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const footerRef = useRef<HTMLDivElement>(null);
  const phoneContainerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const miniCtaRef = useRef<HTMLDivElement>(null);
  const shimmeredRef = useRef<Set<number>>(new Set());
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

    // Reset shimmer tracking when scrolled back to top
    if (progress < PHASE_HERO_END) {
      shimmeredRef.current.clear();
    }

    // Phase sub-progress values (all 0-1)
    const dashP = clamp01(
      (progress - PHASE_HERO_END) / (PHASE_DASHBOARD_END - PHASE_HERO_END)
    );
    const phoneP = clamp01(
      (progress - PHASE_DASHBOARD_END) / (PHASE_PHONE_END - PHASE_DASHBOARD_END)
    );
    const cycleP = clamp01(
      (progress - PHASE_PHONE_END) / (PHASE_CYCLE_END - PHASE_PHONE_END)
    );

    /* ---- Phase 1 → 2: Hero text exits FAST ---- */
    // Hero gone by ~22% (dashP ≈ 0.2 → heroFade = 1.0)
    const heroFade = clamp01(dashP / 0.2);
    const heroOpacity = 1 - heroFade;
    const heroY = heroFade * -30;

    heroTextRef.current?.style.setProperty('opacity', String(heroOpacity));
    heroTextRef.current?.style.setProperty(
      'transform',
      `translateY(${heroY}px)`
    );

    /* ---- Phase 2: Dashboard reveals ---- */
    // Dashboard starts appearing at dashP > 0.15 (after hero is mostly gone)
    const dashAppear = clamp01((dashP - 0.15) / 0.4);
    const dashEased = easeOutCubic(dashAppear);
    const dashScale = 0.9 + 0.1 * dashEased;
    const dashY = 40 * (1 - dashEased);

    // Phase 3: dashboard shifts left when phone enters
    const dashX = phoneP * -10;

    if (dashboardRef.current) {
      dashboardRef.current.style.opacity = String(dashAppear);
      dashboardRef.current.style.transform = `scale(${dashScale}) translateY(${dashY}px) translateX(${dashX}%)`;
    }

    // Row stagger: each row appears sequentially
    for (let i = 0; i < RELEASES.length; i++) {
      const rowThreshold = 0.3 + i * 0.15;
      const rowP = clamp01((dashP - rowThreshold) / 0.15);
      const rowEased = easeOutCubic(rowP);

      const row = dashboardRowRefs.current[i];
      if (row) {
        row.style.opacity = String(i === 0 ? rowP : 0.85 + 0.15 * rowP);
        row.style.transform =
          i === 0
            ? `scale(${1 + 0.02 * (1 - rowEased)})`
            : `translateY(${(1 - rowEased) * 12}px)`;
      }

      // URL clip-path typing effect (after row lands)
      const urlThreshold = rowThreshold + 0.1;
      const urlP = clamp01((dashP - urlThreshold) / 0.12);
      const url = dashboardUrlRefs.current[i];
      if (url) {
        url.style.clipPath = `inset(0 ${(1 - urlP) * 100}% 0 0)`;

        // One-shot shimmer when fully revealed
        if (urlP >= 1 && !shimmeredRef.current.has(i)) {
          shimmeredRef.current.add(i);
          url.classList.add('url-reveal-shimmer');
        }
        if (urlP < 1) {
          url.classList.remove('url-reveal-shimmer');
        }
      }
    }

    // Footer text enters last
    const footerP = clamp01((dashP - 0.8) / 0.2);
    footerRef.current?.style.setProperty('opacity', String(footerP));

    // Mini CTA fades in with dashboard
    miniCtaRef.current?.style.setProperty('opacity', String(dashAppear));

    /* ---- Phase 3: Phone slides in ---- */
    const phoneEased = easeOutCubic(phoneP);
    const phoneX = (1 - phoneEased) * 100;

    if (phoneContainerRef.current) {
      phoneContainerRef.current.style.opacity = String(phoneP > 0 ? 1 : 0);
      phoneContainerRef.current.style.transform = `translateX(${phoneX}%)`;
    }

    // Glow behind phone
    glowRef.current?.style.setProperty('opacity', String(phoneEased * 0.6));

    /* ---- Phase 4: Release cycling ---- */
    const newIndex =
      cycleP >= 1
        ? RELEASES.length - 1
        : Math.min(RELEASES.length - 1, Math.floor(cycleP * RELEASES.length));

    setActiveIndex(newIndex);
  }, []);

  useEffect(() => {
    globalThis.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => globalThis.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  /* ---- Reduced motion: static layout ---- */
  if (prefersReducedMotion) {
    return (
      <section className='relative overflow-hidden px-5 pt-[8.2rem] pb-[5rem] sm:px-6 md:pt-[5.7rem] md:pb-[4rem] xl:pt-[12.5rem] xl:pb-[7rem]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <Container size='homepage'>
          <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
            <HeroText className='hero-stagger relative z-10 mx-auto flex w-full flex-col items-center text-center' />

            <div className='mt-16 flex flex-col gap-8 lg:flex-row lg:items-start'>
              <div className='min-w-0 flex-1' style={{ maxWidth: 700 }}>
                <DashboardMockup activeIndex={0} />
              </div>
              <div className='hidden shrink-0 lg:block'>
                <ReleasePhone activeIndex={0} />
              </div>
            </div>

            <div className='mt-6 flex justify-center'>
              <MiniCTA />
            </div>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <>
      {/* ============================================================= */}
      {/*  Desktop: scroll-hijack hero → dashboard reveal → phone       */}
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

          {/* Phone glow (fades in during phase 3) */}
          <div
            ref={glowRef}
            aria-hidden='true'
            className='pointer-events-none absolute right-[15%] top-1/2 -translate-y-1/2'
            style={{
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: 'var(--linear-deeplinks-glow)',
              opacity: 0,
            }}
          />

          <Container size='homepage'>
            <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
              {/* Hero text (absolutely positioned, fades out in phase 2) */}
              <HeroText
                innerRef={heroTextRef}
                className='absolute inset-0 z-10 flex flex-col justify-center gap-6'
                style={{ willChange: 'opacity, transform' }}
              />

              {/* Dashboard + phone container */}
              <div className='flex items-start gap-8 xl:gap-12'>
                {/* Dashboard (centered initially, shifts left when phone enters) */}
                <div
                  ref={dashboardRef}
                  className='min-w-0 flex-1 flex flex-col items-center'
                  style={{
                    opacity: 0,
                    transform: 'scale(0.9) translateY(40px)',
                    willChange: 'opacity, transform',
                    maxWidth: 700,
                    margin: '0 auto',
                  }}
                >
                  <DashboardMockup
                    activeIndex={activeIndex}
                    rowRefs={dashboardRowRefs}
                    urlRefs={dashboardUrlRefs}
                    footerRef={footerRef}
                  />

                  {/* Persistent mini-CTA */}
                  <div ref={miniCtaRef} className='mt-6' style={{ opacity: 0 }}>
                    <MiniCTA />
                  </div>
                </div>

                {/* Phone (slides in from right during phase 3) */}
                <div
                  ref={phoneContainerRef}
                  className='shrink-0'
                  style={{
                    opacity: 0,
                    transform: 'translateX(100%)',
                    willChange: 'opacity, transform',
                  }}
                >
                  <ReleasePhone activeIndex={activeIndex} />
                </div>
              </div>
            </div>
          </Container>
        </div>
      </section>

      {/* ============================================================= */}
      {/*  Mobile: static hero + static dashboard (no scroll hijacking) */}
      {/* ============================================================= */}
      <section className='lg:hidden relative flex flex-col items-center overflow-hidden px-5 pt-[8.2rem] pb-[5rem] sm:px-6 md:pt-[5.7rem] md:pb-[4rem]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <HeroText className='hero-stagger relative z-10 mx-auto flex w-full max-w-[var(--linear-content-max)] flex-col items-center text-center' />
      </section>

      {/* Mobile dashboard */}
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
            <DashboardMockup activeIndex={0} />
            <div className='mt-6 flex justify-center'>
              <MiniCTA />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
