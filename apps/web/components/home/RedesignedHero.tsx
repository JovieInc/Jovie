import { ArrowRight } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function RedesignedHero() {
  return (
    <section className='relative min-h-[85vh] flex items-center justify-center overflow-hidden bg-white text-[#0c0c0c] dark:bg-[#08090a] dark:text-[#f7f8f8]'>
      <Container size='homepage' className='relative z-10'>
        <div className='flex flex-col items-center text-center max-w-3xl mx-auto'>
          <div className='space-y-5'>
            {/* H1 - Linear Typography */}
            <h1 className='text-balance text-[40px] leading-[1.08] tracking-[-0.022em] font-[510] text-[#0c0c0c] dark:text-[#f7f8f8] sm:text-[52px] sm:leading-[1.08] lg:text-[64px] lg:leading-[1.06]'>
              The link in bio your music deserves
            </h1>

            {/* Lead - Secondary color hierarchy */}
            <p className='max-w-xl mx-auto text-[16px] leading-[27px] font-normal text-[#52565e] dark:text-[#8a8f98] sm:text-[17px]'>
              Capture every fan with an AI-powered profile that updates itself.
            </p>
          </div>

          {/* CTAs - Linear button treatment */}
          <div className='mt-7 flex flex-col sm:flex-row items-center justify-center gap-3'>
            <LinearButton
              variant='primary'
              href='/waitlist'
              className='h-10 px-4 rounded-[10px] text-[15px] leading-[40px] font-[510] text-[#08090a] bg-[#e6e6e6] border border-[#e6e6e6] shadow-[rgba(0,0,0,0)_0px_8px_2px_0px,rgba(0,0,0,0.01)_0px_5px_2px_0px,rgba(0,0,0,0.04)_0px_3px_2px_0px,rgba(0,0,0,0.07)_0px_1px_1px_0px,rgba(0,0,0,0.08)_0px_0px_1px_0px] hover:opacity-95'
            >
              Request early access
              <ArrowRight className='h-4 w-4 ml-1.5' />
            </LinearButton>
            <LinearButton
              variant='secondary'
              href='#how-it-works'
              className='h-10 px-4 rounded-[10px] text-[15px] leading-[40px] font-[510] text-[#8a8f98] hover:text-[#f7f8f8] dark:text-[#8a8f98] dark:hover:text-[#f7f8f8] hover:bg-black/5 dark:hover:bg-white/5'
            >
              See how it works ↓
            </LinearButton>
          </div>

          {/* Supporting text - Tertiary */}
          <p className='mt-5 text-[13px] leading-5 font-[510] text-[#8a8f98]'>
            Free to start. Zero setup.
          </p>
        </div>
      </Container>

      {/* Bottom border - Linear style */}
      <div className='absolute bottom-0 left-0 right-0 h-px bg-black/10 dark:bg-white/10' />
    </section>
  );
}
