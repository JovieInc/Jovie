/**
 * @deprecated EmptyState is now a molecule — import from
 * `@/components/molecules/EmptyState` (or the `@/components/molecules` barrel).
 * This re-export shim keeps existing consumers working during the #12638
 * empty-state consolidation and will be removed once all imports migrate.
 */
export type { EmptyStateProps } from '@/components/molecules/EmptyState';
export { EmptyState } from '@/components/molecules/EmptyState';
