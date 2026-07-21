import { getLibraryItemKind, type LibraryReleaseAsset } from './library-data';

export type LibrarySavedViewId =
  | 'all'
  | 'scheduled'
  | 'drafts'
  | 'needs-attention'
  | 'recent'
  | 'live-merch';

export interface LibrarySavedView {
  readonly id: LibrarySavedViewId;
  readonly label: string;
  readonly description: string;
  readonly predicate: (asset: LibraryReleaseAsset) => boolean;
}

export const LIBRARY_SAVED_VIEW_STORAGE_KEY = 'jovie:library:saved-view';

export const LIBRARY_SAVED_VIEWS: readonly LibrarySavedView[] = [
  {
    id: 'all',
    label: 'All Items',
    description: 'Full catalog',
    predicate: () => true,
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    description: 'Items with a future release date',
    predicate: asset => asset.status === 'scheduled',
  },
  {
    id: 'drafts',
    label: 'Drafts',
    description: 'Unpublished releases and merch',
    predicate: asset => asset.status === 'draft',
  },
  {
    id: 'needs-attention',
    label: 'Needs Attention',
    description: 'Items missing audio, artwork, or DSP links',
    predicate: asset =>
      !asset.hasArtwork ||
      (getLibraryItemKind(asset) === 'release' &&
        (!asset.previewUrl || asset.providerCount === 0)),
  },
  {
    id: 'recent',
    label: 'Updated This Week',
    description: 'Touched in the last 7 days',
    predicate: asset => isWithinDays(asset.updatedAt ?? asset.releaseDate, 7),
  },
  {
    id: 'live-merch',
    label: 'Live Merch',
    description: 'Merch cards currently for sale',
    predicate: asset =>
      getLibraryItemKind(asset) === 'merch' && asset.status === 'released',
  },
];

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function isWithinDays(
  value: string | null | undefined,
  days: number,
  nowMs = Date.now()
): boolean {
  const time = parseTimestamp(value);
  if (time === null) return false;
  return nowMs - time <= days * 86_400_000;
}

export function isLibrarySavedViewId(
  value: string
): value is LibrarySavedViewId {
  return LIBRARY_SAVED_VIEWS.some(view => view.id === value);
}

export function getLibrarySavedViewPredicate(
  id: LibrarySavedViewId
): (asset: LibraryReleaseAsset) => boolean {
  return (
    LIBRARY_SAVED_VIEWS.find(view => view.id === id)?.predicate ?? (() => true)
  );
}

export function readPersistedLibrarySavedView(): LibrarySavedViewId {
  if (typeof globalThis.window === 'undefined') return 'all';
  try {
    const stored = globalThis.localStorage?.getItem(
      LIBRARY_SAVED_VIEW_STORAGE_KEY
    );
    return stored && isLibrarySavedViewId(stored) ? stored : 'all';
  } catch {
    return 'all';
  }
}

export function persistLibrarySavedView(id: LibrarySavedViewId): void {
  if (typeof globalThis.window === 'undefined') return;
  try {
    if (id === 'all') {
      globalThis.localStorage?.removeItem(LIBRARY_SAVED_VIEW_STORAGE_KEY);
      return;
    }
    globalThis.localStorage?.setItem(LIBRARY_SAVED_VIEW_STORAGE_KEY, id);
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

export function countLibrarySavedViewMatches(
  assets: readonly LibraryReleaseAsset[],
  id: LibrarySavedViewId
): number {
  const predicate = getLibrarySavedViewPredicate(id);
  return assets.filter(predicate).length;
}
