'use client';

import { type ComponentType, useEffect, useState } from 'react';
import { Container } from '@/components/site/Container';
import { MODES, MobileCard, PhoneShowcase } from './phone-showcase-primitives';

const SLIDE_COUNT = MODES.length;
const VH_PER_SLIDE = 80;

function StickyPhoneTourFallback() {
  return (
    <>
      <section
        className='relative max-lg:hidden section-spacing-linear'
        style={{ height: `${SLIDE_COUNT * VH_PER_SLIDE}vh` }}
      >
        <div
          aria-hidden='true'
          className='mx-auto mb-16 h-px max-w-lg'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />
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
          <Container size='homepage'>
            <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
              <div className='grid items-center grid-cols-[1fr_auto_1fr] gap-8 xl:gap-16'>
                <div className='relative min-h-[320px]'>
                  <span className='inline-flex items-center gap-1.5 self-start rounded-full border border-subtle px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token'>
                    One profile. Every way fans support you.
                  </span>

                  <h2 className='marketing-h2-linear mt-5 text-primary-token'>
                    The right action for every fan.
                  </h2>

                  <h3 className='mt-6 text-xl font-[590] leading-snug tracking-[-0.012em] text-secondary-token'>
                    {MODES[0]?.headline}
                  </h3>

                  <p className='mt-5 max-w-[400px] marketing-lead-linear text-secondary-token'>
                    {MODES[0]?.description}
                  </p>
                </div>

                <div className='flex flex-col items-center gap-4'>
                  <div
                    style={{
                      filter:
                        'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                    }}
                  >
                    <PhoneShowcase activeIndex={0} modes={MODES} />
                  </div>
                </div>

                <div className='flex flex-col items-end justify-center gap-4'>
                  {MODES.map((mode, i) => {
                    const slug = mode.id === 'profile' ? '' : `/${mode.id}`;
                    const isActive = i === 0;
                    return (
                      <div key={mode.id} className='text-right'>
                        <p
                          className='font-mono tracking-[-0.02em]'
                          style={{
                            fontSize: isActive ? '20px' : '15px',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive
                              ? 'var(--linear-text-primary)'
                              : 'var(--linear-text-secondary)',
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

      <section className='lg:hidden section-spacing-linear'>
        <Container size='homepage'>
          <div
            aria-hidden='true'
            className='mx-auto mb-16 h-px max-w-lg'
            style={{
              background:
                'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
            }}
          />

          <div className='mx-auto max-w-[var(--linear-content-max)]'>
            <div className='mb-12 flex flex-col items-center gap-6 text-center'>
              <span className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token'>
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

export function StickyPhoneTour() {
  const [EnhancedTour, setEnhancedTour] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadEnhancement = () => {
      void import('./StickyPhoneTourClient').then(mod => {
        if (!active) {
          return;
        }
        setEnhancedTour(() => mod.StickyPhoneTourClient);
      });
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
    return <EnhancedTour />;
  }

  return <StickyPhoneTourFallback />;
}
