import type {
  CellData,
  RowData,
  TableFeatures,
} from '@tanstack/react-table';
import '@tanstack/react-table';

/**
 * Shared presentation metadata for UnifiedTable columns.
 *
 * Keep this deliberately visual-only: data and action ownership stay with the
 * feature that defines the column. These flags let a dense workspace table
 * express semantic headers and stable contextual affordances without copying
 * row-state CSS into each consumer.
 *
 * TanStack Table v9 made `ColumnMeta` three-generic
 * (`<TFeatures, TData, TValue>`); all declarations must match that shape
 * exactly for declaration merging to succeed.
 */
declare module '@tanstack/react-table' {
  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Additional tokenized cell/header classes owned by the consumer. */
    readonly className?: string;
    /** Horizontal alignment for dense numeric/action columns. */
    readonly align?: 'left' | 'center' | 'right';
    /** Keep the header in the accessibility tree but remove visible label chrome. */
    readonly headerVisibility?: 'visible' | 'sr-only';
    /** Reserve the action cell while revealing its contents only in contextual states. */
    readonly actionVisibility?: 'always' | 'contextual';
  }
}

export {};
