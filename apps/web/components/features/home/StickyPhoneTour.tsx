'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import {
  CrossfadeBlock,
  MODES,
  MobileCard,
  PhoneShowcase,
  scrollToActiveIndex,
} from './phone-showcase-primitives';

export { scrollToActiveIndex } from './phone-showcase-primitives';

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
                  <PhoneShowcase activeIndex={activeIndex} modes={MODES} />
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
