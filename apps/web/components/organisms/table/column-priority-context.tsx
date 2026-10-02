'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { TableColumnCompacts } from './molecules/TableColumnCompacts';

export interface ColumnCompactItem {
  readonly id: string;
  readonly render: (row: never) => ReactNode;
}

export interface ColumnCompactContextValue {
  readonly primaryId: string | null;
  readonly items: readonly ColumnCompactItem[];
}

const ColumnCompactContext = createContext<ColumnCompactContextValue | null>(
  null
);

export function ColumnCompactProvider({
  value,
  children,
}: {
  readonly value: ColumnCompactContextValue | null;
  readonly children: ReactNode;
}) {
  return (
    <ColumnCompactContext.Provider value={value}>
      {children}
    </ColumnCompactContext.Provider>
  );
}

function isPresent(node: ReactNode): boolean {
  if (node == null || node === false) return false;
  if (typeof node === 'string') return node.trim().length > 0;
  return true;
}

/**
 * Compact forms for the columns hidden at the current container width.
 * Render the result inside the primary cell only.
 */
export function usePrimaryColumnCompacts<TData>(row: TData): {
  readonly primaryId: string | null;
  readonly node: ReactNode;
} {
  const context = useContext(ColumnCompactContext);
  if (!context || context.primaryId == null || context.items.length === 0) {
    return { primaryId: context?.primaryId ?? null, node: null };
  }

  const items = context.items.flatMap(item => {
    const node = item.render(row as never);
    if (!isPresent(node)) return [];
    return [{ id: item.id, node }];
  });
  if (items.length === 0) {
    return { primaryId: context.primaryId, node: null };
  }

  return {
    primaryId: context.primaryId,
    node: <TableColumnCompacts items={items} />,
  };
}
