import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden py-24 sm:py-32 lg:py-40'>
      <Container className='relative'>
        <div className='max-w-3xl mx-auto text-center'>
          {/* Headline */}
          <h1
            className='text-4xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-5xl lg:text-6xl'
            style={{ fontSynthesisWeight: 'none' }}
          >
            Make Them Listen.
          </h1>

          {/* Subheadline */}
          <p className='mt-6 text-base leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-lg max-w-2xl mx-auto'>
            Jovie&apos;s AI learns from every visitor and nudges them from
            casual interest to repeat listener, paying customer, and loyal fan —
            automatically.
          </p>

          {/* CTA */}
          <div className='mt-10 flex flex-col items-center gap-4'>
            <Link
              href='/waitlist'
              className='inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-white text-black text-sm font-medium transition-all duration-200 hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black dark:bg-white dark:text-black dark:hover:bg-neutral-200'
              style={{ fontSynthesisWeight: 'none' }}
            >
              Request Early Access
              <ArrowRight className='h-4 w-4' />
            </Link>
            <p className='text-sm text-neutral-500 dark:text-neutral-500 max-w-sm'>
              Invite-only. Early creator onboarding is curated and released in
              limited batches.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
