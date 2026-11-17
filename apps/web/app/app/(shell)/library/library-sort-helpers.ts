import type { LibraryReleaseAsset } from './library-data';
export type LibrarySortKey = 'releaseDate' | 'title' | 'status' | 'providers';
type CountMap<T extends string> = ReadonlyMap<T, number>;

export function releaseDateTime(asset: LibraryReleaseAsset): number {
  if (!asset.releaseDate) return 0;
  const date = new Date(asset.releaseDate);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function compareAssets(sort: LibrarySortKey) {
  return (a: LibraryReleaseAsset, b: LibraryReleaseAsset) => {
    if (sort === 'releaseDate') return releaseDateTime(b) - releaseDateTime(a);
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'status') return a.status.localeCompare(b.status);
    return b.providerCount - a.providerCount;
  };
}

export function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function countBy<T extends string>(
  assets: readonly LibraryReleaseAsset[],
  getValues: (asset: LibraryReleaseAsset) => readonly T[]
): CountMap<T> {
  const counts = new Map<T, number>();
  for (const asset of assets) {
    for (const value of getValues(asset)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}
