'use client';

import { Button } from '@jovie/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewUpgradeTeaser() {
  return (
    <section className='py-16 sm:py-20 bg-white dark:bg-[#0D0E12]'>
      <Container>
        <div className='max-w-lg mx-auto'>
          <div className='relative rounded-2xl border border-neutral-200/60 dark:border-white/10 bg-white/60 dark:bg-white/3 p-8 sm:p-10 transition-shadow duration-200 hover:shadow-sm hover:shadow-neutral-900/5 dark:hover:shadow-black/30'>
            {/* Badge */}
            <div className='flex justify-center mb-6'>
              <span className='inline-flex items-center px-3 py-1 text-xs font-medium tracking-wide uppercase text-neutral-500 dark:text-neutral-400 bg-neutral-100/80 dark:bg-white/5 rounded-full border border-neutral-200/60 dark:border-white/10'>
                Standard
              </span>
            </div>

            {/* Heading */}
            <h3 className='text-center text-lg sm:text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100'>
              Remove Jovie branding
            </h3>

            {/* Pricing */}
            <div className='mt-4 flex items-baseline justify-center gap-2'>
              <span className='text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900 dark:text-white'>
                $5
              </span>
              <span className='text-sm text-neutral-500 dark:text-neutral-400'>
                /month
              </span>
            </div>

            <p className='mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400'>
              or $50/year{' '}
              <span className='text-emerald-600 dark:text-emerald-400 font-medium'>
                — save 2 months
              </span>
            </p>

            {/* CTA */}
            <div className='mt-8'>
              <Button
                asChild
                variant='primary'
                className='w-full justify-center gap-2 h-11 text-sm font-medium'
              >
                <Link href='/billing/remove-branding'>
                  Upgrade to Standard
                  <ArrowRight className='h-4 w-4' />
                </Link>
              </Button>
            </div>

            {/* Footer note */}
            <p className='mt-4 text-center text-xs text-neutral-400 dark:text-neutral-500'>
              Cancel anytime. No questions asked.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
