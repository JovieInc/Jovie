import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { HeroExampleProfiles } from './HeroExampleProfiles';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden py-20 sm:py-28 lg:py-32'>
      <Container className='relative'>
        <div className='max-w-2xl mx-auto text-center'>
          {/* Headline */}
          <h1 className='text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-4xl lg:text-5xl'>
            Your music.{' '}
            <span className='text-neutral-500 dark:text-neutral-400'>
              One link.
            </span>
          </h1>

          {/* Subheadline */}
          <p className='mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-lg max-w-lg mx-auto'>
            A fast, beautiful profile to share your music, merch, and socials.
            Built for artists who want to convert fans.
          </p>

          {/* Waitlist CTA */}
          <div className='mt-8 flex flex-col sm:flex-row items-center gap-4 justify-center'>
            <Link
              href='/waitlist'
              className='inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md bg-white text-black text-sm font-medium transition-all duration-200 hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black dark:bg-white dark:text-black dark:hover:bg-neutral-200'
              style={{ fontSynthesisWeight: 'none' }}
            >
              Join the waitlist
              <ArrowRight className='h-4 w-4' />
            </Link>
            <p className='text-sm text-neutral-500 dark:text-neutral-400'>
              Free to start. No credit card required.
            </p>
          </div>

          {/* Example profiles carousel */}
          <HeroExampleProfiles />
        </div>
      </Container>
    </section>
  );
}
