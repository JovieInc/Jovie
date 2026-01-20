'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface KanbanColumn<TData> {
  id: string;
  title: string;
  items: TData[];
  count: number;
  accent?: string;
}

export interface KanbanBoardProps<TData> {
  /**
   * Columns to display in the Kanban board
   */
  columns: KanbanColumn<TData>[];
  /**
   * Render function for card content
   */
  renderCard: (item: TData, index: number) => React.ReactNode;
  /**
   * Get unique ID for each item
   */
  getItemId: (item: TData) => string;
  /**
   * Callback when item is moved between columns
   */
  onItemMove?: (
    itemId: string,
    fromColumnId: string,
    toColumnId: string
  ) => void;
  /**
   * Optional empty state for columns with no items
   */
  emptyState?: React.ReactNode;
  /**
   * Card height for virtualization (default: 120px)
   */
  cardHeight?: number;
  /**
   * Enable virtualization for large datasets (default: true)
   */
  enableVirtualization?: boolean;
  /**
   * Optional className for the board container
   */
  className?: string;
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
}: KanbanBoardProps<TData>) {
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
  column: KanbanColumn<TData>;
  renderCard: (item: TData, index: number) => React.ReactNode;
  getItemId: (item: TData) => string;
  onItemMove?: (
    itemId: string,
    fromColumnId: string,
    toColumnId: string
  ) => void;
  emptyState?: React.ReactNode;
  cardHeight: number;
  enableVirtualization: boolean;
}

function KanbanColumn<TData>({
  column,
  renderCard,
  getItemId,
  onItemMove,
  emptyState,
  cardHeight,
  enableVirtualization,
}: KanbanColumnProps<TData>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: column.items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => cardHeight,
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
      <div
        ref={containerRef}
        className='flex-1 overflow-y-auto p-3'
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        role='group'
        aria-label={`${column.title} column items`}
      >
        {column.items.length === 0 ? (
          <div className='flex h-32 items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-0'>
            <div className='text-sm text-tertiary-token'>
              {emptyState ?? 'No items'}
            </div>
          </div>
        ) : enableVirtualization ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const item = column.items[virtualRow.index];
              return (
                <div
                  key={getItemId(item)}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className='mb-3'
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
                    e.dataTransfer.setData('itemId', getItemId(item));
                    e.dataTransfer.setData('columnId', column.id);
                  }}
                  role='listitem'
                >
                  {renderCard(item, virtualRow.index)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className='space-y-3' role='list'>
            {column.items.map((item, index) => (
              <div
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
                role='listitem'
              >
                {renderCard(item, index)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
