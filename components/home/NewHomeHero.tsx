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
        <div className='max-w-5xl lg:max-w-6xl mx-auto text-center md:text-left'>
          <p className='text-sm font-semibold tracking-tight text-primary-token'>
            Jovie
          </p>

          {/* Headline */}
          <h1 className='mt-4 text-balance mx-auto md:mx-0 max-w-[28ch] text-[clamp(2.25rem,4.2vw,3.6rem)] font-semibold tracking-[-0.03em] leading-[1.05] text-primary-token'>
            Turn bio link traffic into fans you can reach — and revenue you can
            measure.
          </h1>

          {/* Subheadline */}
          <p className='mt-5 text-lg leading-relaxed text-secondary-token sm:text-xl max-w-2xl mx-auto md:mx-0'>
            Jovie is an AI-optimized artist profile that personalizes what each
            fan sees, captures email/SMS, and follows up automatically to drive
            streams, merch, and ticket sales.
          </p>

          {/* CTA */}
          <div className='mt-8 flex flex-col items-center gap-3 md:items-start'>
            <Link
              href='/waitlist'
              className='group inline-flex items-center justify-center gap-2 h-14 px-10 rounded-full bg-btn-primary text-btn-primary-foreground text-base font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg focus-ring-themed'
            >
              Get early access
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
