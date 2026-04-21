'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PhoneShowcaseModeData } from './phone-showcase-modes';
import {
  CrossfadeBlock,
  MODES,
  PHONE_TOUR_CONTAINER_CLASS,
  PHONE_TOUR_SHOWCASE_SHADOW,
  PhoneShowcase,
  PhoneTourDivider,
  PhoneTourMobileSection,
  scrollToActiveIndex,
} from './phone-showcase-primitives';

const VH_PER_SLIDE = 80;

export interface StickyPhoneTourProps {
  readonly modes?: readonly PhoneShowcaseModeData[];
  readonly introTitle?: string;
  readonly introBadge?: string;
  readonly artistHandle?: string;
}

export function StickyPhoneTourClient({
  modes = MODES,
  introTitle = 'The right action for every fan.',
  introBadge = 'One profile. Every way fans support you.',
  artistHandle = 'tim',
}: StickyPhoneTourProps) {
  const slideCount = Math.max(modes.length, 1);
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
      slideCount
    );
    setActiveSlide(newIndex);
  }, [slideCount]);

  useEffect(() => {
    let animationFrame = 0;

    const runOnIdle = () => {
      globalThis.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
    };

    if ('requestIdleCallback' in globalThis) {
      const idleId = globalThis.requestIdleCallback(runOnIdle, {
        timeout: 1500,
      });
      return () => {
        globalThis.cancelIdleCallback(idleId);
        globalThis.removeEventListener('scroll', handleScroll);
        if (animationFrame) {
          globalThis.cancelAnimationFrame(animationFrame);
        }
      };
    }

    animationFrame = globalThis.requestAnimationFrame(runOnIdle);
    return () => {
      globalThis.removeEventListener('scroll', handleScroll);
      if (animationFrame) {
        globalThis.cancelAnimationFrame(animationFrame);
      }
    };
  }, [handleScroll]);

  const phoneIndex = activeSlide;

  const headlines = useMemo(
    () =>
      modes.map(mode => (
        <h3
          key={mode.id}
          className='text-xl font-[590] leading-snug tracking-[-0.012em] text-secondary-token'
        >
          {mode.headline}
        </h3>
      )),
    [modes]
  );

  const descriptions = useMemo(
    () =>
      modes.map(mode => (
        <p
          key={mode.id}
          className='max-w-[400px] marketing-lead-linear text-secondary-token'
        >
          {mode.description}
        </p>
      )),
    [modes]
  );

  return (
    <>
      <section
        ref={sectionRef}
        className='relative max-lg:hidden section-spacing-linear'
        style={{
          height: `${slideCount * VH_PER_SLIDE}vh`,
        }}
      >
        <PhoneTourDivider />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-screen'
          style={{
            background: 'var(--linear-hero-backdrop)',
          }}
        />
        <div
          aria-hidden='true'
          className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-screen'
        />

        <div className='sticky top-0 z-10 flex h-dvh items-center justify-center'>
          <div className={PHONE_TOUR_CONTAINER_CLASS}>
            <div className='relative'>
              <div className='grid items-center grid-cols-[1fr_auto_1fr] gap-8 xl:gap-16'>
                <div className='relative min-h-[320px]'>
                  <span className='inline-flex items-center gap-1.5 self-start rounded-full border border-subtle px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token'>
                    {introBadge}
                  </span>

                  <h2 className='marketing-h2-linear mt-5 text-primary-token'>
                    {introTitle}
                  </h2>

                  <div className='mt-6'>
                    <CrossfadeBlock activeIndex={phoneIndex}>
                      {headlines}
                    </CrossfadeBlock>
                  </div>

                  <div className='mt-5'>
                    <CrossfadeBlock activeIndex={phoneIndex}>
                      {descriptions}
                    </CrossfadeBlock>
                  </div>
                </div>

                <div className='flex flex-col items-center gap-4'>
                  <div
                    style={{
                      filter: PHONE_TOUR_SHOWCASE_SHADOW,
                    }}
                  >
                    <PhoneShowcase activeIndex={phoneIndex} modes={modes} />
                  </div>
                </div>

                <div
                  className='flex flex-col items-end justify-center gap-4 transition-all duration-700 ease-[cubic-bezier(0.33,.01,.27,1)]'
                  style={{
                    opacity: 1,
                    transform: 'translateX(0)',
                  }}
                >
                  {modes.map((mode, i) => {
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
                            fontWeight: isActive ? 590 : 400,
                            color: isActive
                              ? 'var(--linear-text-primary)'
                              : 'var(--linear-text-secondary)',
                            transition:
                              'font-size 0.5s cubic-bezier(0.33,.01,.27,1), font-weight 0.5s cubic-bezier(0.33,.01,.27,1), color 0.5s cubic-bezier(0.33,.01,.27,1)',
                          }}
                        >
                          jov.ie/{artistHandle}
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
          </div>
        </div>
      </section>

      <PhoneTourMobileSection />
    </>
  );
}
