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
  const [, setIsYearly] = useState(false);

  const freeFeatures = [
    'Blazing-fast profiles, SEO-optimized',
    'AI-driven personalization (dynamic profiles tailored to visitor location/device/persona)',
    'Constant A/B testing and machine learning to maximize conversion',
    "Smart deep links (/listen, /tip, etc.) for Instagram's multiple link slots",
    'Clean dark/light mode, desktop QR code handoff',
    'App deep links (no browser/login friction)',
    'Analytics focused on conversion (clicks → conversions, referrers, countries)',
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
          <div className='text-center mb-16'>
            <h1
              className='text-4xl sm:text-5xl font-semibold tracking-tight text-neutral-900 dark:text-white leading-[1.1]'
              style={{ fontSynthesisWeight: 'none' }}
            >
              Free forever.
              <br />
              Remove branding for $5.
            </h1>
            <p className='mt-5 text-lg text-neutral-500 dark:text-neutral-400 max-w-xl mx-auto'>
              Your Jovie profile that actually converts. Beautiful, intelligent,
              impossibly fast.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className='grid md:grid-cols-2 gap-6 max-w-4xl mx-auto'>
            {/* Free Plan */}
            <div className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8'>
              <div className='mb-6'>
                <h2
                  className='text-lg font-medium text-neutral-900 dark:text-white'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  Free Forever
                </h2>
                <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
                  Everything you need to create a beautiful profile.
                </p>
              </div>

              <div className='flex items-baseline mb-8'>
                <span
                  className='text-4xl font-semibold text-neutral-900 dark:text-white'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  $0
                </span>
                <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                  /forever
                </span>
              </div>

              <Link
                href='/'
                className='block w-full h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-medium text-center leading-10 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors'
                style={{ fontSynthesisWeight: 'none' }}
              >
                Continue with free
              </Link>

              <div className='mt-8 pt-8 border-t border-neutral-100 dark:border-neutral-800'>
                <p
                  className='text-sm font-medium text-neutral-900 dark:text-white mb-4'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  What&apos;s included:
                </p>
                <ul className='space-y-3'>
                  {freeFeatures.map((feature, index) => (
                    <li key={index} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-400 dark:text-neutral-500 mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-600 dark:text-neutral-400'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Pro Plan */}
            <div className='rounded-xl border border-neutral-900 dark:border-neutral-100 bg-white dark:bg-neutral-900 overflow-hidden relative'>
              {/* Badge */}
              <div
                className='bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium px-3 py-1.5 text-center'
                style={{ fontSynthesisWeight: 'none' }}
              >
                Designed for professionals
              </div>

              <div className='p-8'>
                <div className='mb-6'>
                  <h2
                    className='text-lg font-medium text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    Pro
                  </h2>
                  <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
                    Your brand. Your story. Nothing else.
                  </p>
                </div>

                <div className='mb-8'>
                  <PricingToggle onChange={setIsYearly} />
                </div>

                <button
                  onClick={handleSubscribe}
                  disabled={isLoading}
                  className='w-full h-10 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  {isLoading
                    ? 'Processing...'
                    : isSignedIn
                      ? 'Remove branding →'
                      : 'Upgrade →'}
                </button>

                <div className='mt-8 pt-8 border-t border-neutral-100 dark:border-neutral-800'>
                  <p className='text-sm text-neutral-500 dark:text-neutral-400 mb-4'>
                    All free features, plus:
                  </p>
                  <ul className='space-y-3'>
                    <li className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-900 dark:text-white mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-600 dark:text-neutral-300'>
                        <strong className='text-neutral-900 dark:text-white'>
                          Remove the Jovie branding
                        </strong>{' '}
                        for a clean, professional look
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className='mt-12 max-w-4xl mx-auto'>
            <div className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-8'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6'>
                <div>
                  <h3
                    className='text-lg font-medium text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    Make it yours.
                  </h3>
                  <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
                    Remove the Jovie branding for just $5. That&apos;s it.
                  </p>
                </div>
                <button
                  onClick={handleSubscribe}
                  disabled={isLoading}
                  className='shrink-0 h-10 px-6 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  {isLoading ? 'Processing...' : 'Remove branding →'}
                </button>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className='mt-10 text-center text-sm text-neutral-400 dark:text-neutral-500'>
            All plans include unlimited updates and our 30-day money-back
            guarantee.
          </p>
        </div>
      </Container>
    </div>
  );
}
