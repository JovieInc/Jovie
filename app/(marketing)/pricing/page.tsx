'use client';

import { useAuth } from '@clerk/nextjs';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PricingToggle } from '@/components/pricing/PricingToggle';
import { Container } from '@/components/site/Container';

export default function PricingPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isYearly, setIsYearly] = useState(false);

  const freeFeatures = [
    'Blazing-fast profiles, SEO-optimized',
    'AI-driven personalization',
    'Smart deep links (/listen, /tip, etc.)',
    'Clean dark/light mode',
    'App deep links (no browser friction)',
    'Conversion-focused analytics',
    'Unique Jovie handle (jov.ie/yourname)',
  ];

  const handleSubscribe = async () => {
    if (!isSignedIn) {
      router.push('/signup');
      return;
    }

    setIsLoading(true);
    try {
      router.push('/billing/remove-branding');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-white dark:bg-[#0a0a0b]'>
      <Container size='md'>
        <div className='py-20 sm:py-28'>
          {/* Header */}
          <div className='text-center mb-12'>
            <h1
              className='text-4xl sm:text-5xl font-semibold tracking-tight text-neutral-900 dark:text-white leading-[1.1]'
              style={{ fontSynthesisWeight: 'none' }}
            >
              Simple pricing
            </h1>
            <p className='mt-4 text-lg text-neutral-500 dark:text-neutral-400 max-w-lg mx-auto'>
              Free forever. Pay only to remove branding.
            </p>
          </div>

          {/* Single pricing card */}
          <div className='max-w-2xl mx-auto'>
            <div className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden'>
              {/* Two columns inside one card */}
              <div className='grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200 dark:divide-neutral-800'>
                {/* Free tier */}
                <div className='p-8'>
                  <div className='mb-4'>
                    <span className='text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400'>
                      Free
                    </span>
                  </div>
                  <div className='flex items-baseline mb-6'>
                    <span
                      className='text-4xl font-semibold text-neutral-900 dark:text-white'
                      style={{ fontSynthesisWeight: 'none' }}
                    >
                      $0
                    </span>
                    <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                      forever
                    </span>
                  </div>
                  <Link
                    href='/'
                    className='block w-full h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-medium text-center leading-10 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    Get started
                  </Link>
                  <ul className='mt-6 space-y-2.5'>
                    {freeFeatures.map((feature, index) => (
                      <li key={index} className='flex items-start gap-2.5'>
                        <Check className='w-4 h-4 text-neutral-400 dark:text-neutral-500 mt-0.5 shrink-0' />
                        <span className='text-sm text-neutral-600 dark:text-neutral-400'>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pro tier */}
                <div className='p-8 bg-neutral-50 dark:bg-neutral-800/50'>
                  <div className='mb-4'>
                    <span className='text-xs font-medium uppercase tracking-wide text-neutral-900 dark:text-white'>
                      Pro
                    </span>
                  </div>
                  <div className='flex items-baseline mb-2'>
                    <span
                      className='text-4xl font-semibold text-neutral-900 dark:text-white'
                      style={{ fontSynthesisWeight: 'none' }}
                    >
                      {isYearly ? '$50' : '$5'}
                    </span>
                    <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                      /{isYearly ? 'year' : 'month'}
                    </span>
                  </div>
                  <div className='mb-6'>
                    <PricingToggle onChange={setIsYearly} />
                  </div>
                  <button
                    onClick={handleSubscribe}
                    disabled={isLoading}
                    className='w-full h-10 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    {isLoading ? 'Processing...' : 'Remove branding →'}
                  </button>
                  <ul className='mt-6 space-y-2.5'>
                    <li className='flex items-start gap-2.5'>
                      <Check className='w-4 h-4 text-neutral-900 dark:text-white mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-700 dark:text-neutral-300'>
                        Everything in Free
                      </span>
                    </li>
                    <li className='flex items-start gap-2.5'>
                      <Check className='w-4 h-4 text-neutral-900 dark:text-white mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-700 dark:text-neutral-300'>
                        <strong>No Jovie branding</strong>
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer note */}
            <p className='mt-6 text-center text-sm text-neutral-400 dark:text-neutral-500'>
              30-day money-back guarantee. Cancel anytime.
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
