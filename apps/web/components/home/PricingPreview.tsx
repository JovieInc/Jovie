import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function PricingPreview() {
  return (
    <section className='py-20 bg-neutral-50 dark:bg-neutral-900'>
      <Container size='md'>
        <div className='text-center mb-12'>
          <h2
            className='text-3xl sm:text-4xl font-medium tracking-tight text-neutral-900 dark:text-white'
            style={{ fontSynthesisWeight: 'none' }}
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
              style={{ fontSynthesisWeight: 'none' }}
            >
              Free
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={{ fontSynthesisWeight: 'none' }}
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
              style={{ fontSynthesisWeight: 'none' }}
            >
              Pro
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={{ fontSynthesisWeight: 'none' }}
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
              style={{ fontSynthesisWeight: 'none' }}
            >
              Growth
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={{ fontSynthesisWeight: 'none' }}
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
            style={{ fontSynthesisWeight: 'none' }}
          >
            View pricing →
          </Link>
        </div>
      </Container>
    </section>
  );
}
