'use client';

import {
  DndContext,
  type DragEndEvent,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext } from '@dnd-kit/sortable';
import React, { useCallback, useMemo } from 'react';
import { CategorySection } from '@/components/dashboard/atoms/CategorySection';
import {
  LinkPill,
  type LinkPillMenuItem,
} from '@/components/dashboard/atoms/LinkPill';
import { popularityIndex } from '@/constants/app';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { SortableLinkItem } from './SortableLinkItem';
import {
  canMoveTo,
  groupLinks,
  type LinkSection,
  labelFor,
  sectionOf,
  suggestionIdentity,
} from './utils';

/**
 * Pending preview state for a link being added
 */
export interface PendingPreview {
  link: DetectedLink;
  isDuplicate: boolean;
}

/**
 * Props for the LinkCategoryGrid component
 */
export interface LinkCategoryGridProps<T extends DetectedLink = DetectedLink> {
  /** Array of all links */
  links: T[];

  /** Callback when links are reordered via drag-and-drop */
  onLinksChange: (links: T[]) => void;

  /** Handler for toggling link visibility */
  onToggle: (idx: number) => void;

  /** Handler for removing a link */
  onRemove: (idx: number) => void;

  /** Handler for editing a link */
  onEdit: (idx: number) => void;

  /** ID of the currently open action menu */
  openMenuId: string | null;

  /** Callback when any menu opens/closes */
  onAnyMenuOpen: (id: string | null) => void;

  /** ID of the most recently added link (for highlight animation) */
  lastAddedId: string | null;

  /** Function to build the primary label for a pill */
  buildPillLabel: (link: DetectedLink) => string;

  /** Link currently being added (shows loading state) */
  addingLink: T | null;

  /** Preview of a link about to be added */
  pendingPreview: PendingPreview | null;

  /** Handler for adding the pending preview link */
  onAddPendingPreview: (link: DetectedLink) => void;

  /** Handler for canceling the pending preview */
  onCancelPendingPreview: () => void;

  /** Callback when hint message should be shown (for invalid drag moves) */
  onHint: (message: string | null) => void;

  /** DnD modifiers (optional) */
  modifiers?: Modifier[];

  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Check if a link is visible based on its isVisible property
 */
function linkIsVisible<T extends DetectedLink>(link: T): boolean {
  return (
    ((link as unknown as { isVisible?: boolean }).isVisible ?? true) !== false
  );
}

/**
 * Generate a stable ID for a link
 */
function idFor<T extends DetectedLink>(link: T): string {
  return `${link.platform.id}::${link.normalizedUrl || link.originalUrl || ''}`;
}

/**
 * LinkCategoryGrid - Renders the grid of link categories with drag-and-drop support.
 *
 * This component handles:
 * - DndContext wrapping for drag-and-drop functionality
 * - Rendering CategorySection containers for each link section (Social, Music Service, etc.)
 * - SortableLinkItem components for each link within sections
 * - Pending preview display for links about to be added
 * - Loading state for links currently being added
 * - Cross-section drag validation (e.g., YouTube can be in both Social and Music Service)
 *
 * @example
 * ```tsx
 * <LinkCategoryGrid
 *   links={links}
 *   onLinksChange={setLinks}
 *   onToggle={handleToggle}
 *   onRemove={handleRemove}
 *   onEdit={handleEdit}
 *   openMenuId={openMenuId}
 *   onAnyMenuOpen={handleAnyMenuOpen}
 *   lastAddedId={lastAddedId}
 *   buildPillLabel={buildPillLabel}
 *   addingLink={addingLink}
 *   pendingPreview={pendingPreview}
 *   onAddPendingPreview={handleAddPendingPreview}
 *   onCancelPendingPreview={handleCancelPendingPreview}
 *   onHint={setHint}
 * />
 * ```
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
  // Pointer sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Group links by section
  const groups = useMemo(() => groupLinks(links), [links]);

  // Sort links within each section by popularity
  const sortedGroups = useMemo(() => {
    const sorted: Record<LinkSection, T[]> = {
      social: [],
      dsp: [],
      earnings: [],
      custom: [],
    };

    (['social', 'dsp', 'earnings', 'custom'] as const).forEach(section => {
      sorted[section] = groups[section]
        .slice()
        .sort(
          (a, b) =>
            popularityIndex(a.platform.id) - popularityIndex(b.platform.id)
        );
    });

    return sorted;
  }, [groups]);

  // Map of link IDs to their indices for efficient lookup (used in drag-and-drop)
  const mapIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, idx) => {
      m.set(idFor(l), idx);
    });
    return m;
  }, [links]);

  // Map of normalizedUrl to index for O(1) lookup in render loop
  // This eliminates O(n) findIndex calls for each link, reducing complexity
  // from O(n²) to O(n) for rendering n links
  const mapNormalizedUrlToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, idx) => {
      const key = l.normalizedUrl || l.originalUrl || '';
      if (key) {
        m.set(key, idx);
      }
    });
    return m;
  }, [links]);

  /**
   * Handle drag-and-drop end event
   * Validates cross-section moves and updates link order
   */
  const onDragEnd = useCallback(
    (ev: DragEndEvent) => {
      const { active, over } = ev;
      if (!over) return;
      if (active.id === over.id) return;

      const fromIdx = mapIdToIndex.get(String(active.id));
      const toIdx = mapIdToIndex.get(String(over.id));
      if (fromIdx == null || toIdx == null) return;

      const from = links[fromIdx];
      const to = links[toIdx];
      if (!from || !to) return;
      const fromSection = sectionOf(from);
      const toSection = sectionOf(to);

      // Same section - just reorder
      if (fromSection === toSection) {
        const next = arrayMove(links, fromIdx, toIdx);
        onLinksChange(next);
        return;
      }

      // Cross-section move - validate
      if (!canMoveTo(from, toSection)) {
        const platformName = from.platform.name || from.platform.id;
        const targetLabel = labelFor(toSection);
        onHint(
          `${platformName} can't be moved to ${targetLabel}. Only certain platforms (e.g., YouTube) can live in multiple sections.`
        );
        window.setTimeout(() => onHint(null), 2400);
        return;
      }

      // Valid cross-section move - update category
      const next = [...links];
      const nextCategory = (() => {
        if (
          toSection === 'social' ||
          toSection === 'dsp' ||
          toSection === 'earnings'
        ) {
          return toSection;
        }
        const currentCategory = (from.platform.category ?? 'custom') as
          | 'social'
          | 'dsp'
          | 'earnings'
          | 'websites'
          | 'custom';
        if (
          currentCategory === 'earnings' ||
          currentCategory === 'websites' ||
          currentCategory === 'custom'
        ) {
          return currentCategory;
        }
        return 'custom';
      })();

      const updated = {
        ...from,
        platform: { ...from.platform, category: nextCategory },
      } as T;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, updated);
      onLinksChange(next);
    },
    [links, mapIdToIndex, onLinksChange, onHint]
  );

  /**
   * Build secondary text for a link (usually @username)
   */
  const buildSecondaryText = useCallback(
    (link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>) => {
      return suggestionIdentity(link);
    },
    []
  );

  /**
   * Menu items for pending preview pill
   */
  const pendingPreviewMenuItems: LinkPillMenuItem[] = useMemo(
    () => [
      {
        id: 'add',
        label: 'Add',
        iconName: 'Plus',
        onSelect: () => {
          if (pendingPreview) {
            onAddPendingPreview(pendingPreview.link);
          }
        },
      },
      {
        id: 'cancel',
        label: 'Cancel',
        iconName: 'X',
        onSelect: () => {
          onCancelPendingPreview();
        },
      },
    ],
    [pendingPreview, onAddPendingPreview, onCancelPendingPreview]
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={modifiers}>
      <div
        className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ''}`}
      >
        {(['social', 'dsp', 'earnings', 'custom'] as const).map(section => {
          const items = sortedGroups[section];

          const isAddingToThis =
            addingLink && sectionOf(addingLink) === section;

          // Don't render empty sections unless we're adding to them
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
                  // Use memoized map for O(1) lookup instead of O(n) findIndex
                  const linkKey = link.normalizedUrl || link.originalUrl || '';
                  const linkIndex = mapNormalizedUrlToIndex.get(linkKey) ?? -1;

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

                {/* Pending preview - show link about to be added */}
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

                {/* Loading state for link being added */}
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

// Set displayName for debugging
(LinkCategoryGrid as unknown as { displayName: string }).displayName =
  'LinkCategoryGrid';
