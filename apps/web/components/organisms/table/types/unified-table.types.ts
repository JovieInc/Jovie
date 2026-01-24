/**
 * Type definitions for UnifiedTable components
 *
 * Centralized type definitions for the table component system.
 */

import type {
  ColumnDef,
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table';
import type { ContextMenuItemType } from '../molecules/TableContextMenu';

/**
 * Props for the UnifiedTable component
 */
export interface UnifiedTableProps<TData> {
  /**
   * Table data
   */
  data: TData[];

  /**
   * Column definitions (TanStack Table format)
   */
  columns: ColumnDef<TData, unknown>[];

  /**
   * Loading state
   */
  isLoading?: boolean;

  /**
   * Empty state component
   */
  emptyState?: React.ReactNode;

  /**
   * Row selection state (controlled)
   */
  rowSelection?: RowSelectionState;

  /**
   * Row selection change handler
   */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  /**
   * Sorting state (controlled)
   */
  sorting?: SortingState;

  /**
   * Sorting change handler
   */
  onSortingChange?: OnChangeFn<SortingState>;

  /**
   * Enable virtualization for large datasets
   * @default true for 20+ rows
   */
  enableVirtualization?: boolean;

  /**
   * Estimated row height for virtualization
   * @default 44
   */
  rowHeight?: number;

  /**
   * Number of rows to render above/below viewport
   * @default 5
   */
  overscan?: number;

  /**
   * Custom row renderer
   */
  renderRow?: (row: TData, index: number) => React.ReactNode;

  /**
   * Get unique row ID
   */
  getRowId?: (row: TData) => string;

  /**
   * Click handler for row
   */
  onRowClick?: (row: TData) => void;

  /**
   * Context menu handler for row
   */
  onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;

  /**
   * Get context menu items for a row
   */
  getContextMenuItems?: (row: TData) => ContextMenuItemType[];

  /**
   * Get custom class names for a row
   */
  getRowClassName?: (row: TData, index: number) => string;

  /**
   * Additional table class names
   */
  className?: string;

  /**
   * Min width for table (prevents column squishing)
   */
  minWidth?: string;

  /**
   * Number of skeleton rows to show when loading
   * @default 20
   */
  skeletonRows?: number;

  /**
   * Optional grouping configuration
   * When provided, table will render with grouped rows and sticky group headers
   */
  groupingConfig?: {
    getGroupKey: (row: TData) => string;
    getGroupLabel: (key: string) => string;
  };

  /**
   * Enable keyboard navigation (arrow keys to move, Enter to select)
   * @default true when onRowClick is provided
   */
  enableKeyboardNavigation?: boolean;

  /**
   * Currently focused row index (controlled)
   */
  focusedRowIndex?: number;

  /**
   * Callback when focused row changes via keyboard
   */
  onFocusedRowChange?: (index: number) => void;
}

/**
 * Props for the UnifiedTableRow component
 */
export interface UnifiedTableRowProps<TData> {
  /**
   * TanStack Table row object
   */
  row: Row<TData>;

  /**
   * Index of the row in the data array
   */
  rowIndex: number;

  /**
   * Map to store row element refs for scroll management
   */
  rowRefsMap: Map<number, HTMLTableRowElement>;

  /**
   * Whether keyboard navigation is enabled
   */
  shouldEnableKeyboardNav: boolean;

  /**
   * Whether virtualization is enabled
   */
  shouldVirtualize: boolean;

  /**
   * Virtual item start position (for virtualized rows)
   */
  virtualStart?: number;

  /**
   * Currently focused row index
   */
  focusedIndex: number;

  /**
   * Click handler for row
   */
  onRowClick?: (row: TData) => void;

  /**
   * Context menu handler for row
   */
  onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;

  /**
   * Keyboard event handler
   */
  onKeyDown: (e: React.KeyboardEvent, rowIndex: number, rowData: TData) => void;

  /**
   * Callback when focus changes
   */
  onFocusChange: (index: number) => void;

  /**
   * Get custom class names for a row
   */
  getRowClassName?: (row: TData, index: number) => string;

  /**
   * Measure element callback for virtualization
   */
  measureElement?: (el: HTMLElement | null) => void;
}
