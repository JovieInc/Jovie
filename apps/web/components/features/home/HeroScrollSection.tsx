'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import { HeroDashboardScene } from './HeroDashboardScene';

export function HeroScrollSection() {
  return (
    <section className='relative overflow-hidden pb-0 pt-[6rem] md:pt-[6.65rem] lg:pt-[7.35rem] xl:pt-[7.9rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-[20%] h-[18rem] w-[42rem] -translate-x-1/2 rounded-full blur-3xl md:h-[20rem] md:w-[56rem] xl:w-[62rem]'
        style={{
          background:
            'radial-gradient(circle at center, rgba(113,112,255,0.1), transparent 60%)',
        }}
      />

      <Container size='homepage'>
        <div className='homepage-section-shell max-w-[var(--linear-hero-shell-max)]'>
          <div className='hero-stagger reveal-on-scroll'>
            <div className='max-w-[var(--linear-hero-copy-max)] text-left'>
              <h1 className='marketing-h1-linear max-w-[10.75ch] text-primary-token sm:max-w-[11.2ch] md:max-w-none'>
                <span className='md:block md:whitespace-nowrap'>
                  One link to launch
                </span>
                <span className='md:block md:whitespace-nowrap'>
                  your music career.
                </span>
              </h1>

              <p className='marketing-lead-linear mt-3.5 max-w-[34rem] text-secondary-token md:mt-4.5'>
                Smart links, fan capture, tips, and tour dates, all behind a
                single link.
              </p>

              <div className='mt-5 w-full max-w-[35rem] md:mt-6'>
                <ClaimHandleForm size='display' />
              </div>

              <p className='mt-3 text-[length:var(--linear-label-size)] tracking-[0.01em] text-tertiary-token md:mt-3.5'>
                <span
                  aria-hidden='true'
                  className='mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
                />{' '}
                Start free with smart links and your artist profile.
              </p>
            </div>

            <div className='relative mt-8 w-full sm:mt-10 md:mt-12'>
              <div className='homepage-surface-card relative max-h-[29rem] overflow-hidden rounded-[1rem] sm:max-h-[34rem] md:max-h-[41rem] md:rounded-[1.1rem] lg:max-h-[49rem] xl:max-h-[51rem]'>
                <div className='relative -mb-[var(--linear-hero-scene-offset-sm)] md:-mb-[var(--linear-hero-scene-offset-md)] xl:-mb-[var(--linear-hero-scene-offset-lg)]'>
                  <HeroDashboardScene />
                </div>
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 bottom-0 h-20 md:h-24'
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(8,9,10,0) 0%, rgba(8,9,10,0.26) 40%, var(--linear-bg-page) 100%)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
