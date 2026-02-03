'use client';

import { ArrowRight } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';
import { BRAND } from '@/constants/app';

export function ProfilesHero() {
  return (
    <section className='relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-base text-primary-token'>
      <Container size='homepage' className='relative z-10'>
        <div className='flex flex-col items-center text-center max-w-3xl mx-auto'>
          <div className='space-y-5'>
            {/* Eyebrow */}
            <p className='text-[13px] leading-5 font-[510] text-accent tracking-wide uppercase'>
              {BRAND.product.name}
            </p>

            {/* H1 */}
            <h1 className='text-balance text-[40px] leading-[1.08] tracking-[-0.022em] font-[510] text-primary-token sm:text-[52px] sm:leading-[1.08] lg:text-[56px] lg:leading-[1.06]'>
              {BRAND.product.tagline}
            </h1>

            {/* Lead */}
            <p className='max-w-xl mx-auto text-[16px] leading-[27px] font-normal text-secondary-token sm:text-[17px]'>
              One link that captures fans, routes them to their preferred
              platform, and updates itself with every release.
            </p>
          </div>

          {/* Feature highlights */}
          <div className='mt-8 flex flex-wrap justify-center gap-4 text-sm text-tertiary-token'>
            <span className='flex items-center gap-1.5'>
              <span className='w-1.5 h-1.5 rounded-full bg-green-500' />
              Auto-updating releases
            </span>
            <span className='flex items-center gap-1.5'>
              <span className='w-1.5 h-1.5 rounded-full bg-violet-500' />
              Built-in fan capture
            </span>
            <span className='flex items-center gap-1.5'>
              <span className='w-1.5 h-1.5 rounded-full bg-blue-500' />
              Smart platform routing
            </span>
          </div>

          {/* CTAs */}
          <div className='mt-8 flex flex-col sm:flex-row items-center justify-center gap-3'>
            <LinearButton
              variant='primary'
              href='/waitlist'
              className='btn-linear-primary'
            >
              Request early access
              <ArrowRight className='h-4 w-4 ml-1.5' />
            </LinearButton>
            <LinearButton
              variant='secondary'
              href='#benefits'
              className='h-10 px-4 rounded-[10px] text-[15px] leading-[40px] font-[510] text-tertiary-token hover:text-primary-token hover:bg-[var(--color-interactive-hover)]'
            >
              See features ↓
            </LinearButton>
          </div>

          {/* Supporting text */}
          <p className='mt-5 text-[13px] leading-5 font-[510] text-tertiary-token'>
            Free to start. Zero setup. Powered by Jovie AI.
          </p>
        </div>
      </Container>

      {/* Bottom border */}
      <div className='absolute bottom-0 left-0 right-0 h-px border-b border-subtle' />
    </section>
  );
}
