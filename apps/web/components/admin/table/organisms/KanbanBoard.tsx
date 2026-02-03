'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface KanbanColumn<TData> {
  id: string;
  readonly title: string;
  readonly items: TData[];
  readonly count: number;
  readonly accent?: string;
}

export interface KanbanBoardProps<TData> {
  /**
   * Columns to display in the Kanban board
   */
  readonly columns: KanbanColumn<TData>[];
  /**
   * Render function for card content
   */
  readonly renderCard: (item: TData, index: number) => React.ReactNode;
  /**
   * Get unique ID for each item
   */
  readonly getItemId: (item: TData) => string;
  /**
   * Callback when item is moved between columns
   */
  readonly onItemMove?: (
    itemId: string,
    fromColumnId: string,
    toColumnId: string
  ) => void;
  /**
   * Optional empty state for columns with no items
   */
  readonly emptyState?: React.ReactNode;
  /**
   * Card height for virtualization (default: 120px)
   */
  readonly cardHeight?: number;
  /**
   * Enable virtualization for large datasets (default: true)
   */
  readonly enableVirtualization?: boolean;
  /**
   * Optional className for the board container
   */
  readonly className?: string;
}

/**
 * KanbanBoard - Kanban board view for tables
 *
 * Provides a board layout with columns and cards, useful for status-based workflows.
 * Features:
 * - Multiple columns with custom headers
 * - Virtualized scrolling for performance
 * - Drag & drop support (via external library integration)
 * - Responsive design with horizontal scroll on mobile
 * - Custom card rendering
 *
 * @example
 * ```tsx
 * <KanbanBoard
 *   columns={[
 *     { id: 'new', title: 'New', items: newEntries, count: 10 },
 *     { id: 'invited', title: 'Invited', items: invitedEntries, count: 5 },
 *   ]}
 *   renderCard={(entry) => <WaitlistCard entry={entry} />}
 *   getItemId={(entry) => entry.id}
 *   onItemMove={(id, from, to) => handleStatusChange(id, to)}
 * />
 * ```
 */
export function KanbanBoard<TData>({
  columns,
  renderCard,
  getItemId,
  onItemMove,
  emptyState,
  cardHeight = 120,
  enableVirtualization = true,
  className,
}: Readonly<KanbanBoardProps<TData>>) {
  const totalItems = useMemo(
    () => columns.reduce((sum, col) => sum + col.items.length, 0),
    [columns]
  );

  return (
    <div
      className={cn(
        'flex h-full min-h-0 gap-4 overflow-x-auto px-4 py-4 sm:px-6',
        className
      )}
    >
      {columns.map(column => (
        <KanbanColumn
          key={column.id}
          column={column}
          renderCard={renderCard}
          getItemId={getItemId}
          onItemMove={onItemMove}
          emptyState={emptyState}
          cardHeight={cardHeight}
          enableVirtualization={
            enableVirtualization && column.items.length > 10
          }
        />
      ))}

      {totalItems === 0 && emptyState && (
        <div className='flex flex-1 items-center justify-center'>
          {emptyState}
        </div>
      )}
    </div>
  );
}

interface KanbanColumnProps<TData> {
  readonly column: KanbanColumn<TData>;
  readonly renderCard: (item: TData, index: number) => React.ReactNode;
  readonly getItemId: (item: TData) => string;
  readonly onItemMove?: (
    itemId: string,
    fromColumnId: string,
    toColumnId: string
  ) => void;
  readonly emptyState?: React.ReactNode;
  readonly cardHeight: number;
  readonly enableVirtualization: boolean;
}

function KanbanColumn<TData>({
  column,
  renderCard,
  getItemId,
  onItemMove,
  emptyState,
  cardHeight,
  enableVirtualization,
}: Readonly<KanbanColumnProps<TData>>) {
  const containerRef = useRef<HTMLFieldSetElement>(null);
  const itemGap = 12; // 0.75rem to match `space-y-3` / `pb-3`

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is used intentionally despite React Compiler limitations
  const rowVirtualizer = useVirtualizer({
    count: column.items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => cardHeight + itemGap,
    overscan: 3,
    enabled: enableVirtualization,
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const itemId = e.dataTransfer.getData('itemId');
      const fromColumnId = e.dataTransfer.getData('columnId');

      if (itemId && fromColumnId && fromColumnId !== column.id && onItemMove) {
        onItemMove(itemId, fromColumnId, column.id);
      }
    },
    [column.id, onItemMove]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className='flex min-w-[320px] max-w-[400px] flex-1 flex-col rounded-lg border border-subtle bg-surface-1'>
      {/* Column Header */}
      <div className='flex items-center justify-between border-b border-subtle px-4 py-3'>
        <div className='flex items-center gap-2'>
          {column.accent && (
            <span
              className='h-2 w-2 rounded-full'
              style={{ backgroundColor: column.accent }}
              aria-hidden='true'
            />
          )}
          <h3 className='text-sm font-semibold text-primary-token'>
            {column.title}
          </h3>
        </div>
      </div>

      {/* Column Content */}
      <fieldset
        ref={containerRef}
        className='flex-1 overflow-y-auto p-3 m-0 min-w-0 border-0'
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <legend className='sr-only'>{`${column.title} column items`}</legend>
        {(() => {
          if (column.items.length === 0) {
            return (
              <div className='flex h-32 items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-0'>
                <div className='text-sm text-tertiary-token'>
                  {emptyState ?? 'No items'}
                </div>
              </div>
            );
          }

          if (enableVirtualization) {
            return (
              <ul
                className='m-0 list-none p-0'
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                  const item = column.items[virtualRow.index];
                  if (!item) return null;

                  const itemId = getItemId(item);

                  return (
                    <li
                      key={itemId}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className={cn(
                        'pb-3',
                        onItemMove &&
                          'cursor-move transition-opacity hover:opacity-80'
                      )}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      draggable={Boolean(onItemMove)}
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('itemId', itemId);
                        e.dataTransfer.setData('columnId', column.id);
                      }}
                    >
                      {renderCard(item, virtualRow.index)}
                    </li>
                  );
                })}
              </ul>
            );
          }

          return (
            <ul className='m-0 list-none space-y-3 p-0'>
              {column.items.map((item, index) => (
                <li
                  key={getItemId(item)}
                  draggable={Boolean(onItemMove)}
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('itemId', getItemId(item));
                    e.dataTransfer.setData('columnId', column.id);
                  }}
                  className={cn(
                    onItemMove &&
                      'cursor-move transition-opacity hover:opacity-80'
                  )}
                >
                  {renderCard(item, index)}
                </li>
              ))}
            </ul>
          );
        })()}
      </fieldset>
    </div>
  );
}
