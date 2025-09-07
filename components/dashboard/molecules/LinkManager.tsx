'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/ToastContainer';
import { MAX_SOCIAL_LINKS } from '@/constants/app';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { LinkItem } from '@/types/links';
import { SortableLinkItem } from '../atoms/SortableLinkItem';
import { UniversalLinkInput } from '../atoms/UniversalLinkInput';

interface LinkManagerProps {
  initialLinks?: LinkItem[];
  onLinksChange: (links: LinkItem[]) => void;
  onLinkAdded?: (links: LinkItem[]) => void; // Immediate save callback for new links
  disabled?: boolean;
  maxLinks?: number;
  allowedCategory?: 'dsp' | 'social' | 'custom' | 'all';
  title?: string;
  description?: string;
  prefillUrl?: string;
}

export const LinkManager: React.FC<LinkManagerProps> = ({
  initialLinks = [],
  onLinksChange,
  onLinkAdded,
  disabled = false,
  maxLinks = 20,
  allowedCategory = 'all',
  title: _title = 'Manage Links', // eslint-disable-line @typescript-eslint/no-unused-vars
  description:
    _description = 'Add and organize your links. Changes save automatically.', // eslint-disable-line @typescript-eslint/no-unused-vars
  prefillUrl,
}) => {
  const [links, setLinks] = useState<LinkItem[]>(
    initialLinks.sort((a, b) => a.order - b.order)
  );
  const [deletedLinks, setDeletedLinks] = useState<
    { link: LinkItem; timeout: NodeJS.Timeout }[]
  >([]);
  const [focusedLinkIndex, setFocusedLinkIndex] = useState<number>(-1);
  const { showToast } = useToast();
  const linksContainerRef = useRef<HTMLDivElement>(null);
  const linkItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Update refs array when links change
  useEffect(() => {
    linkItemRefs.current = linkItemRefs.current.slice(0, links.length);
  }, [links.length]);

  // Enhanced keyboard sensor with better accessibility
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle keyboard navigation for the links list
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled || links.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedLinkIndex(prev => {
            const newIndex = prev < links.length - 1 ? prev + 1 : 0;
            linkItemRefs.current[newIndex]?.focus();
            return newIndex;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedLinkIndex(prev => {
            const newIndex = prev > 0 ? prev - 1 : links.length - 1;
            linkItemRefs.current[newIndex]?.focus();
            return newIndex;
          });
          break;
        case 'Home':
          e.preventDefault();
          setFocusedLinkIndex(0);
          linkItemRefs.current[0]?.focus();
          break;
        case 'End':
          e.preventDefault();
          setFocusedLinkIndex(links.length - 1);
          linkItemRefs.current[links.length - 1]?.focus();
          break;
      }
    },
    [disabled, links.length]
  );

  // Update parent when links change
  const updateLinks = useCallback(
    (newLinks: LinkItem[]) => {
      const sortedLinks = newLinks.map((link, index) => ({
        ...link,
        order: index,
      }));
      setLinks(sortedLinks);
      onLinksChange(sortedLinks);
    },
    [onLinksChange]
  );

  // Undo delete
  const handleUndoDelete = useCallback(
    (linkId: string) => {
      const deletedItem = deletedLinks.find(item => item.link.id === linkId);
      if (!deletedItem) return;

      // Clear the timeout
      clearTimeout(deletedItem.timeout);

      // Remove from deleted links
      setDeletedLinks(prev => prev.filter(item => item.link.id !== linkId));

      // Add back to active links at original position
      const newLinks = [...links];
      const insertIndex = Math.min(deletedItem.link.order, newLinks.length);
      newLinks.splice(insertIndex, 0, deletedItem.link);

      updateLinks(newLinks);

      // Show confirmation toast
      showToast({
        message: `Restored "${deletedItem.link.title}"`,
        type: 'success',
        duration: 2000,
      });
    },
    [deletedLinks, links, updateLinks, showToast]
  );

  // Add new link
  const handleAddLink = useCallback(
    (detectedLink: DetectedLink) => {
      if (links.length >= maxLinks) {
        showToast({
          message: `Maximum of ${maxLinks} links allowed`,
          type: 'warning',
          duration: 3000,
        });
        return;
      }

      // Validate platform category
      if (
        allowedCategory !== 'all' &&
        detectedLink.platform.category !== allowedCategory
      ) {
        showToast({
          message: `${detectedLink.platform.name} links are not allowed in this section`,
          type: 'error',
          duration: 3000,
        });
        console.warn(
          `Platform ${detectedLink.platform.name} (${detectedLink.platform.category}) not allowed in ${allowedCategory} link manager`
        );
        return;
      }

      // Check for duplicate platform
      const existingPlatform = links.find(
        link => link.platform.id === detectedLink.platform.id
      );
      if (existingPlatform) {
        showToast({
          message: `Duplicate ${detectedLink.platform.name} blocked: Having multiple links to the same platform creates decision paralysis for visitors, reducing engagement and conversions by up to 40%. Use one clear link per platform for better results.`,
          type: 'error',
          duration: 8000,
        });
        return;
      }

      // Determine visibility rules by category (social soft cap: 6 visible; music: unlimited)
      const socialVisibleCount = links.filter(
        l => l.platform.category === 'social' && l.isVisible
      ).length;

      const willBeVisible =
        detectedLink.platform.category === 'social'
          ? socialVisibleCount < MAX_SOCIAL_LINKS
          : true; // dsp (music) and custom are unlimited visibility for now

      const newLink: LinkItem = {
        ...detectedLink,
        id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: detectedLink.suggestedTitle,
        isVisible: willBeVisible,
        order: links.length,
      };

      const newLinks = [...links, newLink];
      updateLinks(newLinks);

      if (!willBeVisible && detectedLink.platform.category === 'social') {
        showToast({
          message:
            'Added. Social links beyond 6 are hidden from your public page to keep it focused. You can reorder to choose which 6 show.',
          type: 'info',
          duration: 6000,
        });
      }

      // Immediately save when a new link is added (no debounce)
      onLinkAdded?.(newLinks);
    },
    [links, maxLinks, updateLinks, allowedCategory, showToast, onLinkAdded]
  );

  // Update existing link
  const handleUpdateLink = useCallback(
    (id: string, updates: Partial<LinkItem>) => {
      const target = links.find(l => l.id === id);
      if (!target) return;

      // Enforce social visible cap on visibility toggle
      if (
        typeof updates.isVisible === 'boolean' &&
        target.platform.category === 'social'
      ) {
        const visibleCount = links.filter(
          l => l.platform.category === 'social' && l.isVisible
        ).length;

        if (updates.isVisible && visibleCount >= MAX_SOCIAL_LINKS) {
          showToast({
            message: `Only ${MAX_SOCIAL_LINKS} social links can be visible. Hide another or reorder to choose which show.`,
            type: 'warning',
            duration: 5000,
          });
          return; // block making it visible if cap reached
        }
      }

      const newLinks = links.map(link =>
        link.id === id ? { ...link, ...updates } : link
      );
      updateLinks(newLinks);
    },
    [links, updateLinks, showToast]
  );

  // Delete link with undo functionality
  const handleDeleteLink = useCallback(
    (id: string) => {
      const linkToDelete = links.find(link => link.id === id);
      if (!linkToDelete) return;

      // Remove from active links
      const newLinks = links.filter(link => link.id !== id);
      // If a visible social link was deleted, auto-promote first hidden social
      if (
        linkToDelete.platform.category === 'social' &&
        linkToDelete.isVisible
      ) {
        const firstHiddenIndex = newLinks.findIndex(
          l => l.platform.category === 'social' && !l.isVisible
        );
        if (firstHiddenIndex !== -1) {
          newLinks[firstHiddenIndex] = {
            ...newLinks[firstHiddenIndex],
            isVisible: true,
          };
        }
      }
      updateLinks(newLinks);

      // Add to deleted links with 5-second undo timeout
      const timeout = setTimeout(() => {
        setDeletedLinks(prev => prev.filter(item => item.link.id !== id));
      }, 5000);

      setDeletedLinks(prev => [...prev, { link: linkToDelete, timeout }]);

      // Show undo toast notification
      showToast({
        message: `Deleted "${linkToDelete.title}"`,
        type: 'info',
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => handleUndoDelete(id),
        },
      });
    },
    [links, updateLinks, showToast, handleUndoDelete]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (active.id !== over?.id) {
        const oldIndex = links.findIndex(link => link.id === active.id);
        const newIndex = links.findIndex(link => link.id === over?.id);

        const newLinks = arrayMove(links, oldIndex, newIndex);
        updateLinks(newLinks);
      }
    },
    [links, updateLinks]
  );

  return (
    <div className='space-y-6'>
      {/* Add Link Input */}
      <UniversalLinkInput
        onAdd={handleAddLink}
        disabled={disabled || links.length >= maxLinks}
        existingPlatforms={links.map(link => link.platform.id)}
        socialVisibleCount={
          links.filter(l => l.platform.category === 'social' && l.isVisible)
            .length
        }
        socialVisibleLimit={MAX_SOCIAL_LINKS}
        prefillUrl={prefillUrl}
      />

      {/* Links Counter moved next to Add button inside UniversalLinkInput */}

      {/* Sortable Links List */}
      {links.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) =>
                `Picked up ${links.find(link => link.id === active.id)?.title || 'link'}. Use arrow keys to move, space to drop.`,
              onDragOver: ({ active, over }) => {
                if (!over) return '';
                const activeLink = links.find(link => link.id === active.id);
                const overLink = links.find(link => link.id === over.id);
                return `${activeLink?.title || 'Link'} is over ${overLink?.title || 'position'}.`;
              },
              onDragEnd: ({ active, over }) => {
                if (!over) return 'Cancelled sorting.';
                const activeLink = links.find(link => link.id === active.id);
                const overLink = links.find(link => link.id === over.id);
                return `Dropped ${activeLink?.title || 'link'} at position of ${overLink?.title || 'link'}.`;
              },
              onDragCancel: () => 'Sorting cancelled.',
            },
          }}
        >
          <SortableContext
            items={links.map(link => link.id)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className='space-y-2'
              ref={linksContainerRef}
              onKeyDown={handleKeyDown}
              role='list'
              aria-label='Sortable links list'
              tabIndex={links.length > 0 ? 0 : -1}
            >
              {links.map((link, index) => (
                <SortableLinkItem
                  key={link.id}
                  link={link}
                  onUpdate={handleUpdateLink}
                  onDelete={handleDeleteLink}
                  disabled={disabled}
                  ref={el => {
                    linkItemRefs.current[index] = el;
                  }}
                  isFocused={focusedLinkIndex === index}
                  index={index}
                  totalItems={links.length}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Empty State */}
      {links.length === 0 && (
        <EmptyState
          type='links'
          title='🔗 No links added yet'
          description='Paste any link from Spotify, Instagram, TikTok, YouTube, or other platforms to get started building your link hub.'
        />
      )}

      {/* Screen reader announcements */}
      <div aria-live='assertive' className='sr-only'>
        {deletedLinks.length > 0 &&
          `Link deleted. ${deletedLinks.length} undo action available.`}
      </div>
    </div>
  );
};
