import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden min-h-[calc(100svh-var(--linear-header-height))] flex items-center py-14 sm:py-20 lg:py-24 bg-base'>
      {/* Subtle gradient background + vignette */}
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,color-mix(in_oklab,var(--color-accent)_18%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,color-mix(in_oklab,var(--color-accent)_26%,transparent),transparent)]' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,color-mix(in_oklab,var(--color-text-primary-token)_4%,transparent)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_40%,color-mix(in_oklab,var(--color-text-primary-token)_22%,transparent)_100%)]' />
      </div>

      <Container size='md' className='relative'>
        <div className='max-w-3xl mx-auto text-center md:text-left'>
          {/* Badge - moved below */}

          {/* Headline */}
          <h1 className='w-full heading-linear text-[clamp(2.125rem,8vw,4.25rem)] text-primary-token'>
            Turn clicks into streams.
          </h1>

          {/* Subheadline */}
          <p className='mt-5 text-linear text-base sm:text-[1.125rem] text-secondary-token max-w-2xl mx-auto md:mx-0'>
            Jovie replaces your link-in-bio with a profile that turns visitors
            into fans.
          </p>

          {/* CTA */}
          <div className='mt-9 flex flex-col items-center gap-2.5 md:items-start'>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='group inline-flex min-w-[11.5rem] items-center justify-center gap-1.5 h-11 px-5 rounded-[10px] bg-btn-primary text-btn-primary-foreground text-[15px] font-semibold border border-subtle shadow-(--shadow-md) transition-[border,background-color,color,box-shadow,opacity,filter,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-(--shadow-lg) focus-ring-themed'
            >
              Get started free
              <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
            </Link>
            <Link
              href='#how-it-works'
              className='inline-flex items-center justify-center h-9 px-3.5 text-sm font-medium rounded-[8px] bg-transparent text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-colors duration-100 ease-out focus-ring-themed'
            >
              See how it works ↓
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
