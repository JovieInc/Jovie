import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden min-h-svh flex items-center py-16 sm:py-20 lg:py-24 bg-base'>
      {/* Subtle gradient background + vignette */}
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,color-mix(in_oklab,var(--color-accent)_18%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,color-mix(in_oklab,var(--color-accent)_26%,transparent),transparent)]' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,color-mix(in_oklab,var(--color-text-primary-token)_4%,transparent)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_40%,color-mix(in_oklab,var(--color-text-primary-token)_22%,transparent)_100%)]' />
      </div>

      <Container size='md' className='relative'>
        <div className='max-w-4xl mx-auto text-center md:text-left'>
          {/* Badge - moved below */}

          {/* Headline */}
          <h1 className='w-full heading-linear text-[2.5rem] text-primary-token sm:text-[3.5rem] lg:text-[4rem]'>
            Turn clicks into streams.
          </h1>

          {/* Subheadline */}
          <p className='mt-6 text-linear text-[1.0625rem] text-tertiary-token sm:text-[1.125rem] max-w-156 mx-auto md:mx-0'>
            Jovie replaces your link-in-bio with a profile that turns visitors
            into fans.
          </p>

          {/* CTA */}
          <div className='mt-8 flex flex-col items-center gap-3 md:items-start'>
            <Link
              href='/signup'
              className='group inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[10px] bg-btn-primary text-btn-primary-foreground text-[15px] font-medium border border-subtle shadow-(--shadow-sm) transition-[border,background-color,color,box-shadow,opacity,filter,transform] duration-150 ease-out hover:opacity-95 focus-ring-themed'
            >
              Get started free
              <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
            </Link>
            <Link
              href='#how-it-works'
              className='inline-flex items-center justify-center h-8 px-3 text-[13px] font-medium rounded-[8px] bg-transparent text-tertiary-token hover:text-primary-token hover:bg-surface-2 transition-colors duration-100 ease-out'
            >
              See how it works ↓
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
