'use client';

import { type ComponentType, useEffect, useState } from 'react';
import {
  MODES,
  PHONE_TOUR_CONTAINER_CLASS,
  PHONE_TOUR_SHOWCASE_SHADOW,
  PhoneShowcase,
  PhoneTourDivider,
  PhoneTourMobileSection,
} from './phone-showcase-primitives';
import type { StickyPhoneTourProps } from './StickyPhoneTourClient';

const VH_PER_SLIDE = 80;

function StickyPhoneTourFallback({
  modes = MODES,
  introTitle = 'The right action for every fan.',
  introBadge = 'One profile. Every way fans support you.',
  artistHandle = 'timwhite',
}: StickyPhoneTourProps) {
  const slideCount = Math.max(modes.length, 1);

  return (
    <>
      <section
        className='relative max-lg:hidden section-spacing-linear'
        style={{ height: `${slideCount * VH_PER_SLIDE}vh` }}
      >
        <PhoneTourDivider />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-screen'
          style={{ background: 'var(--linear-hero-backdrop)' }}
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

                  <h3 className='mt-6 text-xl font-[590] leading-snug tracking-[-0.012em] text-secondary-token'>
                    {modes[0]?.headline}
                  </h3>

                  <p className='mt-5 max-w-[400px] marketing-lead-linear text-secondary-token'>
                    {modes[0]?.description}
                  </p>
                </div>

                <div className='flex flex-col items-center gap-4'>
                  <div
                    style={{
                      filter: PHONE_TOUR_SHOWCASE_SHADOW,
                    }}
                  >
                    <PhoneShowcase activeIndex={0} modes={modes} />
                  </div>
                </div>

                <div className='flex flex-col items-end justify-center gap-4'>
                  {modes.map((mode, i) => {
                    const slug = mode.id === 'profile' ? '' : `/${mode.id}`;
                    const isActive = i === 0;
                    return (
                      <div key={mode.id} className='text-right'>
                        <p
                          className='font-mono tracking-[-0.02em]'
                          style={{
                            fontSize: isActive ? '20px' : '15px',
                            fontWeight: isActive ? 590 : 400,
                            color: isActive
                              ? 'var(--linear-text-primary)'
                              : 'var(--linear-text-secondary)',
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

export function StickyPhoneTour(props: StickyPhoneTourProps) {
  const [EnhancedTour, setEnhancedTour] =
    useState<ComponentType<StickyPhoneTourProps> | null>(null);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadEnhancement = async () => {
      const mod = await import('./StickyPhoneTourClient');
      if (!active) return;
      setEnhancedTour(() => mod.StickyPhoneTourClient);
    };

    if ('requestIdleCallback' in globalThis) {
      const idleId = globalThis.requestIdleCallback(loadEnhancement, {
        timeout: 1500,
      });
      return () => {
        active = false;
        globalThis.cancelIdleCallback(idleId);
      };
    }

    timeoutId = globalThis.setTimeout(loadEnhancement, 200);
    return () => {
      active = false;
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, []);

  if (EnhancedTour) {
    return <EnhancedTour {...props} />;
  }

  return <StickyPhoneTourFallback {...props} />;
}
