import type { RowData } from '@tanstack/react-table';
import '@tanstack/react-table';

/**
 * Shared presentation metadata for UnifiedTable columns.
 *
 * Keep this deliberately visual-only: data and action ownership stay with the
 * feature that defines the column. These flags let a dense workspace table
 * express semantic headers and stable contextual affordances without copying
 * row-state CSS into each consumer.
 */
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Additional tokenized cell/header classes owned by the consumer. */
    readonly className?: string;
    /** Keep the header in the accessibility tree but remove visible label chrome. */
    readonly headerVisibility?: 'visible' | 'sr-only';
    /** Reserve the action cell while revealing its contents only in contextual states. */
    readonly actionVisibility?: 'always' | 'contextual';
  }
}

export {};
