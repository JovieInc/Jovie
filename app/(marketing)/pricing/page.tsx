'use client';

import { useAuth } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import { FeatureList } from '@/components/pricing/FeatureList';
import { PricingCTA } from '@/components/pricing/PricingCTA';
import { PricingToggle } from '@/components/pricing/PricingToggle';
import { Container } from '@/components/site/Container';

export default function PricingPage() {
  const { isSignedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isYearly, setIsYearly] = useState(false);

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
      window.location.href = '/sign-up';
      return;
    }

    setIsLoading(true);
    try {
      // Get available pricing options from server
      const pricingResponse = await fetch('/api/stripe/pricing-options');
      const pricingData = await pricingResponse.json();

      // Use the appropriate price based on billing interval
      const priceOption = pricingData.options?.find(
        (option: { interval: string; priceId: string }) =>
          option.interval === (isYearly ? 'year' : 'month')
      );

      const priceId = priceOption?.priceId;

      if (!priceId) {
        console.error('No pricing options available');
        return;
      }

      // Create Stripe checkout session
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: priceId,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-base'>
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
            <h1 className='text-5xl font-bold tracking-tight text-primary sm:text-6xl max-w-4xl mx-auto leading-tight'>
              Free forever. Remove branding for $5.
            </h1>
            <p className='mt-6 text-xl leading-8 text-secondary max-w-2xl mx-auto'>
              The link in bio that actually converts. Beautiful, intelligent,
              impossibly fast.
            </p>
          </motion.div>

          <div className='grid md:grid-cols-2 gap-12 items-start'>
            {/* Free Plan */}
            <motion.div
              className='rounded-2xl border border-default bg-surface-1 shadow-lg overflow-hidden'
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className='p-8'>
                <h2 className='text-2xl font-bold text-primary'>
                  Free Forever
                </h2>
                <p className='mt-2 text-secondary'>
                  Everything you need to create a beautiful profile.
                </p>

                <div className='mt-6 flex items-baseline'>
                  <span className='text-5xl font-bold text-primary'>$0</span>
                  <span className='ml-1 text-xl text-secondary'>/forever</span>
                </div>

                <FeatureList
                  title='What&apos;s included:'
                  features={freeFeatures}
                />

                <div className='mt-8'>
                  <Link href='/' className='btn btn-secondary w-full'>
                    Continue with free
                  </Link>
                </div>
              </div>
            </motion.div>

            {/* Paid Plan */}
            <motion.div
              className='rounded-2xl border border-default bg-surface-1 shadow-xl overflow-hidden relative'
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {/* Highlight banner */}
              <div className='bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 text-center'>
                Designed for professionals
              </div>

              <div className='p-8'>
                <h2 className='text-2xl font-bold text-primary'>Pro</h2>
                <p className='mt-2 text-secondary'>
                  Your brand. Your story. Nothing else.
                </p>

                <div className='mt-6'>
                  <PricingToggle onChange={setIsYearly} />
                </div>

                <div className='mt-8'>
                  <p className='text-sm text-secondary mb-4'>
                    All free features, plus:
                  </p>
                  <ul className='space-y-3'>
                    <li className='flex items-start'>
                      <svg
                        className='h-5 w-5 flex-shrink-0 text-accent-token mt-0.5'
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
                      <span className='ml-3 text-base text-secondary'>
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
                    className='inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-medium text-white hover:opacity-95 focus:outline-none focus:ring-2 ring-accent focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200'
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
            <p className='text-sm text-secondary'>
              All plans include unlimited updates and our 30-day money-back
              guarantee.
            </p>
          </motion.div>
        </motion.div>
      </Container>
    </div>
  );
}
