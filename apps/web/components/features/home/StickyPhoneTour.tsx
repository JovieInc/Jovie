'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import {
  CrossfadeBlock,
  MODES,
  MobileCard,
  PhoneShowcase,
  scrollToActiveIndex,
} from './phone-showcase-primitives';

export { scrollToActiveIndex } from './phone-showcase-primitives';

/**
 * Total slides: 1 hero + N modes.
 * Slide 0 = hero (h1, claim form, phone shows profile).
 * Slides 1–N = mode panels (crossfade headline/description, phone transitions).
 * Logo bar (z-20) wipes over the sticky phone when section ends.
 */
const SLIDE_COUNT = 1 + MODES.length; // 5 total
const VH_PER_SLIDE = 80;

export function StickyPhoneTour() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const handleScroll = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const newIndex = scrollToActiveIndex(
      rect.top,
      rect.height,
      globalThis.innerHeight,
      SLIDE_COUNT
    );
    setActiveSlide(newIndex);
  }, []);

  useEffect(() => {
    globalThis.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => globalThis.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Phone shows mode 0 (profile) for hero + first mode, then advances
  const phoneIndex = activeSlide === 0 ? 0 : activeSlide - 1;

  // Whether we're past the hero slide
  const inTourMode = activeSlide > 0;

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
      {/* Desktop: unified hero → sticky phone tour */}
      <section
        ref={sectionRef}
        className='relative hidden lg:block'
        style={{
          height: `${SLIDE_COUNT * VH_PER_SLIDE}vh`,
          /* No overflow:hidden — stacking context would break logo bar wipe */
        }}
      >
        {/* Backdrop glow — visible during hero slide */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-screen transition-opacity duration-700'
          style={{
            background: 'var(--linear-hero-backdrop)',
            opacity: inTourMode ? 0 : 1,
          }}
        />
        <div
          aria-hidden='true'
          className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-screen transition-opacity duration-700'
          style={{ opacity: inTourMode ? 0 : 1 }}
        />

        <div className='sticky top-0 z-10 flex h-dvh items-center justify-center'>
          <Container size='homepage'>
            <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
              <div className='grid items-center grid-cols-[1fr_auto_1fr] gap-8 xl:gap-16'>
                {/* Left: crossfade between hero content and mode panels */}
                <div className='relative min-h-[320px]'>
                  {/* Hero content — slide 0 */}
                  <div
                    aria-hidden={inTourMode}
                    inert={inTourMode ? true : undefined}
                    className='transition-all duration-700 ease-[cubic-bezier(0.33,.01,.27,1)]'
                    style={{
                      opacity: inTourMode ? 0 : 1,
                      transform: inTourMode
                        ? 'translateY(-20px)'
                        : 'translateY(0)',
                      pointerEvents: inTourMode ? 'none' : 'auto',
                    }}
                  >
                    <p className='homepage-section-eyebrow'>
                      Built for independent artists
                    </p>

                    <h1 className='marketing-h1-linear mt-5 text-primary-token'>
                      The link your music deserves.
                    </h1>

                    <p className='marketing-lead-linear mt-4 max-w-[31rem] text-secondary-token md:mt-5'>
                      Smart links, release automation, and fan insight that keep
                      every launch moving.
                    </p>

                    <div className='mt-6 w-full max-w-[27rem] md:mt-7'>
                      <ClaimHandleForm size='hero' />
                    </div>

                    <p className='mt-3.5 text-[11px] tracking-[0.01em] text-quaternary-token md:mt-4'>
                      Start free with your artist page and next release ready to
                      go.
                    </p>
                  </div>

                  {/* Tour mode content — slides 1-4 */}
                  <div
                    aria-hidden={!inTourMode}
                    inert={!inTourMode ? true : undefined}
                    className='absolute inset-0 flex flex-col gap-5 justify-center transition-all duration-700 ease-[cubic-bezier(0.33,.01,.27,1)]'
                    style={{
                      opacity: inTourMode ? 1 : 0,
                      transform: inTourMode
                        ? 'translateY(0)'
                        : 'translateY(20px)',
                      pointerEvents: inTourMode ? 'auto' : 'none',
                    }}
                  >
                    <span className='inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token border border-subtle'>
                      One profile. Every way fans support you.
                    </span>

                    <h2 className='marketing-h2-linear text-primary-token'>
                      The right action for every fan.
                    </h2>

                    <CrossfadeBlock activeIndex={phoneIndex}>
                      {headlines}
                    </CrossfadeBlock>

                    <CrossfadeBlock activeIndex={phoneIndex}>
                      {descriptions}
                    </CrossfadeBlock>
                  </div>
                </div>

                {/* Center: persistent phone */}
                <div className='flex flex-col items-center gap-4'>
                  <div
                    style={{
                      filter: 'drop-shadow(0 25px 60px rgba(0,0,0,0.35))',
                    }}
                  >
                    <PhoneShowcase activeIndex={phoneIndex} modes={MODES} />
                  </div>
                </div>

                {/* Right: mode URLs — fade in when past hero */}
                <div
                  className='flex flex-col items-end justify-center gap-4 transition-all duration-700 ease-[cubic-bezier(0.33,.01,.27,1)]'
                  style={{
                    opacity: inTourMode ? 1 : 0,
                    transform: inTourMode
                      ? 'translateX(0)'
                      : 'translateX(16px)',
                  }}
                >
                  {MODES.map((mode, i) => {
                    const slug = mode.id === 'profile' ? '' : `/${mode.id}`;
                    const isActive = i === phoneIndex;
                    return (
                      <div
                        key={mode.id}
                        className='text-right transition-all duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
                        style={{
                          transform: isActive
                            ? 'translateX(0)'
                            : 'translateX(8px)',
                        }}
                      >
                        <p
                          className='font-mono tracking-[-0.02em]'
                          style={{
                            fontSize: isActive ? '20px' : '15px',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive
                              ? 'var(--linear-text-primary)'
                              : 'var(--linear-text-secondary)',
                            transition:
                              'font-size 0.5s cubic-bezier(0.33,.01,.27,1), font-weight 0.5s cubic-bezier(0.33,.01,.27,1), color 0.5s cubic-bezier(0.33,.01,.27,1)',
                          }}
                        >
                          jov.ie/timwhite
                          {slug && (
                            <span
                              style={{
                                color: isActive
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

      {/* Mobile: hero is separate (HeroCinematic), show card grid here */}
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
