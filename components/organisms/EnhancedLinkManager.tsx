'use client';

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import * as React from 'react';
import { toast } from 'sonner';
import { type LinkItemData } from '@/components/atoms/LinkItem';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { UnifiedLinkInput } from '@/components/molecules/UnifiedLinkInput';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  canonicalIdentity,
  type DetectedLink,
  detectPlatform,
  type PlatformInfo,
} from '@/lib/utils/platform-detection';

// Enhanced link interface with platform detection
interface EnhancedLinkItem extends LinkItemData {
  platformInfo?: PlatformInfo;
  canonicalId?: string;
  detectedInfo?: DetectedLink;
}

interface EnhancedLinkManagerProps {
  links: LinkItemData[];
  onAddLink: (url: string, detectedInfo?: DetectedLink) => void;
  onEditLink: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onReorderLinks: (links: LinkItemData[]) => void;
  onMoveToCategory?: (linkId: string, newCategory: string) => void;
  creatorName?: string;
  className?: string;
}

type CategoryType = 'music' | 'social' | 'commerce' | 'other';

const categoryTitles: Record<CategoryType, string> = {
  music: 'Music & Streaming',
  social: 'Social Media',
  commerce: 'Commerce & Payments',
  other: 'Other Links',
};

const categoryOrder: CategoryType[] = ['music', 'social', 'commerce', 'other'];

// Category colors for visual distinction
const categoryColors: Record<CategoryType, string> = {
  music:
    'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800',
  social: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
  commerce:
    'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
  other: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700',
};

export function EnhancedLinkManager({
  links,
  onAddLink,
  onEditLink,
  onDeleteLink,
  onToggleVisibility,
  onReorderLinks,
  onMoveToCategory,
  creatorName,
  className,
}: EnhancedLinkManagerProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [draggedItem, setDraggedItem] = React.useState<EnhancedLinkItem | null>(
    null
  );

  // Enhance links with platform detection info
  const enhancedLinks = React.useMemo((): EnhancedLinkItem[] => {
    return links.map(link => {
      const detectedInfo = detectPlatform(link.url, creatorName);
      const canonicalId = canonicalIdentity(detectedInfo);

      // Map category based on platform detection
      const category: CategoryType =
        detectedInfo.platform.category === 'dsp'
          ? 'music'
          : detectedInfo.platform.category === 'social'
            ? 'social'
            : 'other';

      // Check for commerce platforms
      const commercePlatforms = [
        'venmo',
        'cashapp',
        'paypal',
        'shopify',
        'etsy',
        'patreon',
        'buy_me_a_coffee',
        'kofi',
      ];
      const finalCategory: CategoryType = commercePlatforms.includes(
        detectedInfo.platform.id
      )
        ? 'commerce'
        : category;

      return {
        ...link,
        category: finalCategory,
        platformInfo: detectedInfo.platform,
        canonicalId,
        detectedInfo,
      };
    });
  }, [links, creatorName]);

  // Filter links based on search query
  const filteredLinks = React.useMemo(() => {
    if (!searchQuery.trim()) return enhancedLinks;

    const query = searchQuery.toLowerCase();
    return enhancedLinks.filter(
      link =>
        link.title.toLowerCase().includes(query) ||
        link.url.toLowerCase().includes(query) ||
        link.platformInfo?.name.toLowerCase().includes(query)
    );
  }, [enhancedLinks, searchQuery]);

  // Group links by category
  const categorizedLinks = React.useMemo(() => {
    return filteredLinks.reduce(
      (acc, link) => {
        const category = (link.category as CategoryType) || 'other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(link);
        return acc;
      },
      {} as Record<CategoryType, EnhancedLinkItem[]>
    );
  }, [filteredLinks]);

  // Setup drag and drop sensors
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

  const handleDragStart = (event: DragStartEvent) => {
    const item = enhancedLinks.find(link => link.id === event.active.id);
    if (item) {
      setDraggedItem(item);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedItem(null);

    const { active, over } = event;

    if (!over) return;

    // Check if we're moving to a different category
    const activeItem = enhancedLinks.find(l => l.id === active.id);
    const overItem = enhancedLinks.find(l => l.id === over.id);

    if (!activeItem) return;

    // If dropped on a different category header
    if (typeof over.id === 'string' && over.id.startsWith('category-')) {
      const newCategory = over.id.replace('category-', '') as CategoryType;
      if (activeItem.category !== newCategory && onMoveToCategory) {
        onMoveToCategory(active.id as string, newCategory);
        return;
      }
    }

    // Regular reordering within or between categories
    if (overItem && active.id !== over.id) {
      const oldIndex = enhancedLinks.findIndex(l => l.id === active.id);
      const newIndex = enhancedLinks.findIndex(l => l.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(enhancedLinks, oldIndex, newIndex);

        // If moving to a different category, update the category
        if (overItem.category !== activeItem.category && onMoveToCategory) {
          onMoveToCategory(active.id as string, overItem.category as string);
        }

        onReorderLinks(reordered);
      }
    }
  };

  // Handle adding a new link with auto-detection
  const handleAddNewLink = React.useCallback(
    (url: string, detectedInfo: DetectedLink) => {
      // Check for duplicates
      const canonicalId = canonicalIdentity(detectedInfo);
      const duplicate = enhancedLinks.find(
        link => link.canonicalId === canonicalId
      );

      if (duplicate) {
        toast.error(`You already have a link to ${detectedInfo.platform.name}`);
        return;
      }

      // Add the link
      onAddLink(url, detectedInfo);

      // Special handling for YouTube (can be both social and Music)
      if (detectedInfo.platform.id === 'youtube') {
        toast.info(
          "YouTube detected! You can drag this to Music & Streaming if it's for YouTube Music.",
          { duration: 5000 }
        );
      }

      toast.success(`${detectedInfo.platform.name} link added successfully!`);
    },
    [enhancedLinks, onAddLink]
  );

  // Render a single link item with icon
  const renderLinkItem = (link: EnhancedLinkItem) => (
    <div
      key={link.id}
      className={cn(
        'flex items-center gap-3 p-3 bg-white dark:bg-gray-800',
        'rounded-lg border border-gray-200 dark:border-gray-700',
        'hover:shadow-sm transition-shadow cursor-move',
        !link.isVisible && 'opacity-50'
      )}
    >
      {/* Platform Icon */}
      <div className='shrink-0'>
        <SocialIcon
          platform={link.platformInfo?.id || 'website'}
          className='h-5 w-5'
        />
      </div>

      {/* Link Info */}
      <div className='flex-1 min-w-0'>
        <div className='font-medium text-sm truncate'>
          {link.detectedInfo?.suggestedTitle || link.title}
        </div>
        <div className='text-xs text-gray-500 dark:text-gray-400 truncate'>
          {link.url}
        </div>
      </div>

      {/* Actions */}
      <div className='flex items-center gap-1'>
        <Button
          size='sm'
          variant='ghost'
          onClick={() => onToggleVisibility(link.id)}
          className='h-8 w-8 p-0'
        >
          {link.isVisible ? '👁' : '👁‍🗨'}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          onClick={() => onEditLink(link.id)}
          className='h-8 w-8 p-0'
        >
          ✏️
        </Button>
        <Button
          size='sm'
          variant='ghost'
          onClick={() => onDeleteLink(link.id)}
          className='h-8 w-8 p-0 text-red-500 hover:text-red-700'
        >
          🗑
        </Button>
      </div>
    </div>
  );

  // Empty state check
  const isEmpty = enhancedLinks.length === 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Unified Search/Add Input - Always prominent */}
      <div className={cn('w-full max-w-2xl', isEmpty ? 'mx-auto' : '')}>
        <UnifiedLinkInput
          onSearch={setSearchQuery}
          onAddLink={handleAddNewLink}
          existingLinkCount={enhancedLinks.length}
          autoFocus={isEmpty}
        />
      </div>

      {/* Links by Category with Drag & Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className='space-y-6'>
          {categoryOrder.map(category => {
            const categoryLinks = categorizedLinks[category] || [];

            if (categoryLinks.length === 0 && !searchQuery) return null;

            return (
              <div
                key={category}
                id={`category-${category}`}
                className={cn('rounded-xl p-4', categoryColors[category])}
              >
                <h3 className='font-semibold mb-3 flex items-center justify-between'>
                  <span>{categoryTitles[category]}</span>
                  <span className='text-sm font-normal text-gray-500 dark:text-gray-400'>
                    {categoryLinks.length}{' '}
                    {categoryLinks.length === 1 ? 'link' : 'links'}
                  </span>
                </h3>

                {categoryLinks.length > 0 ? (
                  <SortableContext
                    items={categoryLinks.map(l => l.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className='space-y-2'>
                      {categoryLinks.map(renderLinkItem)}
                    </div>
                  </SortableContext>
                ) : (
                  <div className='text-center py-6 text-gray-500 dark:text-gray-400'>
                    {searchQuery
                      ? 'No links match your search'
                      : `Drop links here to add to ${categoryTitles[category]}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {draggedItem && (
            <div className='opacity-90'>{renderLinkItem(draggedItem)}</div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Improved Empty State */}
      {isEmpty && (
        <div className='text-center py-8'>
          <div className='max-w-lg mx-auto'>
            <div className='mb-6 text-6xl opacity-20'>🔗</div>
            <h3 className='text-xl font-semibold text-primary-token mb-3'>
              Ready to connect your audience?
            </h3>
            <p className='text-muted-foreground mb-8 text-lg leading-relaxed'>
              Add your social media, music platforms, and other links above.
              <br />
              <span className='text-sm'>
                We&apos;ll automatically organize them by category!
              </span>
            </p>

            {/* Popular platforms showcase */}
            <div className='flex justify-center gap-4 opacity-40'>
              {['instagram', 'spotify', 'youtube', 'tiktok', 'twitter'].map(
                platform => (
                  <div key={platform} className='w-8 h-8'>
                    <SocialIcon platform={platform} className='w-full h-full' />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      {!isEmpty && (
        <div className='text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2'>
          <p className='font-medium mb-2'>Quick tips:</p>
          <p>💡 Drag links between categories to reorganize them</p>
          <p>🎵 YouTube links can go in either Social or Music categories</p>
          <p>✨ Links are automatically detected and normalized</p>
        </div>
      )}
    </div>
  );
}
