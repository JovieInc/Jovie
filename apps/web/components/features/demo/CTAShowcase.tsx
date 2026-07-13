'use client';

import {
  Accessibility,
  Blend,
  MoonStar,
  Palette,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { PrimaryCTA } from '@/components/molecules/PrimaryCTA';

const FEATURE_ITEMS = [
  {
    icon: Sparkles,
    title: 'No Layout Shift',
    description: 'Fixed dimensions in all states',
  },
  {
    icon: Blend,
    title: 'Smooth Transitions',
    description: '200ms fade animations',
  },
  {
    icon: Palette,
    title: 'Premium Design',
    description: 'Apple-level shadows and hover effects',
  },
  {
    icon: Accessibility,
    title: 'Accessible',
    description: 'Focus-visible, aria-labels, loading states',
  },
  {
    icon: MoonStar,
    title: 'Dark Mode',
    description: 'Perfect light and dark theme support',
  },
  {
    icon: Smartphone,
    title: 'Responsive',
    description: 'Adapts to all screen sizes',
  },
] as const;

export function CTAShowcase() {
  const [isLoading1, setIsLoading1] = useState(false);
  const [isLoading2, setIsLoading2] = useState(false);
  const [isLoading3, setIsLoading3] = useState(false);

  const handleDemoClick = (setLoading: (v: boolean) => void) => {
    return async () => {
      setLoading(true);
      await new Promise(r => setTimeout(r, 1200));
      setLoading(false);
    };
  };

  return (
    <section className='border-t border-subtle py-20'>
      <div className='mx-auto max-w-5xl px-6'>
        <h2 className='mb-6 text-2xl font-semibold text-primary-token'>
          Apple-Level CTA Buttons
        </h2>
        <p className='mb-8 text-secondary-token'>
          World-class buttons with smooth loading states, zero layout shift, and
          premium feel.
        </p>

        <div className='grid grid-cols-1 gap-8 md:grid-cols-2'>
          {/* Large Button Demo */}
          <div className='space-y-4'>
            <h3 className='text-lg font-medium text-primary-token'>
              Large Size (Default)
            </h3>
            <div className='max-w-sm'>
              <PrimaryCTA
                ariaLabel='Listen to music'
                loadingLabel='Opening music player...'
                loading={isLoading1}
                onClick={handleDemoClick(setIsLoading1)}
                size='lg'
              >
                Listen Now
              </PrimaryCTA>
            </div>
            <p className='text-sm text-secondary-token'>
              Click to see the smooth loading transition. Notice how the button{' '}
              maintains its exact dimensions and smoothly fades between states.
            </p>
          </div>

          {/* Medium Button Demo */}
          <div className='space-y-4'>
            <h3 className='text-lg font-medium text-primary-token'>
              Medium Size
            </h3>
            <div className='max-w-sm'>
              <PrimaryCTA
                ariaLabel='Start free trial'
                loadingLabel='Setting up your account...'
                loading={isLoading2}
                onClick={handleDemoClick(setIsLoading2)}
                size='md'
              >
                Start Free Trial
              </PrimaryCTA>
            </div>
            <p className='text-sm text-secondary-token'>
              Compact version perfect for secondary actions or smaller spaces.
            </p>
          </div>

          {/* Auto Width Demo */}
          <div className='space-y-4'>
            <h3 className='text-lg font-medium text-primary-token'>
              Auto Width
            </h3>
            <div>
              <PrimaryCTA
                ariaLabel='Save changes'
                loadingLabel='Saving...'
                loading={isLoading3}
                onClick={handleDemoClick(setIsLoading3)}
                fullWidth={false}
              >
                Save Changes
              </PrimaryCTA>
            </div>
            <p className='text-sm text-secondary-token'>
              Auto-width version that sizes to content while maintaining fixed
              height.
            </p>
          </div>

          {/* Features List */}
          <div className='space-y-4'>
            <h3 className='text-lg font-medium text-primary-token'>
              Key Features
            </h3>
            <ul className='space-y-2 text-sm text-secondary-token'>
              {FEATURE_ITEMS.map(({ icon: Icon, title, description }) => (
                <li key={title} className='flex items-start gap-2.5'>
                  <Icon
                    className='mt-0.5 h-4 w-4 shrink-0 text-tertiary-token'
                    aria-hidden='true'
                  />
                  <span>
                    <strong className='text-primary-token'>{title}:</strong>{' '}
                    <span>{description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
