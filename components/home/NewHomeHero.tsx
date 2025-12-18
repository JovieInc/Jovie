import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden min-h-svh flex items-center py-16 sm:py-20 lg:py-24'>
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
          <h1 className='text-4xl font-medium tracking-tight text-primary-token sm:text-6xl lg:text-7xl leading-[1.05]'>
            <span className='sm:block'>Convert social traffic </span>
            <span className='sm:block'>into superfans.</span>
          </h1>

          {/* Subheadline */}
          <p className='mt-5 text-lg leading-relaxed text-secondary-token sm:text-xl max-w-2xl mx-auto md:mx-0'>
            Personalized profiles that capture identity
            <br />
            and follow up automatically.
          </p>

          <p className='mt-4 text-sm text-tertiary-token max-w-2xl mx-auto md:mx-0'>
            Built for independent and emerging artists who drive traffic from
            social platforms.
          </p>

          {/* CTA */}
          <div className='mt-8 flex flex-col items-center gap-3 md:items-start'>
            <Link
              href='/waitlist'
              className='group inline-flex items-center justify-center gap-2 h-14 px-10 rounded-md bg-btn-primary text-btn-primary-foreground text-base font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg focus-ring-themed'
            >
              Request early access
              <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
            </Link>
            <Link
              href='#how-it-works'
              className='text-xs text-secondary-token hover:text-primary-token transition-colors'
            >
              See how it works ↓
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
