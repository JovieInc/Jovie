import type { ReactNode } from 'react';

export interface TableColumnCompactItem {
  readonly id: string;
  readonly node: ReactNode;
}

/**
 * Inline fold of hidden columns into the primary cell. One line, token type,
 * so the primary column can stretch without growing the row.
 */
export function TableColumnCompacts({
  items,
}: {
  readonly items: readonly TableColumnCompactItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div
      data-testid='table-column-compacts'
      className='ml-2 flex shrink-0 items-center gap-1 text-2xs text-tertiary-token'
    >
      {items.map((item, index) => (
        <span key={item.id} className='inline-flex items-center gap-1'>
          {index > 0 ? (
            <span
              aria-hidden='true'
              className='text-quaternary-token select-none'
            >
              ·
            </span>
          ) : null}
          {item.node}
        </span>
      ))}
    </div>
  );
}
