import type { CellData, RowData, TableFeatures } from '@tanstack/react-table';
import type { ReactNode } from 'react';
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
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Additional tokenized cell/header classes owned by the consumer. */
    readonly className?: string;
    /** Override the default single-line cell-content geometry for this column. */
    readonly cellContentClassName?: string;
    /** Horizontal alignment for dense numeric/action columns. */
    readonly align?: 'left' | 'center' | 'right';
    /** Keep the header in the accessibility tree but remove visible label chrome. */
    readonly headerVisibility?: 'visible' | 'sr-only';
    /** Reserve the action cell while revealing its contents only in contextual states. */
    readonly actionVisibility?: 'always' | 'contextual';
    /**
     * Higher values stay visible longer as the container narrows. Columns that
     * share a priority hide together. Omit it to keep the column essential.
     */
    readonly priority?: number;
    /**
     * Fit budget in px. The column stays visible only while this width, summed
     * with the other visible columns, fits the container. Defaults to minSize,
     * then size. It can be wider than the rendered column so a tier waits for
     * room to breathe.
     */
    readonly minWidth?: number;
    /** Receives compact forms from columns hidden by the priority layout. */
    readonly primary?: boolean;
    /** Folded into the primary cell when this column is hidden. */
    readonly compact?: (row: TData) => ReactNode;
  }
}

export {};
