/**
 * User-defined Library Collections — dynamic saved views (Frame.io-style).
 *
 * Collections auto-populate from metadata filters without moving files.
 * Persistence is local to the browser (same pattern as smart filters).
 */
import {
  LIBRARY_APPROVAL_STATUSES,
  type LibraryApprovalStatus,
} from '@/lib/library/approval-status';
import type {
  LibraryAssetKind,
  LibraryReleaseAsset,
  LibraryViewMode,
} from './library-data';

export const LIBRARY_COLLECTIONS_STORAGE_KEY = 'jovie:library:collections';
export const LIBRARY_ACTIVE_COLLECTION_STORAGE_KEY =
  'jovie:library:active-collection';

export type LibraryCollectionStatus = LibraryReleaseAsset['status'];
export type LibraryCollectionReleaseType = LibraryReleaseAsset['releaseType'];

/** Serializable filter snapshot applied as a dynamic view. */
export type LibraryCollectionFilters = {
  readonly statuses: readonly LibraryCollectionStatus[];
  readonly approvalStatuses: readonly LibraryApprovalStatus[];
  readonly releaseTypes: readonly LibraryCollectionReleaseType[];
  readonly assetKinds: readonly LibraryAssetKind[];
  /** Release label / tag strings (case-insensitive match). */
  readonly releaseTags: readonly string[];
};

export type LibraryCollection = {
  readonly id: string;
  readonly name: string;
  readonly filters: LibraryCollectionFilters;
  /** Preferred grid/list/table mode when opening this collection; null keeps current. */
  readonly viewMode: LibraryViewMode | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function emptyLibraryCollectionFilters(): LibraryCollectionFilters {
  return {
    statuses: [],
    approvalStatuses: [],
    releaseTypes: [],
    assetKinds: [],
    releaseTags: [],
  };
}

export function libraryCollectionFiltersAreEmpty(
  filters: LibraryCollectionFilters
): boolean {
  return (
    filters.statuses.length +
      filters.approvalStatuses.length +
      filters.releaseTypes.length +
      filters.assetKinds.length +
      filters.releaseTags.length ===
    0
  );
}

export function libraryCollectionHasActiveFilters(
  filters: LibraryCollectionFilters
): boolean {
  return !libraryCollectionFiltersAreEmpty(filters);
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function releaseTagsForAsset(asset: LibraryReleaseAsset): string[] {
  const tags: string[] = [];
  if (asset.label?.trim()) tags.push(asset.label.trim());
  for (const genre of asset.genres) {
    if (genre.trim()) tags.push(genre.trim());
  }
  return tags;
}

export function assetMatchesLibraryCollectionFilters(
  asset: LibraryReleaseAsset,
  filters: LibraryCollectionFilters
): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(asset.status)) {
    return false;
  }
  if (
    filters.approvalStatuses.length > 0 &&
    !filters.approvalStatuses.includes(asset.approvalStatus)
  ) {
    return false;
  }
  if (
    filters.releaseTypes.length > 0 &&
    !filters.releaseTypes.includes(asset.releaseType)
  ) {
    return false;
  }
  if (
    filters.assetKinds.length > 0 &&
    !asset.assetKinds.some(kind => filters.assetKinds.includes(kind))
  ) {
    return false;
  }
  if (filters.releaseTags.length > 0) {
    const assetTags = new Set(
      releaseTagsForAsset(asset).map(tag => normalizeTag(tag))
    );
    const hasTag = filters.releaseTags.some(tag =>
      assetTags.has(normalizeTag(tag))
    );
    if (!hasTag) return false;
  }
  return true;
}

export function countLibraryCollectionMatches(
  assets: readonly LibraryReleaseAsset[],
  filters: LibraryCollectionFilters
): number {
  return assets.filter(asset =>
    assetMatchesLibraryCollectionFilters(asset, filters)
  ).length;
}

const LIBRARY_COLLECTION_STATUSES = [
  'draft',
  'scheduled',
  'released',
] as const satisfies readonly LibraryCollectionStatus[];

const LIBRARY_COLLECTION_RELEASE_TYPES = [
  'single',
  'ep',
  'album',
  'compilation',
  'live',
  'mixtape',
  'music_video',
  'other',
] as const satisfies readonly LibraryCollectionReleaseType[];

const LIBRARY_COLLECTION_ASSET_KINDS = [
  'artwork',
  'preview',
  'lyrics',
  'providers',
  'video',
] as const satisfies readonly LibraryAssetKind[];

function isViewMode(value: unknown): value is LibraryViewMode {
  return value === 'grid' || value === 'list' || value === 'table';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function filterKnownValues<T extends string>(
  values: readonly string[],
  allowed: readonly T[]
): T[] {
  const allow = new Set<string>(allowed);
  return values.filter((value): value is T => allow.has(value));
}

function sanitizeFilters(raw: unknown): LibraryCollectionFilters | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (
    !isStringArray(record.statuses) ||
    !isStringArray(record.approvalStatuses) ||
    !isStringArray(record.releaseTypes) ||
    !isStringArray(record.assetKinds) ||
    !isStringArray(record.releaseTags)
  ) {
    return null;
  }
  return {
    statuses: filterKnownValues(record.statuses, LIBRARY_COLLECTION_STATUSES),
    approvalStatuses: filterKnownValues(
      record.approvalStatuses,
      LIBRARY_APPROVAL_STATUSES
    ),
    releaseTypes: filterKnownValues(
      record.releaseTypes,
      LIBRARY_COLLECTION_RELEASE_TYPES
    ),
    assetKinds: filterKnownValues(
      record.assetKinds,
      LIBRARY_COLLECTION_ASSET_KINDS
    ),
    releaseTags: record.releaseTags.map(tag => tag.trim()).filter(Boolean),
  };
}

function sanitizeCollection(raw: unknown): LibraryCollection | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  const filters = sanitizeFilters(record.filters);
  if (!filters) return null;
  if (
    record.viewMode !== null &&
    record.viewMode !== undefined &&
    !isViewMode(record.viewMode)
  ) {
    return null;
  }
  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt
      ? record.createdAt
      : new Date(0).toISOString();
  const updatedAt =
    typeof record.updatedAt === 'string' && record.updatedAt
      ? record.updatedAt
      : createdAt;

  return {
    id: record.id,
    name: record.name.trim(),
    filters,
    viewMode: isViewMode(record.viewMode) ? record.viewMode : null,
    createdAt,
    updatedAt,
  };
}

export function readPersistedLibraryCollections(): LibraryCollection[] {
  if (globalThis.window === undefined) return [];
  try {
    const stored = globalThis.localStorage?.getItem(
      LIBRARY_COLLECTIONS_STORAGE_KEY
    );
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeCollection)
      .filter((item): item is LibraryCollection => item !== null);
  } catch {
    return [];
  }
}

export function persistLibraryCollections(
  collections: readonly LibraryCollection[]
): void {
  if (globalThis.window === undefined) return;
  try {
    if (collections.length === 0) {
      globalThis.localStorage?.removeItem(LIBRARY_COLLECTIONS_STORAGE_KEY);
      return;
    }
    globalThis.localStorage?.setItem(
      LIBRARY_COLLECTIONS_STORAGE_KEY,
      JSON.stringify(collections)
    );
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

export function readPersistedActiveLibraryCollectionId(): string | null {
  if (globalThis.window === undefined) return null;
  try {
    const stored = globalThis.localStorage?.getItem(
      LIBRARY_ACTIVE_COLLECTION_STORAGE_KEY
    );
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

export function persistActiveLibraryCollectionId(id: string | null): void {
  if (globalThis.window === undefined) return;
  try {
    if (!id) {
      globalThis.localStorage?.removeItem(
        LIBRARY_ACTIVE_COLLECTION_STORAGE_KEY
      );
      return;
    }
    globalThis.localStorage?.setItem(LIBRARY_ACTIVE_COLLECTION_STORAGE_KEY, id);
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

function createCollectionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `col_${globalThis.crypto.randomUUID()}`;
  }
  // Cryptographically strong fallback when randomUUID is unavailable.
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(
      ''
    );
    return `col_${Date.now().toString(36)}_${hex}`;
  }
  throw new Error('Secure random number generator is unavailable');
}

export function createLibraryCollection(input: {
  readonly name: string;
  readonly filters: LibraryCollectionFilters;
  readonly viewMode?: LibraryViewMode | null;
  readonly now?: Date;
}): LibraryCollection | null {
  const name = input.name.trim();
  if (!name) return null;
  if (libraryCollectionFiltersAreEmpty(input.filters)) return null;

  const nowIso = (input.now ?? new Date()).toISOString();
  return {
    id: createCollectionId(),
    name,
    filters: {
      statuses: [...input.filters.statuses],
      approvalStatuses: [...input.filters.approvalStatuses],
      releaseTypes: [...input.filters.releaseTypes],
      assetKinds: [...input.filters.assetKinds],
      releaseTags: input.filters.releaseTags
        .map(tag => tag.trim())
        .filter(Boolean),
    },
    viewMode: input.viewMode ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function upsertLibraryCollection(
  collections: readonly LibraryCollection[],
  collection: LibraryCollection
): LibraryCollection[] {
  const index = collections.findIndex(item => item.id === collection.id);
  if (index === -1) {
    return [...collections, collection];
  }
  const next = [...collections];
  next[index] = collection;
  return next;
}

export function deleteLibraryCollection(
  collections: readonly LibraryCollection[],
  id: string
): LibraryCollection[] {
  return collections.filter(item => item.id !== id);
}

export function renameLibraryCollection(
  collections: readonly LibraryCollection[],
  id: string,
  name: string,
  now = new Date()
): LibraryCollection[] {
  const trimmed = name.trim();
  if (!trimmed) return [...collections];
  return collections.map(item =>
    item.id === id
      ? { ...item, name: trimmed, updatedAt: now.toISOString() }
      : item
  );
}

/** Human-readable one-line summary of what the collection filters on. */
export function summarizeLibraryCollectionFilters(
  filters: LibraryCollectionFilters
): string {
  const parts: string[] = [];
  if (filters.statuses.length > 0) {
    parts.push(`Status: ${filters.statuses.join(', ')}`);
  }
  if (filters.approvalStatuses.length > 0) {
    parts.push(`Approval: ${filters.approvalStatuses.join(', ')}`);
  }
  if (filters.releaseTypes.length > 0) {
    parts.push(`Type: ${filters.releaseTypes.join(', ')}`);
  }
  if (filters.assetKinds.length > 0) {
    parts.push(`Assets: ${filters.assetKinds.join(', ')}`);
  }
  if (filters.releaseTags.length > 0) {
    parts.push(`Tag: ${filters.releaseTags.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No filters';
}
