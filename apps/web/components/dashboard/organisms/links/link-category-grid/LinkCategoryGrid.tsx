'use client';

import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import React from 'react';
import { CategorySection } from '@/components/dashboard/atoms/CategorySection';
import { LinkPill } from '@/components/dashboard/atoms/LinkPill';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { SortableLinkItem } from '../SortableLinkItem';
import { labelFor, sectionOf } from '../utils';
import type { LinkCategoryGridProps } from './types';
import { useLinkCategoryGrid } from './useLinkCategoryGrid';
import { idFor, linkIsVisible } from './utils';

/**
 * LinkCategoryGrid - Renders the grid of link categories with drag-and-drop support.
 */
export const LinkCategoryGrid = React.memo(function LinkCategoryGrid<
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
  const {
    sensors,
    sortedGroups,
    mapIdToIndex,
    onDragEnd,
    buildSecondaryText,
    pendingPreviewMenuItems,
  } = useLinkCategoryGrid({
    links,
    onLinksChange,
    onHint,
    pendingPreview,
    onAddPendingPreview,
    onCancelPendingPreview,
  });

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={modifiers}>
      <div className={`mt-6 space-y-3 ${className ?? ''}`}>
        {(['social', 'dsp', 'earnings', 'custom'] as const).map(section => {
          const items = sortedGroups[section];

          const isAddingToThis =
            addingLink && sectionOf(addingLink) === section;

          if (items.length === 0 && !isAddingToThis) {
            return null;
          }

          return (
            <CategorySection
              key={section}
              title={labelFor(section)}
              variant='card'
            >
              <SortableContext items={items.map(idFor)}>
                {items.map(link => {
                  const linkId = idFor(link);
                  const linkIndex = mapIdToIndex.get(linkId) ?? -1;

                  return (
                    <SortableLinkItem
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
                      buildPillLabel={buildPillLabel}
                    />
                  );
                })}

                {pendingPreview &&
                sectionOf(pendingPreview.link as T) === section ? (
                  <LinkPill
                    platformIcon={pendingPreview.link.platform.icon}
                    platformName={pendingPreview.link.platform.name}
                    primaryText={buildPillLabel(pendingPreview.link)}
                    secondaryText={buildSecondaryText(pendingPreview.link)}
                    state='ready'
                    badgeText='Ready to add'
                    menuId='pending-preview'
                    isMenuOpen={openMenuId === 'pending-preview'}
                    onMenuOpenChange={next =>
                      onAnyMenuOpen(next ? 'pending-preview' : null)
                    }
                    menuItems={pendingPreviewMenuItems}
                  />
                ) : null}

                {isAddingToThis && (
                  <LinkPill
                    platformIcon='website'
                    platformName='Loading'
                    primaryText='Adding...'
                    state='loading'
                    menuId={`loading-${section}`}
                    isMenuOpen={false}
                    onMenuOpenChange={() => {}}
                    menuItems={[]}
                  />
                )}
              </SortableContext>
            </CategorySection>
          );
        })}
      </div>
    </DndContext>
  );
});

(LinkCategoryGrid as unknown as { displayName: string }).displayName =
  'LinkCategoryGrid';
