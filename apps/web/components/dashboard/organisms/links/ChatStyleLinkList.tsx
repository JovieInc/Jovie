'use client';

import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { useVirtualizer } from '@tanstack/react-virtual';
import React from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ChatStyleLinkItem } from './ChatStyleLinkItem';
import type { LinkCategoryGridProps } from './link-category-grid/types';
import { useLinkCategoryGrid } from './link-category-grid/useLinkCategoryGrid';
import { idFor, linkIsVisible } from './link-category-grid/utils';
import { labelFor, sectionOf } from './utils';

const LINK_SECTIONS = ['social', 'dsp', 'earnings', 'custom'] as const;

/**
 * ChatStyleLinkList - Renders links in a centered vertical list layout.
 *
 * This is an alternative to LinkCategoryGrid that displays links as full-width
 * rows in a chat-like interface, with the input at the bottom of the screen.
 */
export const ChatStyleLinkList = React.memo(function ChatStyleLinkList<
  T extends DetectedLink = DetectedLink,
>({
  links,
  onLinksChange,
  onToggle,
  onRemove,
  onEdit,
  openMenuId,
  onAnyMenuOpen,
  lastAddedId,
  buildPillLabel: _buildPillLabel,
  addingLink,
  pendingPreview,
  onAddPendingPreview,
  onCancelPendingPreview,
  onHint,
  modifiers = [],
  className,
  scrollContainerRef,
}: LinkCategoryGridProps<T>) {
  // Note: _buildPillLabel is intentionally unused - kept for type compatibility with LinkCategoryGridProps

  const { sensors, sortedGroups, mapIdToIndex, onDragEnd } =
    useLinkCategoryGrid({
      links,
      onLinksChange,
      onHint,
      pendingPreview,
      onAddPendingPreview,
      onCancelPendingPreview,
    });

  const sortedIds = React.useMemo(
    () => LINK_SECTIONS.flatMap(section => sortedGroups[section].map(idFor)),
    [sortedGroups]
  );

  const virtualRows = React.useMemo(() => {
    return LINK_SECTIONS.flatMap(section => {
      const items = sortedGroups[section];
      const isAddingToThis = addingLink && sectionOf(addingLink) === section;

      if (items.length === 0 && !isAddingToThis) {
        return [];
      }

      const rows: Array<{
        type: 'header' | 'link' | 'loading';
        section: (typeof LINK_SECTIONS)[number];
        link?: T;
      }> = [
        {
          type: 'header',
          section,
        },
        ...items.map(link => ({
          type: 'link' as const,
          section,
          link,
        })),
      ];

      if (isAddingToThis) {
        rows.push({
          type: 'loading',
          section,
        });
      }

      return rows;
    });
  }, [sortedGroups, addingLink]);

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: index => {
      const row = virtualRows[index];
      if (!row) return 72;
      // header: 8 (pt-2) + 16 (text) + 8 (pb-2) = 32px
      // link: larger on mobile for 44px tap targets
      return row.type === 'header' ? 32 : 88;
    },
    overscan: 6,
  });

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={modifiers}>
      <SortableContext items={sortedIds}>
        <div className={`w-full max-w-2xl ${className ?? ''}`}>
          <div
            className='relative w-full'
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const row = virtualRows[virtualRow.index];
              if (!row) return null;

              if (row.type === 'header') {
                return (
                  <div
                    key={`${row.section}-header`}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className='absolute left-0 top-0 w-full pb-2 pt-2'
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <h3 className='px-1 text-xs font-medium uppercase tracking-wide text-tertiary-token'>
                      {labelFor(row.section)}
                    </h3>
                  </div>
                );
              }

              if (row.type === 'loading') {
                return (
                  <div
                    key={`${row.section}-loading`}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className='absolute left-0 top-0 w-full pb-2'
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className='flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 opacity-60'>
                      <div className='h-4 w-4' />
                      <div className='flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-lg bg-surface-1' />
                      <div className='flex-1'>
                        <div className='text-sm text-secondary-token'>
                          Adding...
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              const link = row.link;
              if (!link) return null;
              const linkId = idFor(link);
              const linkIndex = mapIdToIndex.get(linkId) ?? -1;

              return (
                <div
                  key={linkId}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className='absolute left-0 top-0 w-full pb-2'
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ChatStyleLinkItem
                    id={linkId}
                    link={link}
                    index={linkIndex}
                    draggable={sortedGroups[row.section].length > 1}
                    onToggle={onToggle}
                    onRemove={onRemove}
                    onEdit={onEdit}
                    visible={linkIsVisible(link)}
                    openMenuId={openMenuId}
                    onAnyMenuOpen={onAnyMenuOpen}
                    isLastAdded={lastAddedId === linkId}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
});

(ChatStyleLinkList as unknown as { displayName: string }).displayName =
  'ChatStyleLinkList';
