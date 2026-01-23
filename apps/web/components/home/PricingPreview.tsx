import Link from 'next/link';
import { Container } from '@/components/site/Container';

// Extracted static style to avoid creating new object on each render
const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;

export function PricingPreview() {
  return (
    <section className='py-20 bg-neutral-50 dark:bg-neutral-900'>
      <Container size='md'>
        <div className='text-center mb-12'>
          <h2
            className='text-3xl sm:text-4xl font-medium tracking-tight text-neutral-900 dark:text-white'
            style={FONT_SYNTHESIS_STYLE}
          >
            Simple, transparent pricing
          </h2>
          <p className='mt-4 text-lg text-neutral-500 dark:text-neutral-400'>
            Start free. Scale as you grow.
          </p>
        </div>

        <div className='grid md:grid-cols-3 gap-8 max-w-4xl mx-auto'>
          {/* Free Tier */}
          <div className='text-center'>
            <h3
              className='text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              Free
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              $0
            </p>
            <p className='text-sm text-neutral-600 dark:text-neutral-400'>
              Branded profile
            </p>
          </div>

          {/* Pro Tier */}
          <div className='text-center'>
            <h3
              className='text-sm font-medium uppercase tracking-wide text-neutral-900 dark:text-white mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              Pro
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              $39
            </p>
            <p className='text-sm text-neutral-600 dark:text-neutral-400'>
              Your identity. Your data.
            </p>
          </div>

          {/* Growth Tier */}
          <div className='text-center'>
            <h3
              className='text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              Growth
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              $99
            </p>
            <p className='text-sm text-neutral-600 dark:text-neutral-400'>
              Automation + retargeting
            </p>
          </div>
        </div>

        <div className='text-center mt-10'>
          <Link
            href='/pricing'
            className='inline-block px-6 py-3 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors'
            style={FONT_SYNTHESIS_STYLE}
          >
            View pricing →
          </Link>
        </div>
      </Container>
    </section>
  );
}
