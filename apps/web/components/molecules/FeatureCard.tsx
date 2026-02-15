'use client';

import { type MotionProps, motion, useReducedMotion } from 'motion/react';

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

// Animation config builders to reduce cognitive complexity
function getContainerHoverConfig(
  interactive: boolean,
  reducedMotion: boolean | null
): MotionProps['whileHover'] {
  if (!interactive) return undefined;
  return reducedMotion
    ? { y: HOVER_Y_OFFSET_REDUCED }
    : { scale: HOVER_SCALE, y: HOVER_Y_OFFSET };
}

function getSpringTransition(
  interactive: boolean,
  reducedMotion: boolean | null
): MotionProps['transition'] {
  if (!interactive) return undefined;
  return reducedMotion
    ? { duration: REDUCED_MOTION_DURATION }
    : {
        type: 'spring',
        stiffness: ANIMATION_STIFFNESS,
        damping: ANIMATION_DAMPING,
        mass: ANIMATION_MASS,
      };
}

function getCardHoverConfig(
  interactive: boolean,
  reducedMotion: boolean | null
): MotionProps['whileHover'] {
  if (!interactive) return undefined;
  return reducedMotion
    ? { boxShadow: 'var(--shadow-sm)' }
    : {
        boxShadow: 'var(--shadow-lg)',
      };
}

function getCardTransition(
  interactive: boolean,
  reducedMotion: boolean | null
): MotionProps['transition'] {
  if (!interactive) return undefined;
  return reducedMotion
    ? { duration: REDUCED_MOTION_DURATION }
    : {
        type: 'spring',
        stiffness: ANIMATION_STIFFNESS,
        damping: ANIMATION_DAMPING,
      };
}

function getGlowConfig(
  interactive: boolean,
  reducedMotion: boolean | null
): {
  initial: MotionProps['initial'];
  whileHover: MotionProps['whileHover'];
  transition: MotionProps['transition'];
} {
  if (!interactive) {
    return { initial: undefined, whileHover: undefined, transition: undefined };
  }
  return {
    initial: { opacity: 0 },
    whileHover: {
      opacity: reducedMotion ? GLOW_OPACITY_REDUCED : GLOW_OPACITY_FULL,
    },
    transition: {
      duration: reducedMotion
        ? REDUCED_MOTION_DURATION
        : GLOW_TRANSITION_DURATION,
    },
  };
}

export interface FeatureCardProps {
  /** Feature title */
  readonly title: string;
  /** Feature description */
  readonly description: string;
  /** Optional metric or badge text */
  readonly metric?: string;
  /** Icon element to display */
  readonly icon: React.ReactNode;
  /** Color accent for the icon */
  readonly accent?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
  /** Additional CSS classes */
  readonly className?: string;
  /** Whether to show hover effects */
  readonly interactive?: boolean;
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

  // Use helper functions to build animation configs
  const containerWhileHover = getContainerHoverConfig(
    interactive,
    prefersReducedMotion
  );
  const containerWhileFocus = getContainerHoverConfig(
    interactive,
    prefersReducedMotion
  );
  const containerTransition = getSpringTransition(
    interactive,
    prefersReducedMotion
  );
  const cardWhileHover = getCardHoverConfig(interactive, prefersReducedMotion);
  const cardTransition = getCardTransition(interactive, prefersReducedMotion);
  const glowConfig = getGlowConfig(interactive, prefersReducedMotion);

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
          initial={glowConfig.initial}
          whileHover={glowConfig.whileHover}
          transition={glowConfig.transition}
        />
      )}

      <motion.div
        className={`
          relative bg-surface-1/80 backdrop-blur-sm
          border border-subtle rounded-2xl p-8
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
        <h3 className='mt-6 text-xl font-semibold text-primary-token'>
          {title}
        </h3>

        {/* Metric badge */}
        {metric && (
          <div className='mt-2'>
            <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-surface-2 text-secondary-token'>
              {metric}
            </span>
          </div>
        )}

        {/* Description */}
        <p className='mt-4 text-secondary-token leading-relaxed'>
          {description}
        </p>
      </motion.div>
    </motion.div>
  );
}
