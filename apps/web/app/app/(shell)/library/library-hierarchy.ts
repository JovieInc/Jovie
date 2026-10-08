import { getLibraryItemKind, type LibraryReleaseAsset } from './library-data';

export interface LibraryDependency {
  readonly parentTitle: string;
  readonly last: boolean;
}

/** Show only relationships already stored in the product graph; hidden parents never create phantom groups. */
export function groupLibraryDependencies(
  assets: readonly LibraryReleaseAsset[]
): {
  readonly rows: LibraryReleaseAsset[];
  readonly dependencies: ReadonlyMap<string, LibraryDependency>;
} {
  const parents = new Map(
    assets
      .filter(asset => getLibraryItemKind(asset) === 'release')
      .map(asset => [asset.id, asset])
  );
  const children = new Map<string, LibraryReleaseAsset[]>();
  for (const asset of assets) {
    const parentId = asset.linkedReleaseId;
    if (
      !parentId ||
      asset.id === parentId ||
      !parents.has(parentId) ||
      getLibraryItemKind(asset) === 'release'
    )
      continue;
    const siblings = children.get(parentId) ?? [];
    siblings.push(asset);
    children.set(parentId, siblings);
  }
  const childIds = new Set(
    [...children.values()].flatMap(siblings => siblings.map(asset => asset.id))
  );
  const dependencies = new Map<string, LibraryDependency>();
  const rows: LibraryReleaseAsset[] = [];
  for (const asset of assets) {
    if (childIds.has(asset.id)) continue;
    rows.push(asset);
    const siblings = children.get(asset.id) ?? [];
    siblings.forEach((child, index) => {
      rows.push(child);
      dependencies.set(child.id, {
        parentTitle: asset.title,
        last: index === siblings.length - 1,
      });
    });
  }
  return { rows, dependencies };
}
