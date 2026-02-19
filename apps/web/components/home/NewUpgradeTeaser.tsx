'use client';

import { Button } from '@jovie/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewUpgradeTeaser() {
  return (
    <section className='py-16 sm:py-20 bg-base'>
      <Container>
        <div className='max-w-lg mx-auto'>
          <div className='relative rounded-xl border border-subtle bg-surface-1 p-8 sm:p-10'>
            {/* Badge */}
            <div className='flex justify-center mb-6'>
              <span className='inline-flex items-center px-3 py-1 text-xs font-medium tracking-wide uppercase text-secondary-token bg-surface-2 border border-subtle rounded-full'>
                Pro
              </span>
            </div>

            {/* Heading */}
            <h3 className='text-center text-lg sm:text-xl font-semibold tracking-tight text-primary-token'>
              Remove Jovie branding
            </h3>

            {/* Pricing */}
            <div className='mt-4 flex items-baseline justify-center gap-2'>
              <span className='text-3xl sm:text-4xl font-semibold tracking-tight text-primary-token'>
                $39
              </span>
              <span className='text-sm text-secondary-token'>/month</span>
            </div>

            <p className='mt-2 text-center text-sm text-secondary-token'>
              or $348/year{' '}
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
                  Upgrade to Pro
                  <ArrowRight className='h-4 w-4' />
                </Link>
              </Button>
            </div>

            {/* Footer note */}
            <p className='mt-4 text-center text-xs text-tertiary-token'>
              Cancel anytime. No questions asked.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
