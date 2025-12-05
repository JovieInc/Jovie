'use client';

import { motion, useReducedMotion } from 'framer-motion';

export interface FeatureCardProps {
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Optional metric or badge text */
  metric?: string;
  /** Icon element to display */
  icon: React.ReactNode;
  /** Color accent for the icon */
  accent?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
  /** Additional CSS classes */
  className?: string;
  /** Whether to show hover effects */
  interactive?: boolean;
}

export function FeatureCard({
  title,
  description,
  metric,
  icon,
  accent = 'blue',
  className = '',
  interactive = true,
}: FeatureCardProps) {
  const accentClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
    gray: 'from-gray-500 to-gray-600',
  };

  // Check if user prefers reduced motion
  const prefersReducedMotion = useReducedMotion();

  // Adjust animation settings based on motion preference
  const containerAnimationProps =
    interactive && !prefersReducedMotion
      ? {
          whileHover: { scale: 1.02, y: -5 },
          whileFocus: { scale: 1.02, y: -5 },
          transition: {
            type: 'spring',
            stiffness: 400,
            damping: 17,
            mass: 0.8,
          },
        }
      : interactive && prefersReducedMotion
        ? {
            whileHover: { y: -2 },
            whileFocus: { y: -2 },
            transition: { duration: 0.1 },
          }
        : {};

  // Card animation props
  const cardAnimationProps =
    interactive && !prefersReducedMotion
      ? {
          whileHover: {
            boxShadow:
              '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            borderColor: 'rgb(209, 213, 219)',
          },
          transition: { type: 'spring', stiffness: 400, damping: 17 },
        }
      : interactive && prefersReducedMotion
        ? {
            whileHover: { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
            transition: { duration: 0.1 },
          }
        : {};

  // Glow effect animation props
  const glowAnimationProps =
    interactive && !prefersReducedMotion
      ? {
          initial: { opacity: 0 },
          whileHover: { opacity: 1 },
          transition: { duration: 0.3 },
        }
      : interactive && prefersReducedMotion
        ? {
            initial: { opacity: 0 },
            whileHover: { opacity: 0.5 },
            transition: { duration: 0.1 },
          }
        : {};

  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ scale: 1, y: 0 }}
      {...containerAnimationProps}
    >
      {/* Hover glow effect */}
      {interactive && (
        <motion.div
          className='absolute -inset-4 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl blur'
          {...glowAnimationProps}
        />
      )}

      <motion.div
        className={`
          relative bg-gray-50/80 dark:bg-white/5 backdrop-blur-sm 
          border border-gray-200 dark:border-white/10 rounded-2xl p-8
        `}
        {...cardAnimationProps}
      >
        {/* Icon */}
        <div
          className={`
            inline-flex h-12 w-12 items-center justify-center rounded-xl 
            text-white shadow-lg bg-gradient-to-br ${accentClasses[accent]}
          `}
        >
          {icon}
        </div>

        {/* Title */}
        <h3 className='mt-6 text-xl font-semibold text-gray-900 dark:text-white'>
          {title}
        </h3>

        {/* Metric badge */}
        {metric && (
          <div className='mt-2'>
            <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/80'>
              {metric}
            </span>
          </div>
        )}

        {/* Description */}
        <p className='mt-4 text-gray-600 dark:text-white/70 leading-relaxed'>
          {description}
        </p>
      </motion.div>
    </motion.div>
  );
}
