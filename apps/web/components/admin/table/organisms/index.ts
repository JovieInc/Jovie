/**
 * @deprecated Import from @/components/organisms/table instead
 * Re-exports from organisms/table for backwards compatibility
 */

// Re-export from unified organisms/table location
export {
  UnifiedTable,
  type UnifiedTableProps,
} from '@/components/organisms/table';

// Admin-specific organism (kept for now)
export { KanbanBoard } from './KanbanBoard';
