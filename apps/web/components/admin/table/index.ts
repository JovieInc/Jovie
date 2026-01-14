/**
 * @deprecated Import from @/components/organisms/table instead
 *
 * This file provides backwards compatibility during table system consolidation.
 * The admin/table components have been consolidated into organisms/table with
 * enhanced TanStack Table and TanStack Virtual integration.
 *
 * Migration guide:
 * - Replace `@/components/admin/table` with `@/components/organisms/table`
 * - All components, hooks, and utilities are exported from the unified location
 *
 * @example
 * // Old (deprecated)
 * import { UnifiedTable } from '@/components/admin/table/organisms/UnifiedTable';
 *
 * // New (recommended)
 * import { UnifiedTable } from '@/components/organisms/table';
 */

// Re-export everything from the consolidated organisms/table
export * from '@/components/organisms/table';

// Admin-specific utilities (kept for now)
export { AdminPageSizeSelect } from './AdminPageSizeSelect';
export { AdminTableShell } from './AdminTableShell';
export { SortableHeaderButton } from './SortableHeaderButton';
export {
  type UseCSVExportOptions,
  type UseCSVExportResult,
  useCSVExport,
} from './useCSVExport';
