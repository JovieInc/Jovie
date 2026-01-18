'use client';

import { motion } from 'framer-motion';

interface Feature {
  title: string;
}

interface FeatureListProps {
  features: Feature[];
  title: string;
}

export function FeatureList({ features, title }: FeatureListProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className='mt-8'>
      <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
        {title}
      </h3>
      <motion.ul
        className='space-y-3'
        variants={container}
        initial='hidden'
        animate='show'
      >
        {features.map(feature => (
          <motion.li
            key={feature.title}
            className='flex items-start'
            variants={item}
          >
            <svg
              className='h-5 w-5 flex-shrink-0 text-blue-500 mt-0.5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M5 13l4 4L19 7'
              />
            </svg>
            <span className='ml-3 text-base text-gray-700 dark:text-gray-300'>
              {feature.title}
            </span>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}
