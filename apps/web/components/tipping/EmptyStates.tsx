'use client';

import { motion, type Variants } from 'motion/react';
import Image from 'next/image';
import { useMemo } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

type EmptyStateType = 'no-venmo' | 'pending-metrics';

interface TippingEmptyStateProps {
  readonly type: EmptyStateType;
  readonly className?: string;
  readonly animate?: boolean;
}

interface TippingSkeletonProps {
  readonly className?: string;
  readonly rows?: number;
}

const EMPTY_STATE_CONFIG = {
  'no-venmo': {
    title: 'No Venmo Account Connected',
    description:
      'Connect your Venmo account to start receiving tips from your fans.',
    illustration: '/images/tipping/empty-venmo.svg',
    altText: 'Illustration of a disconnected Venmo account',
  },
  'pending-metrics': {
    title: 'Tipping Metrics Coming Soon',
    description:
      'Your tipping metrics will appear here once you receive your first tip.',
    illustration: '/images/tipping/empty-metrics.svg',
    altText: 'Illustration of pending tipping metrics',
  },
} as const;

/**
 * Empty state component for tipping-related features
 * Shows appropriate illustration and message based on the type
 */
export function TippingEmptyState({
  type,
  className = '',
  animate = true,
}: Readonly<TippingEmptyStateProps>) {
  const config = EMPTY_STATE_CONFIG[type];

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1], // Apple-style easing
        staggerChildren: 0.1,
      },
    },
  };

  const childVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    },
  };

  const content = (
    <div
      className={`bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-subtle rounded-2xl p-8 shadow-xl shadow-black/5 text-center ${className}`}
    >
      <div className='flex flex-col items-center justify-center space-y-6'>
        {/* Illustration */}
        <div className='relative w-48 h-48 mb-2'>
          <Image
            src={config.illustration}
            alt={config.altText}
            fill
            sizes='(max-width: 768px) 100vw, 192px'
            className='object-contain'
            aria-hidden='true'
          />
        </div>

        {/* Text content */}
        <div className='space-y-2'>
          <h3 className='text-xl font-semibold text-gray-800 dark:text-gray-100'>
            {config.title}
          </h3>
          <p className='text-gray-600 dark:text-gray-400 max-w-md'>
            {config.description}
          </p>
        </div>
      </div>
    </div>
  );

  // Return animated or static version based on the animate prop
  if (animate) {
    return (
      <motion.div
        variants={containerVariants}
        initial='hidden'
        animate='visible'
        className='w-full'
      >
        <motion.div variants={childVariants}>{content}</motion.div>
      </motion.div>
    );
  }

  return content;
}

/**
 * Skeleton loader for tipping metrics
 * Shows placeholder UI while data is loading
 */
export function TippingMetricsSkeleton({
  className = '',
  rows = 3,
}: Readonly<TippingSkeletonProps>) {
  const rowKeys = useMemo(
    () => Array.from({ length: rows }, (_, i) => `tipping-row-${i}`),
    [rows]
  );

  return (
    <div className={`space-y-6 ${className}`} aria-hidden='true'>
      {/* Header skeleton */}
      <div className='flex justify-between items-center'>
        <LoadingSkeleton height='h-8' width='w-48' rounded='md' />
        <LoadingSkeleton height='h-8' width='w-32' rounded='md' />
      </div>

      {/* Metrics cards skeleton */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <div className='bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-subtle rounded-2xl p-6 shadow-sm'>
          <LoadingSkeleton
            height='h-6'
            width='w-32'
            rounded='md'
            className='mb-4'
          />
          <LoadingSkeleton
            height='h-10'
            width='w-24'
            rounded='md'
            className='mb-2'
          />
          <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
        </div>
        <div className='bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-subtle rounded-2xl p-6 shadow-sm'>
          <LoadingSkeleton
            height='h-6'
            width='w-32'
            rounded='md'
            className='mb-4'
          />
          <LoadingSkeleton
            height='h-10'
            width='w-24'
            rounded='md'
            className='mb-2'
          />
          <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
        </div>
      </div>

      {/* Table skeleton */}
      <div className='bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-gray-200/30 dark:border-white/10 rounded-2xl p-6 shadow-sm'>
        <LoadingSkeleton
          height='h-6'
          width='w-48'
          rounded='md'
          className='mb-4'
        />
        <div className='space-y-4'>
          {/* Table header */}
          <div className='grid grid-cols-3 gap-4 pb-2 border-b border-gray-200/30 dark:border-white/10'>
            <LoadingSkeleton height='h-5' width='w-full' rounded='sm' />
            <LoadingSkeleton height='h-5' width='w-full' rounded='sm' />
            <LoadingSkeleton height='h-5' width='w-full' rounded='sm' />
          </div>

          {/* Table rows */}
          {rowKeys.map(key => (
            <div key={key} className='grid grid-cols-3 gap-4 py-2'>
              <LoadingSkeleton height='h-5' width='w-full' rounded='sm' />
              <LoadingSkeleton height='h-5' width='w-full' rounded='sm' />
              <LoadingSkeleton height='h-5' width='w-full' rounded='sm' />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
