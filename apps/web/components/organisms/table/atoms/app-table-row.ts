/**
 * Shared app table/list row contract (JOV-14762).
 *
 * Every UnifiedTable row and shell list row that follows the catalog pattern
 * (media · title · meta · numeric · actions) must use these tokens so vertical
 * centers, media boxes, and hover action slots stay identical across surfaces.
 */

import { TABLE_ROW_MODES, type TableRowMode } from '../table.styles';

/** Fixed media boxes for row icons/artwork. Dense content is 24px; prefer 28/32 elsewhere. */
export const APP_TABLE_MEDIA_SIZE = {
  dense: 24,
  compact: 28,
  list: 32,
} as const satisfies Record<'dense' | 'compact' | 'list', number>;

export type AppTableMediaSize =
  (typeof APP_TABLE_MEDIA_SIZE)[keyof typeof APP_TABLE_MEDIA_SIZE];

export function appTableMediaSizeForRowMode(
  mode: TableRowMode | undefined
): AppTableMediaSize {
  if (mode === 'dense') return APP_TABLE_MEDIA_SIZE.dense;
  if (mode === 'list' || mode === 'two-line') return APP_TABLE_MEDIA_SIZE.list;
  return APP_TABLE_MEDIA_SIZE.compact;
}

export function appTableRowHeightForMode(
  mode: TableRowMode | undefined
): number {
  if (!mode) return TABLE_ROW_MODES.compact.rowHeight;
  return TABLE_ROW_MODES[mode].rowHeight;
}

/**
 * Stable cell content host: one flex row, items centered, height from the
 * table row-mode CSS vars (`--table-cell-content-height`). Never baseline-
 * align media against text — children sit on the shared vertical center.
 */
export const APP_TABLE_CELL_CONTENT_CLASSNAME =
  'flex h-8 max-h-8 min-w-0 items-center overflow-hidden leading-none [&>*]:max-w-full';

/** Single-line text cell: one line-height, ellipsis truncate. */
export const APP_TABLE_TEXT_CLASSNAME =
  'block min-w-0 truncate text-app font-caption leading-none text-primary-token';

/** Secondary/meta text in the same row. */
export const APP_TABLE_META_TEXT_CLASSNAME =
  'block min-w-0 truncate text-2xs leading-none text-tertiary-token';

/** Numeric columns: right-aligned tabular figures. */
export const APP_TABLE_NUMERIC_CLASSNAME =
  'block w-full truncate text-right text-2xs leading-none tabular-nums text-tertiary-token';

/** Fixed square host for artwork/icons — size via inline style or Tailwind. */
export const APP_TABLE_MEDIA_CLASSNAME =
  'relative inline-flex shrink-0 items-center justify-center overflow-hidden';

/** Marker attribute for CI alignment + ratchet. */
export const APP_TABLE_ROW_ATTR = 'data-app-table-row' as const;
export const APP_TABLE_CELL_ATTR = 'data-app-table-cell' as const;
