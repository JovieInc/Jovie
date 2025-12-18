'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewPreFooterCTA() {
  return (
    <section className='relative py-20 sm:py-24 bg-surface-0 border-t border-subtle overflow-hidden'>
      <div className='absolute inset-0 grid-bg dark:grid-bg-dark opacity-60' />
      <div className='absolute inset-x-0 top-0 h-20 bg-[linear-gradient(to_bottom,var(--color-bg-surface-0),transparent)]' />
      <div className='absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(to_top,var(--color-bg-surface-0),transparent)]' />
      <Container className='relative'>
        <div className='mx-auto max-w-4xl'>
          <div className='rounded-3xl border border-subtle bg-base p-8 sm:p-12 text-center'>
            <div className='inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-0 px-3 py-1 text-xs font-medium text-secondary-token'>
              Ready to start
            </div>

            <h2 className='mt-6 text-3xl sm:text-4xl font-semibold tracking-tight text-primary-token'>
              Ready to claim{' '}
              <span className='text-accent-token'>your @handle</span>?
            </h2>

            <p className='mt-3 text-sm sm:text-base text-secondary-token'>
              Create your profile in 60 seconds. Start converting today.
            </p>

            <div className='mt-8 flex flex-col sm:flex-row items-center justify-center gap-3'>
              <Button asChild size='lg' variant='primary'>
                <Link href='/waitlist'>Request early access</Link>
              </Button>
              <Button asChild size='lg' variant='secondary'>
                <Link href='#how-it-works'>See how it works</Link>
              </Button>
            </div>

            <p className='mt-4 text-xs text-tertiary-token'>60-second setup</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
