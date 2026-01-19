import type { MotionProps } from 'framer-motion';

/**
 * Content motion props configuration based on reduced motion preference.
 */
interface ContentMotionConfig {
  initial: MotionProps['initial'];
  animate: MotionProps['animate'];
  transition: MotionProps['transition'];
}

/**
 * Static motion props for reduced motion preference.
 */
const REDUCED_MOTION_CONFIG: ContentMotionConfig = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  transition: { duration: 0 },
};

/**
 * Full motion props for standard content animations.
 */
const FULL_MOTION_CONFIG: ContentMotionConfig = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
};

/**
 * Gets motion props for content sections based on reduced motion preference.
 *
 * This reduces cognitive complexity by consolidating all conditional
 * motion prop logic into a single function.
 */
export function getContentMotionProps(
  prefersReducedMotion: boolean
): ContentMotionConfig {
  return prefersReducedMotion ? REDUCED_MOTION_CONFIG : FULL_MOTION_CONFIG;
}
