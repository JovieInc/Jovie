'use client';

import { useState } from 'react';
import { IconBadge } from '@/components/atoms/IconBadge';
import { Header } from '@/components/site/Header';
import { FEATURES } from '@/lib/features';

export default function FlyoutDemoPage() {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className={`min-h-screen transition-colors ${isDark ? 'dark' : ''}`}>
      {/* Use the shared Header component */}
      <Header />

      {/* Demo Content */}
      <main className='mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8'>
        <div className='text-center'>
          <h1 className='text-4xl font-bold text-gray-900 dark:text-white mb-4'>
            Product Flyout Demo
          </h1>
          <p className='text-lg text-gray-600 dark:text-gray-300 mb-8'>
            Hover over or click the &quot;Product&quot; button in the header to
            see the Linear-inspired flyout in action.
          </p>

          <div className='mb-8'>
            <button
              onClick={toggleTheme}
              className='inline-flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors'
            >
              {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12'>
            {FEATURES.map(feature => (
              <div
                key={feature.slug}
                className='p-6 bg-gray-50 dark:bg-gray-800 rounded-lg'
              >
                <div className='flex items-center mb-4'>
                  <IconBadge name={feature.icon} colorVar={feature.colorVar} />
                  <h3 className='ml-3 text-lg font-semibold text-gray-900 dark:text-white'>
                    {feature.title}
                  </h3>
                </div>
                <p className='text-gray-600 dark:text-gray-300'>
                  {feature.blurb}
                </p>
              </div>
            ))}
          </div>

          <div className='mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              Implementation Features
            </h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-left'>
              <div>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-2'>
                  Desktop
                </h3>
                <ul className='text-sm text-gray-600 dark:text-gray-300 space-y-1'>
                  <li>• Hover to open (200ms intent delay)</li>
                  <li>• Focus trap for accessibility</li>
                  <li>• ESC key to close</li>
                  <li>• Arrow key navigation</li>
                  <li>• 2-column Linear-style layout</li>
                </ul>
              </div>
              <div>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-2'>
                  Mobile
                </h3>
                <ul className='text-sm text-gray-600 dark:text-gray-300 space-y-1'>
                  <li>• Tap to open/close</li>
                  <li>• 44px min touch targets</li>
                  <li>• Full-width dropdown</li>
                  <li>• Staggered animations</li>
                  <li>• Respects reduced motion</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
