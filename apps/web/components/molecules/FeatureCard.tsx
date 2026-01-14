'use client';

import { type MotionProps, motion, useReducedMotion } from 'framer-motion';

// Animation constants
const ANIMATION_STIFFNESS = 400;
const ANIMATION_DAMPING = 17;
const ANIMATION_MASS = 0.8;
const REDUCED_MOTION_DURATION = 0.1;
const GLOW_TRANSITION_DURATION = 0.3;
const GLOW_OPACITY_REDUCED = 0.5;
const GLOW_OPACITY_FULL = 1;
const HOVER_SCALE = 1.02;
const HOVER_Y_OFFSET = -5;
const HOVER_Y_OFFSET_REDUCED = -2;

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

  const containerWhileHover: MotionProps['whileHover'] = interactive
    ? prefersReducedMotion
      ? { y: HOVER_Y_OFFSET_REDUCED }
      : { scale: HOVER_SCALE, y: HOVER_Y_OFFSET }
    : undefined;

  const containerWhileFocus: MotionProps['whileFocus'] = interactive
    ? prefersReducedMotion
      ? { y: HOVER_Y_OFFSET_REDUCED }
      : { scale: HOVER_SCALE, y: HOVER_Y_OFFSET }
    : undefined;

  const containerTransition: MotionProps['transition'] = interactive
    ? prefersReducedMotion
      ? { duration: REDUCED_MOTION_DURATION }
      : {
          type: 'spring',
          stiffness: ANIMATION_STIFFNESS,
          damping: ANIMATION_DAMPING,
          mass: ANIMATION_MASS,
        }
    : undefined;

  const cardWhileHover: MotionProps['whileHover'] = interactive
    ? prefersReducedMotion
      ? { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }
      : {
          boxShadow:
            '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          borderColor: 'rgb(209, 213, 219)',
        }
    : undefined;

  const cardTransition: MotionProps['transition'] = interactive
    ? prefersReducedMotion
      ? { duration: REDUCED_MOTION_DURATION }
      : {
          type: 'spring',
          stiffness: ANIMATION_STIFFNESS,
          damping: ANIMATION_DAMPING,
        }
    : undefined;

  const glowInitial: MotionProps['initial'] = interactive
    ? { opacity: 0 }
    : undefined;

  const glowWhileHover: MotionProps['whileHover'] = interactive
    ? prefersReducedMotion
      ? { opacity: GLOW_OPACITY_REDUCED }
      : { opacity: GLOW_OPACITY_FULL }
    : undefined;

  const glowTransition: MotionProps['transition'] = interactive
    ? prefersReducedMotion
      ? { duration: REDUCED_MOTION_DURATION }
      : { duration: GLOW_TRANSITION_DURATION }
    : undefined;

  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ scale: 1, y: 0 }}
      whileHover={containerWhileHover}
      whileFocus={containerWhileFocus}
      transition={containerTransition}
    >
      {/* Hover glow effect */}
      {interactive && (
        <motion.div
          className='absolute -inset-4 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl blur'
          initial={glowInitial}
          whileHover={glowWhileHover}
          transition={glowTransition}
        />
      )}

      <motion.div
        className={`
          relative bg-gray-50/80 dark:bg-white/5 backdrop-blur-sm 
          border border-gray-200 dark:border-white/10 rounded-2xl p-8
        `}
        whileHover={cardWhileHover}
        transition={cardTransition}
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
