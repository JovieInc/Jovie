'use client';

import { useCallback, useState } from 'react';
import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import {
  MODE_TAB_LABELS,
  MODES,
  PhoneShowcase,
} from './phone-showcase-primitives';

interface HeroCinematicProps {
  readonly fullScreen?: boolean;
}

export function HeroCinematic({
  fullScreen = false,
}: Readonly<HeroCinematicProps>) {
  const [activeTab, setActiveTab] = useState(0);

  const handleIndexChange = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  if (!fullScreen) {
    return (
      <section
        className='relative overflow-hidden pb-0 pt-[5.5rem] md:pt-[6.1rem] lg:pt-[6.6rem]'
        data-testid='homepage-shell'
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <div className='hero-glow pointer-events-none absolute inset-0' />

        <Container size='homepage'>
          <div className='mx-auto max-w-[1120px]'>
            <div className='hero-stagger'>
              <div className='flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16'>
                <div className='max-w-[44rem] text-center lg:flex-1 lg:text-left'>
                  <p className='homepage-section-eyebrow'>
                    Built for independent artists
                  </p>

                  <h1 className='marketing-h1-linear hero-gradient-text mt-5 lg:text-left'>
                    The link your music deserves.
                  </h1>

                  <p className='marketing-lead-linear mx-auto mt-4 max-w-[31rem] text-secondary-token md:mt-5 lg:mx-0'>
                    Smart links, release automation, and fan insight that keep
                    every launch moving.
                  </p>

                  <div className='mx-auto mt-6 w-full max-w-[27rem] md:mt-7 lg:mx-0'>
                    <ClaimHandleForm
                      size='hero'
                      submitButtonTestId='homepage-primary-cta'
                    />
                  </div>

                  <p className='mt-3.5 text-[11px] tracking-[0.01em] text-quaternary-token md:mt-4 lg:text-left'>
                    Start free with your artist page and next release ready to
                    go.
                  </p>
                </div>

                <div className='relative flex-shrink-0 lg:flex-none'>
                  <div
                    className='animate-hero-phone-float'
                    style={{
                      filter:
                        'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                    }}
                  >
                    <PhoneShowcase activeIndex={0} modes={MODES} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section
      className='relative flex h-[calc(100dvh-var(--linear-header-height))] flex-col overflow-hidden'
      data-testid='homepage-shell'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0' />

      <div className='relative z-10 flex min-h-0 flex-1 items-center justify-center w-full'>
        <div className='mx-auto w-full max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0'>
          <div className='flex flex-col items-center gap-5 sm:gap-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-0'>
            <div className='text-center lg:text-left'>
              <p className='homepage-section-eyebrow'>
                Built for independent artists
              </p>

              <h1 className='marketing-h1-linear hero-gradient-text mt-3 sm:mt-4 lg:mt-5 lg:text-left'>
                The link your music deserves.
              </h1>

              <p className='marketing-lead-linear mx-auto mt-2 max-w-[31rem] text-[15px] text-secondary-token sm:mt-3 sm:text-[18px] md:mt-4 lg:mx-0'>
                Smart links, release automation, and fan insight that keep every
                launch moving.
              </p>

              <div className='mx-auto mt-4 w-full max-w-[27rem] sm:mt-5 md:mt-6 lg:mx-0'>
                <ClaimHandleForm
                  size='hero'
                  submitButtonTestId='homepage-primary-cta'
                />
              </div>

              <p className='mt-2.5 text-[11px] tracking-[0.01em] text-quaternary-token sm:mt-3 lg:text-left'>
                Start free with your artist page and next release ready to go.
              </p>
            </div>

            <div className='relative hidden lg:flex lg:justify-self-end'>
              <div
                style={{
                  filter:
                    'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                }}
              >
                <PhoneShowcase
                  modes={MODES}
                  hideTabs
                  onIndexChange={handleIndexChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav
        className='relative z-10 flex items-center justify-center gap-1 pb-5'
        aria-label='Phone mode tabs'
      >
        {MODES.map((mode, i) => (
          <span
            key={mode.id}
            className='rounded-full px-3 py-1 text-[11px] font-mono tracking-[-0.02em] transition-all duration-300'
            style={{
              backgroundColor:
                i === activeTab ? 'var(--linear-bg-surface-2)' : 'transparent',
              color:
                i === activeTab
                  ? 'var(--linear-text-primary)'
                  : 'var(--linear-text-quaternary)',
              border:
                i === activeTab
                  ? '1px solid var(--linear-border-default)'
                  : '1px solid transparent',
            }}
          >
            {MODE_TAB_LABELS[mode.id] ?? `/${mode.id}`}
          </span>
        ))}
      </nav>
    </section>
  );
}
