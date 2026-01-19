import type { MotionProps } from 'framer-motion';

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

/**
 * Configuration for FeatureCard motion props
 */
interface MotionConfig {
  interactive: boolean;
  prefersReducedMotion: boolean;
}

/**
 * Generated motion props for the container element
 */
interface ContainerMotionProps {
  whileHover: MotionProps['whileHover'];
  whileFocus: MotionProps['whileFocus'];
  transition: MotionProps['transition'];
}

/**
 * Generated motion props for the card element
 */
interface CardMotionProps {
  whileHover: MotionProps['whileHover'];
  transition: MotionProps['transition'];
}

/**
 * Generated motion props for the glow element
 */
interface GlowMotionProps {
  initial: MotionProps['initial'];
  whileHover: MotionProps['whileHover'];
  transition: MotionProps['transition'];
}

/**
 * All motion props for FeatureCard
 */
export interface FeatureCardMotionProps {
  container: ContainerMotionProps;
  card: CardMotionProps;
  glow: GlowMotionProps;
}

/**
 * Standard spring transition for full motion
 */
const SPRING_TRANSITION = {
  type: 'spring' as const,
  stiffness: ANIMATION_STIFFNESS,
  damping: ANIMATION_DAMPING,
  mass: ANIMATION_MASS,
};

/**
 * Reduced spring transition (no mass)
 */
const SPRING_TRANSITION_NO_MASS = {
  type: 'spring' as const,
  stiffness: ANIMATION_STIFFNESS,
  damping: ANIMATION_DAMPING,
};

/**
 * Quick reduced motion transition
 */
const REDUCED_MOTION_TRANSITION = {
  duration: REDUCED_MOTION_DURATION,
};

/**
 * Full motion hover state for container
 */
const CONTAINER_HOVER_FULL = {
  scale: HOVER_SCALE,
  y: HOVER_Y_OFFSET,
};

/**
 * Reduced motion hover state for container
 */
const CONTAINER_HOVER_REDUCED = {
  y: HOVER_Y_OFFSET_REDUCED,
};

/**
 * Full motion hover state for card
 */
const CARD_HOVER_FULL = {
  boxShadow:
    '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  borderColor: 'rgb(209, 213, 219)',
};

/**
 * Reduced motion hover state for card
 */
const CARD_HOVER_REDUCED = {
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};

/**
 * Generate all motion props for FeatureCard based on configuration.
 *
 * This reduces cognitive complexity by consolidating all conditional
 * motion prop logic into a single function.
 */
export function getFeatureCardMotionProps(
  config: MotionConfig
): FeatureCardMotionProps {
  const { interactive, prefersReducedMotion } = config;

  if (!interactive) {
    return {
      container: {
        whileHover: undefined,
        whileFocus: undefined,
        transition: undefined,
      },
      card: {
        whileHover: undefined,
        transition: undefined,
      },
      glow: {
        initial: undefined,
        whileHover: undefined,
        transition: undefined,
      },
    };
  }

  if (prefersReducedMotion) {
    return {
      container: {
        whileHover: CONTAINER_HOVER_REDUCED,
        whileFocus: CONTAINER_HOVER_REDUCED,
        transition: REDUCED_MOTION_TRANSITION,
      },
      card: {
        whileHover: CARD_HOVER_REDUCED,
        transition: REDUCED_MOTION_TRANSITION,
      },
      glow: {
        initial: { opacity: 0 },
        whileHover: { opacity: GLOW_OPACITY_REDUCED },
        transition: REDUCED_MOTION_TRANSITION,
      },
    };
  }

  // Full motion
  return {
    container: {
      whileHover: CONTAINER_HOVER_FULL,
      whileFocus: CONTAINER_HOVER_FULL,
      transition: SPRING_TRANSITION,
    },
    card: {
      whileHover: CARD_HOVER_FULL,
      transition: SPRING_TRANSITION_NO_MASS,
    },
    glow: {
      initial: { opacity: 0 },
      whileHover: { opacity: GLOW_OPACITY_FULL },
      transition: { duration: GLOW_TRANSITION_DURATION },
    },
  };
}
