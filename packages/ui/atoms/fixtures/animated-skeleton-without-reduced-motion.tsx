export const ANIMATED_SKELETON_WITHOUT_REDUCED_MOTION_FIXTURE_TEST_ID =
  'animated-skeleton-without-reduced-motion-fixture';

/**
 * Deliberate-red shimmer that keeps animating under reduced motion.
 * Production Skeleton must include motion-reduce:animate-none.
 */
export function AnimatedSkeletonWithoutReducedMotionFixture() {
  return (
    <div
      data-testid={ANIMATED_SKELETON_WITHOUT_REDUCED_MOTION_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='reduced-motion'
      className='skeleton h-4 w-48 animate-pulse rounded-sm'
      style={{ outline: '2px solid #ff0000' }}
    />
  );
}
