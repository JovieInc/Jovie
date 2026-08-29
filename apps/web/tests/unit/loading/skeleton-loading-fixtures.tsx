import { LoadingSkeleton } from '@jovie/ui';
import type { ReactNode } from 'react';

export const SKELETON_LOADING_RED_FIXTURE_TEST_ID =
  'skeleton-loading-red-fixture';

/**
 * Deliberate-red: a loading surface made from raw local skeleton markup.
 * Production surfaces must compose the canonical Skeleton primitive instead.
 */
export function RawSkeletonLoadingFixture() {
  return (
    <div
      data-testid={SKELETON_LOADING_RED_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='raw-skeleton'
      className='space-y-3'
    >
      <div className='h-10 w-56 rounded-md skeleton' />
      <div className='h-4 w-full rounded-md skeleton' />
    </div>
  );
}

/**
 * Deliberate-red: a complete owner wraps another complete owner.
 * Production loading surfaces must announce through one owner only.
 */
export function DuplicateLoadingOwnerFixture() {
  return (
    <div
      data-testid={SKELETON_LOADING_RED_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='duplicate-owners'
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-label='Loading outer surface'
    >
      <LoadingSkeleton label='Loading inner surface' />
    </div>
  );
}

/**
 * A small composition helper for testing that the canonical owner remains the
 * only status/busy node even when arbitrary decorative content is present.
 */
export function CanonicalLoadingFixture({
  children,
}: Readonly<{ children?: ReactNode }>) {
  return (
    <div data-testid='canonical-loading-fixture'>
      <LoadingSkeleton label='Loading content' />
      {children}
    </div>
  );
}
