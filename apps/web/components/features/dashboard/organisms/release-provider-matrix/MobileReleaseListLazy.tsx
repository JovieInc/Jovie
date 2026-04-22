'use client';

import { type ComponentProps, lazy, Suspense } from 'react';
import type { MobileReleaseList as MobileReleaseListImpl } from './MobileReleaseList';

const MobileReleaseList = lazy(() =>
  import('./MobileReleaseList').then(m => ({
    default: m.MobileReleaseList,
  }))
);

export type MobileReleaseListProps = ComponentProps<
  typeof MobileReleaseListImpl
>;

/**
 * Lazy-loaded MobileReleaseList with reserved-height Suspense fallback.
 *
 * MobileReleaseList is only rendered on mobile viewports, but ReleaseTable
 * and ReleaseTableWithTracks both need to reference it. Consolidating the
 * lazy wrapper here keeps the shared chunk-boundary logic in one place
 * and avoids duplicating the Suspense fallback across render paths.
 */
export function MobileReleaseListLazy(props: MobileReleaseListProps) {
  return (
    <Suspense fallback={<div className='min-h-[320px]' aria-hidden />}>
      <MobileReleaseList {...props} />
    </Suspense>
  );
}
