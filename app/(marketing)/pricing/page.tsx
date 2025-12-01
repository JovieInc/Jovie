'use client';

import { useAuth } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FeatureList } from '@/components/pricing/FeatureList';
import { PricingCTA } from '@/components/pricing/PricingCTA';
import { PricingToggle } from '@/components/pricing/PricingToggle';
import { Container } from '@/components/site/Container';

export default function PricingPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [, setIsYearly] = useState(false);

  const freeFeatures = [
    { title: 'Blazing-fast profiles, SEO-optimized' },
    {
      title:
        'AI-driven personalization (dynamic profiles tailored to visitor location/device/persona)',
    },
    {
      title: 'Constant A/B testing and machine learning to maximize conversion',
    },
    {
      title:
        'Smart deep links (/listen, /tip, etc.) for Instagram&apos;s multiple link slots',
    },
    { title: 'Clean dark/light mode, desktop QR code handoff' },
    { title: 'App deep links (no browser/login friction)' },
    {
      title:
        'Analytics focused on conversion (clicks → conversions, referrers, countries)',
    },
    { title: 'Unique Jovie handle (jov.ie/yourname)' },
  ];

  const handleSubscribe = async () => {
    if (!isSignedIn) {
      // Redirect to sign up if not authenticated
      router.push('/signup');
      return;
    }

    setIsLoading(true);
    try {
      // Route through server-side checkout flow for remove branding
      router.push('/billing/remove-branding');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-linear-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800'>
      <Container size='md'>
        <motion.div
          className='py-24 sm:py-32'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className='text-center mb-16'
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h1 className='text-5xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl max-w-4xl mx-auto leading-tight'>
              <span className='block'>Free forever.</span>
              <span className='block'>Remove branding for $5.</span>
            </h1>
            <p className='mt-6 text-xl leading-8 text-gray-600 dark:text-gray-300 max-w-2xl mx-auto'>
              Your Jovie profile that actually converts. Beautiful, intelligent,
              impossibly fast.
            </p>
          </motion.div>

          <div className='grid md:grid-cols-2 gap-12 items-start'>
            {/* Free Plan */}
            <motion.div
              className='rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden'
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className='p-8'>
                <h2 className='text-2xl font-bold text-gray-900 dark:text-white'>
                  Free Forever
                </h2>
                <p className='mt-2 text-gray-600 dark:text-gray-400'>
                  Everything you need to create a beautiful profile.
                </p>

                <div className='mt-6 flex items-baseline'>
                  <span className='text-5xl font-bold text-gray-900 dark:text-white'>
                    $0
                  </span>
                  <span className='ml-1 text-xl text-gray-500 dark:text-gray-400'>
                    /forever
                  </span>
                </div>

                <FeatureList
                  title='What&apos;s included:'
                  features={freeFeatures}
                />

                <div className='mt-8'>
                  <Link
                    href='/'
                    className='inline-flex w-full items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 px-6 py-3 text-base font-medium text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200'
                  >
                    Continue with free
                  </Link>
                </div>
              </div>
            </motion.div>

            {/* Paid Plan */}
            <motion.div
              className='rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden relative'
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {/* Highlight banner */}
              <div className='bg-black text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 text-center'>
                Designed for professionals
              </div>

              <div className='p-8'>
                <h2 className='text-2xl font-bold text-gray-900 dark:text-white'>
                  Pro
                </h2>
                <p className='mt-2 text-gray-600 dark:text-gray-400'>
                  Your brand. Your story. Nothing else.
                </p>

                <div className='mt-6'>
                  <PricingToggle onChange={setIsYearly} />
                </div>

                <div className='mt-8'>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-4'>
                    All free features, plus:
                  </p>
                  <ul className='space-y-3'>
                    <li className='flex items-start'>
                      <svg
                        className='h-5 w-5 shrink-0 text-gray-900 dark:text-white mt-0.5'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M5 13l4 4L19 7'
                        />
                      </svg>
                      <span className='ml-3 text-base text-gray-700 dark:text-gray-300'>
                        <strong>Remove the Jovie branding</strong> for a clean,
                        professional look
                      </span>
                    </li>
                  </ul>
                </div>

                <div className='mt-8'>
                  <motion.button
                    onClick={handleSubscribe}
                    disabled={isLoading}
                    className='inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-base font-medium transition-all duration-200 cursor-pointer bg-black text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-70 disabled:cursor-not-allowed'
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading
                      ? 'Processing...'
                      : isSignedIn
                        ? 'Remove branding →'
                        : 'Upgrade →'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* CTA Section */}
          <PricingCTA onUpgrade={handleSubscribe} isLoading={isLoading} />

          <motion.div
            className='mt-16 text-center'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <p className='text-sm text-gray-500 dark:text-gray-400'>
              All plans include unlimited updates and our 30-day money-back
              guarantee.
            </p>
          </motion.div>
        </motion.div>
      </Container>
    </div>
  );
}
