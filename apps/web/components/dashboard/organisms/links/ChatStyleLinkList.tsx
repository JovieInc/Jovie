'use client';

import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import React from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ChatStyleLinkItem } from './ChatStyleLinkItem';
import type { LinkCategoryGridProps } from './link-category-grid/types';
import { useLinkCategoryGrid } from './link-category-grid/useLinkCategoryGrid';
import { idFor, linkIsVisible } from './link-category-grid/utils';
import { labelFor, sectionOf } from './utils';

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
  buildPillLabel,
  addingLink,
  pendingPreview,
  onAddPendingPreview,
  onCancelPendingPreview,
  onHint,
  modifiers = [],
  className,
}: LinkCategoryGridProps<T>) {
  const { sensors, sortedGroups, mapIdToIndex, onDragEnd } =
    useLinkCategoryGrid({
      links,
      onLinksChange,
      onHint,
      pendingPreview,
      onAddPendingPreview,
      onCancelPendingPreview,
    });

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={modifiers}>
      <div className={`w-full max-w-2xl space-y-6 ${className ?? ''}`}>
        {(['social', 'dsp', 'earnings', 'custom'] as const).map(section => {
          const items = sortedGroups[section];
          const isAddingToThis =
            addingLink && sectionOf(addingLink) === section;

          if (items.length === 0 && !isAddingToThis) {
            return null;
          }

          return (
            <div key={section} className='space-y-2'>
              {/* Category header */}
              <h3 className='px-2 text-xs font-semibold uppercase tracking-wider text-tertiary-token'>
                {labelFor(section)}
              </h3>

              {/* Links */}
              <SortableContext items={items.map(idFor)}>
                <div className='space-y-2'>
                  {items.map(link => {
                    const linkId = idFor(link);
                    const linkIndex = mapIdToIndex.get(linkId) ?? -1;

                    return (
                      <ChatStyleLinkItem
                        key={linkId}
                        id={linkId}
                        link={link}
                        index={linkIndex}
                        draggable={items.length > 1}
                        onToggle={onToggle}
                        onRemove={onRemove}
                        onEdit={onEdit}
                        visible={linkIsVisible(link)}
                        openMenuId={openMenuId}
                        onAnyMenuOpen={onAnyMenuOpen}
                        isLastAdded={lastAddedId === linkId}
                      />
                    );
                  })}

                  {/* Loading state for link being added */}
                  {isAddingToThis && (
                    <div className='flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 opacity-60'>
                      <div className='h-4 w-4' />
                      <div className='flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-lg bg-surface-1' />
                      <div className='flex-1'>
                        <div className='text-sm text-secondary-token'>
                          Adding...
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
});

(ChatStyleLinkList as unknown as { displayName: string }).displayName =
  'ChatStyleLinkList';
