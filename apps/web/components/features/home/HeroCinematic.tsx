import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';
import { HeroClaimHandle } from './HeroClaimHandle';
import { HeroDesktopPreviewMount } from './HeroDesktopPreviewMount';

interface HeroCinematicProps {
  readonly fullScreen?: boolean;
  readonly primaryAction?: ReactNode;
}

export function HeroCinematic({
  fullScreen = false,
  primaryAction,
}: Readonly<HeroCinematicProps>) {
  const heroPrimaryAction = primaryAction ?? (
    <HeroClaimHandle submitButtonTestId='homepage-primary-cta' />
  );

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
          <div className='mx-auto max-w-[1200px]'>
            <div className='hero-stagger'>
              <div className='flex max-lg:flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16'>
                <div className='max-w-[44rem] max-lg:text-center lg:flex-1 lg:text-left'>
                  <p className='homepage-section-eyebrow'>
                    Built for independent artists
                  </p>

                  <h1
                    className='marketing-h1-linear hero-gradient-text mt-5 lg:text-left'
                    data-testid='hero-heading'
                  >
                    The link your music deserves.
                  </h1>

                  <p className='marketing-lead-linear max-lg:mx-auto mt-4 max-w-[31rem] text-secondary-token md:mt-5 lg:mx-0'>
                    Smart links, release automation, and fan insight that keep
                    every launch moving.
                  </p>

                  <div className='max-lg:mx-auto mt-6 w-full max-w-[27rem] md:mt-7 lg:mx-0'>
                    {heroPrimaryAction}
                  </div>

                  <p className='mt-3.5 text-[11px] tracking-[0.01em] text-quaternary-token md:mt-4 lg:text-left'>
                    Private launch access with your artist page and next release
                    ready to go.
                  </p>
                </div>

                <div className='relative flex-shrink-0 lg:flex-none'>
                  <div
                    style={{
                      filter:
                        'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                    }}
                  >
                    <HeroDesktopPreviewMount />
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
      className='relative overflow-hidden lg:flex lg:h-[calc(100dvh-var(--linear-header-height))] lg:flex-col'
      data-testid='homepage-shell'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0 max-lg:hidden' />

      <div className='relative z-10 mx-auto w-full max-w-[var(--linear-content-max)] px-5 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10 lg:hidden'>
        <div className='max-w-[30rem] text-left'>
          <p className='homepage-section-eyebrow'>
            Built for independent artists
          </p>

          <h1
            className='marketing-h1-linear mt-3 text-left text-primary-token sm:mt-4'
            data-testid='hero-heading'
          >
            <span className='block'>The link your music</span>
            <span className='block'>deserves.</span>
          </h1>

          <p className='marketing-lead-linear mt-2 max-w-[28rem] text-secondary-token sm:mt-3'>
            Smart links, release automation, and fan insight that keep every
            launch moving.
          </p>

          <div className='mt-4 w-full max-w-[27rem] sm:mt-5'>
            {heroPrimaryAction}
          </div>

          <p className='mt-2.5 text-[11px] tracking-[0.01em] text-quaternary-token sm:mt-3'>
            Private launch access with your artist page and next release ready
            to go.
          </p>
        </div>
      </div>

      <div className='relative z-10 max-lg:hidden min-h-0 flex-1 items-center justify-center w-full lg:flex'>
        <div className='mx-auto w-full max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0'>
          <div className='grid grid-cols-2 items-center gap-0'>
            <div className='max-w-[31rem] text-left'>
              <p className='homepage-section-eyebrow'>
                Built for independent artists
              </p>

              <h1
                className='marketing-h1-linear hero-gradient-text mt-3 max-w-[11ch] text-left sm:mt-4 lg:mt-5'
                data-testid='hero-heading'
              >
                The link your music deserves.
              </h1>

              <p className='marketing-lead-linear mt-2 max-w-[30rem] text-[15px] text-secondary-token sm:mt-3 sm:text-[18px] md:mt-4'>
                Smart links, release automation, and fan insight that keep every
                launch moving.
              </p>

              <div className='mt-4 w-full max-w-[27rem] sm:mt-5 md:mt-6'>
                {heroPrimaryAction}
              </div>

              <p className='mt-2.5 text-[11px] tracking-[0.01em] text-quaternary-token sm:mt-3'>
                Private launch access with your artist page and next release
                ready to go.
              </p>
            </div>

            <div className='relative justify-self-end'>
              <div
                style={{
                  filter:
                    'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                }}
              >
                <HeroDesktopPreviewMount />
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav
        className='relative z-10 max-lg:hidden items-center justify-center gap-1 pb-5 lg:flex'
        aria-label='Phone mode tabs'
      >
        {['/profile', '/tour', '/tip', '/listen'].map((label, i) => (
          <span
            key={label}
            className='rounded-full px-3 py-1 text-[11px] font-mono tracking-[-0.02em] transition-all duration-slower'
            style={{
              backgroundColor:
                i === 0 ? 'var(--linear-bg-surface-2)' : 'transparent',
              color:
                i === 0
                  ? 'var(--linear-text-primary)'
                  : 'var(--linear-text-quaternary)',
              border:
                i === 0
                  ? '1px solid var(--linear-border-default)'
                  : '1px solid transparent',
            }}
          >
            {label}
          </span>
        ))}
      </nav>
    </section>
  );
}
