'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ClaimHandleForm } from './claim-handle';
import { DashboardMockup } from './DashboardMockup';
import { PhoneFrame } from './PhoneFrame';
import { ReleasePhoneContent } from './ReleasePhoneContent';
import { RELEASES } from './releases-data';

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
/*  Release phone with crossfade (hero-specific wrapper)                */
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
            <ReleasePhoneContent release={release} />
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
        Release More Music.
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
