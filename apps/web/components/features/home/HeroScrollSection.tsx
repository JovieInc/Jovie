'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import { HeroDashboardScene } from './HeroDashboardScene';

export function HeroScrollSection() {
  return (
    <section className='relative overflow-hidden px-5 pb-2 pt-[7.5rem] sm:px-6 md:pt-[8.2rem] md:pb-4 xl:pt-[9rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-[22%] h-[20rem] w-[62rem] -translate-x-1/2 rounded-full blur-3xl'
        style={{
          background:
            'radial-gradient(circle at center, rgba(113,112,255,0.1), transparent 60%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='hero-stagger reveal-on-scroll'>
            <div className='max-w-[42rem] text-left'>
              <h1 className='marketing-h1-linear max-w-[13ch] text-primary-token'>
                <span className='block'>One link to launch</span>
                <span className='block'>your music career.</span>
              </h1>

              <p className='marketing-lead-linear mt-4 max-w-[33rem] text-balance text-secondary-token'>
                Smart links, fan capture, tips, and tour dates, all behind a
                single link.
              </p>

              <div className='mt-7 w-full max-w-[35rem]'>
                <ClaimHandleForm size='display' />
              </div>

              <p className='mt-4 text-[length:var(--linear-label-size)] tracking-[0.01em] text-tertiary-token'>
                <span
                  aria-hidden='true'
                  className='mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
                />{' '}
                Start free with smart links and your artist profile.
              </p>
            </div>

            <div className='relative mt-12 w-full sm:mt-14'>
              <div className='relative overflow-hidden rounded-[0.95rem] md:rounded-[1rem]'>
                <div className='relative -mb-[4.5rem] md:-mb-20 xl:-mb-24'>
                  <HeroDashboardScene />
                </div>
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 bottom-0 h-24 md:h-28'
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
