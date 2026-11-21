// @coverage-via apps/web/tests/unit/library/LibraryCatalogWaveformCell.test.tsx

import type { StatusGlyphState } from '@jovie/ui';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { capitalizeFirst } from '@/lib/utils/string-utils';

export function formatReleaseStatus(
  status: LibraryReleaseAsset['status']
): string {
  return capitalizeFirst(status);
}

export function formatLibraryStatus(asset: LibraryReleaseAsset): string {
  return asset.itemStatusLabel ?? formatReleaseStatus(asset.status);
}

export interface LibraryStatusGlyphSpec {
  readonly state: StatusGlyphState;
  /** One phrase for both axes; the tooltip and accessible name. */
  readonly label: string;
}

/**
 * Folds release status and approval into one Linear-style glyph so a tile
 * never shows two stacked "Draft" words (#10384 / JOV-3333). Progress reads
 * left to right: empty ring (draft), half (scheduled), check (out). Review is
 * the one approval state that needs attention, so it owns the glyph; any
 * other approval state only qualifies the label. Only a lifecycle-archived
 * item owns the canceled X — an archived APPROVAL axis on an active item
 * stays visible on the All tab, so it must keep the release-status shape and
 * name both axes instead of reading as an unexplained failed status
 * (JOV-9022).
 */
export function resolveLibraryStatusGlyph(
  asset: LibraryReleaseAsset
): LibraryStatusGlyphSpec {
  if (asset.lifecycleStatus === 'archived') {
    return { state: 'canceled', label: 'Archived' };
  }
  const status = formatLibraryStatus(asset);
  if (asset.approvalStatus === 'needs_review') {
    return { state: 'in_review', label: `${status} · Needs review` };
  }
  const state: StatusGlyphState =
    asset.status === 'released'
      ? 'done'
      : asset.status === 'scheduled'
        ? 'in_progress'
        : 'todo';
  if (asset.approvalStatus === 'archived') {
    return { state, label: `${status} · Approval archived` };
  }
  if (asset.approvalStatus === 'approved') {
    return { state, label: `${status} · Approved` };
  }
  // An unapproved draft has nothing to approve yet; say it once.
  return {
    state,
    label: asset.status === 'draft' ? status : `${status} · Not approved`,
  };
}
