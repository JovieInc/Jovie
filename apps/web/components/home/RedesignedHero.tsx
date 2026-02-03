import { ArrowRight } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function RedesignedHero() {
  return (
    <section className='relative min-h-[85vh] flex items-center justify-center overflow-hidden bg-base text-primary-token'>
      <Container size='homepage' className='relative z-10'>
        <div className='flex flex-col items-center text-center max-w-3xl mx-auto'>
          <div className='space-y-5'>
            {/* Eyebrow */}
            <p className='text-[13px] leading-5 font-[510] text-accent tracking-wide uppercase'>
              Your AI for music
            </p>

            {/* H1 - Linear Typography */}
            <h1 className='text-balance text-[40px] leading-[1.08] tracking-[-0.022em] font-[510] text-primary-token sm:text-[52px] sm:leading-[1.08] lg:text-[64px] lg:leading-[1.06]'>
              Meet Jovie
            </h1>

            {/* Lead - Secondary color hierarchy */}
            <p className='max-w-xl mx-auto text-[16px] leading-[27px] font-normal text-secondary-token sm:text-[17px]'>
              The AI that turns your music into a career.
              <br className='hidden sm:block' />
              One profile. Every fan. No busywork.
            </p>
          </div>

          {/* CTAs - Linear button treatment */}
          <div className='mt-7 flex flex-col sm:flex-row items-center justify-center gap-3'>
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
              href='#brand-promise'
              className='h-10 px-4 rounded-[10px] text-[15px] leading-[40px] font-[510] text-tertiary-token hover:text-primary-token hover:bg-[var(--color-interactive-hover)]'
            >
              See how it works ↓
            </LinearButton>
          </div>

          {/* Supporting text - Tertiary */}
          <p className='mt-5 text-[13px] leading-5 font-[510] text-tertiary-token'>
            Free to start. Zero setup.
          </p>
        </div>
      </Container>

      {/* Bottom border - Linear style */}
      <div className='absolute bottom-0 left-0 right-0 h-px border-b border-subtle' />
    </section>
  );
}
