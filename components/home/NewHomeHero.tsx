import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden min-h-svh flex items-center py-16 sm:py-20 lg:py-24 bg-base dark:bg-[#08090a]'>
      {/* Subtle gradient background + vignette */}
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.15),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.25),transparent)]' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.03)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)]' />
      </div>

      <Container className='relative'>
        <div className='max-w-4xl mx-auto text-center md:text-left'>
          {/* Badge - moved below */}
          <div className='mb-6 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-full bg-surface-1 text-secondary-token border border-subtle'>
            <span className='relative flex h-1.5 w-1.5'>
              <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75' />
              <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500' />
            </span>
            AI Powered Creator Profiles
          </div>

          {/* Headline */}
          <h1 className='w-full text-balance text-[2.5rem] font-medium leading-[1.1] tracking-[-0.022em] text-primary-token opacity-95 sm:text-[3.5rem] lg:text-[4rem]'>
            <span className='sm:block'>Convert social traffic </span>
            <span className='sm:block'>into superfans.</span>
          </h1>

          {/* Subheadline */}
          <p className='mt-6 text-[1.0625rem] leading-[1.6] tracking-[0em] text-tertiary-token sm:text-[1.125rem] max-w-156 mx-auto md:mx-0'>
            Personalized profiles that capture identity
            <br />
            and follow up automatically.
          </p>

          {/* CTA */}
          <div className='mt-8 flex flex-col items-center gap-3 md:items-start'>
            <Link
              href='/waitlist'
              className='group inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[10px] bg-btn-primary text-btn-primary-foreground text-[15px] font-medium border border-black/5 dark:border-white/10 shadow-[0_8px_2px_0px_transparent,0_5px_2px_0px_rgba(0,0,0,0.01),0_3px_2px_0px_rgba(0,0,0,0.04),0_1px_1px_0px_rgba(0,0,0,0.07),0_0px_1px_0px_rgba(0,0,0,0.08)] transition-[border,background-color,color,box-shadow,opacity,filter,transform] duration-150 ease-out hover:opacity-95 focus-ring-themed'
            >
              Request early access
              <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
            </Link>
            <Link
              href='#how-it-works'
              className='inline-flex items-center justify-center h-8 px-3 text-[13px] font-medium rounded-[8px] bg-transparent text-tertiary-token hover:text-primary-token hover:bg-black/4 dark:hover:bg-white/8 transition-colors duration-100 ease-out'
            >
              See how it works ↓
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
