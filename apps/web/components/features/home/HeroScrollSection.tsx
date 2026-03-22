'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import { HeroDashboardScene } from './HeroDashboardScene';

export function HeroScrollSection() {
  return (
    <section className='relative overflow-hidden pb-0 pt-[6rem] md:pt-[6.65rem] lg:pt-[7.35rem] xl:pt-[7.9rem]'>
      {/* Subtle dark backdrop */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />

      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-hero-shell-max)]'>
          <div className='hero-stagger'>
            {/* Centered hero copy — Linear pattern */}
            <div className='mx-auto max-w-3xl text-center'>
              <h1 className='marketing-h1-linear text-primary-token'>
                The link your music <br className='hidden md:block' />
                deserves.
              </h1>

              <p className='marketing-lead-linear mx-auto mt-4 max-w-[34rem] text-secondary-token md:mt-5'>
                Share every release. Reach every fan. Automatically.
              </p>

              <div className='mx-auto mt-5 w-full max-w-[28rem] md:mt-6'>
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

            {/* Full-width product mockup — let it breathe like Linear */}
            <div className='relative mt-10 w-full md:mt-14'>
              <div className='homepage-surface-card relative overflow-hidden rounded-[1rem] md:rounded-[1.1rem]'>
                <HeroDashboardScene />
                {/* Gentle bottom fade — subtle, not aggressive */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 bottom-0 h-16 md:h-20'
                  style={{
                    background:
                      'linear-gradient(180deg, transparent 0%, rgba(8,9,10,0.5) 70%, var(--linear-bg-page) 100%)',
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
