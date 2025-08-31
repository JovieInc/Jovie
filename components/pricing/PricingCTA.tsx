'use client';

import { motion } from 'framer-motion';

interface PricingCTAProps {
  onUpgrade: () => void;
  isLoading: boolean;
}

export function PricingCTA({ onUpgrade, isLoading }: PricingCTAProps) {
  return (
    <motion.div
      className='mt-16 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-1 shadow-xl'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <div className='rounded-lg bg-white dark:bg-gray-900 px-6 py-8 sm:p-10 sm:pb-12'>
        <div className='grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 items-center'>
          <div>
            <h3 className='text-2xl font-bold tracking-tight text-gray-900 dark:text-white'>
              Make it yours.
            </h3>
            <p className='mt-3 text-base text-gray-500 dark:text-gray-400'>
              Remove the Jovie branding for just $5. That’s it.
            </p>
          </div>
          <div className='flex justify-end'>
            <motion.button
              onClick={onUpgrade}
              disabled={isLoading}
              className='inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200'
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? 'Processing...' : 'Remove branding →'}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
