'use client';

import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { Button } from '@/components/ui/Button';

export function NewUpgradeTeaser() {
  return (
    <section className='py-12 bg-white dark:bg-black'>
      <Container>
        <div className='max-w-md mx-auto'>
          <div className='relative group'>
            {/* Subtle glow effect on hover */}
            <div className='absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500'></div>

            {/* Card content */}
            <div className='relative p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-300'>
              <div className='text-center'>
                <h3 className='text-xl font-bold text-gray-900 dark:text-white mb-3'>
                  Remove the branding
                </h3>

                <p className='text-gray-600 dark:text-gray-400 mb-6'>
                  $5/mo or $50/yr{' '}
                  <span className='text-green-600 dark:text-green-400 font-medium'>
                    (2 months free)
                  </span>
                </p>

                <Button
                  as={Link}
                  href='/pricing'
                  variant='primary'
                  className='w-full justify-center'
                >
                  Upgrade → Remove Branding
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
