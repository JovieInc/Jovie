'use client';

// @coverage-via apps/web/tests/unit/library/LibrarySurface.jov-9022.test.tsx

import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { pluralize } from '@/lib/utils/pluralize';

/** Names default-hidden lifecycle archives so "N of M" is never unexplained (JOV-9022). */
export function computeLibraryStatusHiddenNote(
  preset: string,
  assets: readonly LibraryReleaseAsset[]
): string | null {
  if (preset === 'archived') return null;
  const hiddenArchived = assets.filter(
    asset => asset.lifecycleStatus === 'archived'
  ).length;
  return hiddenArchived > 0 ? `Hiding ${hiddenArchived} archived` : null;
}

export function LibraryStatusBar({
  visibleCount,
  totalCount,
  hiddenNote,
  activePreviewTitle,
}: {
  readonly visibleCount: number;
  readonly totalCount: number;
  /** Names the default-hidden set (archived items) so "N of M" is never an unexplained gap (JOV-9022). */
  readonly hiddenNote: string | null;
  readonly activePreviewTitle: string | null;
}) {
  return (
    <div className='system-b-library-status-bar hidden h-(--app-shell-footer-row-height) shrink-0 items-center justify-between gap-3 border-t border-(--app-shell-frame-seam) px-(--app-shell-header-padding-x) sm:flex'>
      <span className='min-w-0 truncate'>
        {visibleCount} of {pluralize(totalCount, 'Item')}
        {hiddenNote ? (
          <span data-testid='library-status-hidden-note'> · {hiddenNote}</span>
        ) : null}
      </span>
      {activePreviewTitle ? (
        <span className='min-w-0 truncate text-right'>
          Playing {activePreviewTitle}
        </span>
      ) : null}
    </div>
  );
}
