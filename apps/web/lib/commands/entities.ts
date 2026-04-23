/**
 * EntityProvider registry — per-kind pluggable adapters for the entity types
 * that can be referenced as chips in chat input, surfaced in the `/` menu's
 * entity picker, and (later, JOV-1792) navigated-to from cmd+k.
 *
 * Each provider owns:
 *   - a search hook (TanStack Query-based, already exists per kind)
 *   - a serializer from the domain object to the chip's display shape
 *   - a renderer for the chip pill
 *
 * The provider shape intentionally decouples the registry from any single
 * data source: releases come from a creator-scoped server action, artists
 * from Spotify search, tracks (future) from internal tables. The consuming
 * UI doesn't care.
 *
 * This module defines the shape. Concrete providers live in sibling files
 * (e.g. `release-provider.tsx`) and are wired up when the chat surface
 * changes land.
 */

import type { ReactNode } from 'react';
import type { EntityKind } from '@/lib/chat/tokens';

export interface EntityRef {
  readonly kind: EntityKind;
  readonly id: string;
  readonly label: string;
  readonly thumbnail?: string;
}

export interface EntitySearchResult {
  readonly items: readonly EntityRef[];
  readonly isLoading: boolean;
}

/**
 * Hook signature for per-kind search. Must be callable from a React component
 * (hooks rules apply). The `query` arg is the raw input from the slash menu
 * after the skill prefix is stripped. Empty string should return a reasonable
 * default set (recent items, pinned items, etc.) when practical.
 */
export type UseEntitySearch = (query: string) => EntitySearchResult;

export interface EntityProvider {
  readonly kind: EntityKind;
  readonly label: string;
  readonly useSearch: UseEntitySearch;
  readonly renderChip: (ref: EntityRef) => ReactNode;
}

/**
 * Populated when concrete providers are imported by the app shell.
 * Kept as a mutable record so providers can register lazily from their own
 * files without forcing this module to import every hook at load time.
 */
const PROVIDERS: Partial<Record<EntityKind, EntityProvider>> = {};

export function registerEntityProvider(provider: EntityProvider): void {
  if (PROVIDERS[provider.kind]) {
    throw new Error(`EntityProvider already registered for kind: ${provider.kind}`);
  }
  PROVIDERS[provider.kind] = provider;
}

export function getEntityProvider(
  kind: EntityKind
): EntityProvider | undefined {
  return PROVIDERS[kind];
}

export function listRegisteredKinds(): EntityKind[] {
  return Object.keys(PROVIDERS) as EntityKind[];
}
