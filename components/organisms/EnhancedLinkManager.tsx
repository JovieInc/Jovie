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
import { PlusIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { toast } from 'sonner';
import { AddLinkButton } from '@/components/atoms/AddLinkButton';
import { type LinkItemData } from '@/components/atoms/LinkItem';
import { LinkSearch } from '@/components/atoms/LinkSearch';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [newLinkUrl, setNewLinkUrl] = React.useState('');
  const [isAddingLink, setIsAddingLink] = React.useState(false);
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
  const handleAddNewLink = React.useCallback(() => {
    if (!newLinkUrl.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    // Detect platform and normalize URL
    const detectedInfo = detectPlatform(newLinkUrl, creatorName);

    if (!detectedInfo.isValid) {
      toast.error(detectedInfo.error || 'Invalid URL format');
      return;
    }

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
    onAddLink(detectedInfo.normalizedUrl, detectedInfo);
    setNewLinkUrl('');
    setIsAddingLink(false);

    // Special handling for YouTube (can be both social and Music)
    if (detectedInfo.platform.id === 'youtube') {
      toast.info(
        "YouTube detected! You can drag this to Music & Streaming if it's for YouTube Music.",
        { duration: 5000 }
      );
    }

    toast.success(`${detectedInfo.platform.name} link added successfully!`);
  }, [newLinkUrl, creatorName, enhancedLinks, onAddLink]);

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

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header Toolbar */}
      <div className='flex flex-col sm:flex-row gap-3'>
        <LinkSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder='Search links...'
          className='flex-1'
        />

        {isAddingLink ? (
          <div className='flex gap-2'>
            <Input
              type='url'
              value={newLinkUrl}
              onChange={e => setNewLinkUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddNewLink();
                if (e.key === 'Escape') {
                  setIsAddingLink(false);
                  setNewLinkUrl('');
                }
              }}
              placeholder='Paste any link (Instagram, Spotify, etc.)'
              className='flex-1'
              autoFocus
            />
            <Button onClick={handleAddNewLink} size='sm'>
              Add
            </Button>
            <Button
              onClick={() => {
                setIsAddingLink(false);
                setNewLinkUrl('');
              }}
              size='sm'
              variant='outline'
            >
              Cancel
            </Button>
          </div>
        ) : (
          <AddLinkButton onClick={() => setIsAddingLink(true)} />
        )}
      </div>

      {/* Auto-detection helper text */}
      {isAddingLink && (
        <div className='text-sm text-gray-500 dark:text-gray-400 -mt-3'>
          💡 Just paste any link - we&apos;ll automatically detect the platform
          and organize it for you!
        </div>
      )}

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

      {/* Empty State */}
      {enhancedLinks.length === 0 && (
        <div className='text-center py-12'>
          <div className='max-w-md mx-auto'>
            <div className='mb-4 text-4xl'>🔗</div>
            <h3 className='text-lg font-semibold text-primary-token mb-2'>
              No links yet
            </h3>
            <p className='text-muted-foreground mb-6'>
              Start by adding your social media, music platforms, and other
              links. We&apos;ll automatically organize them for you!
            </p>
            <Button onClick={() => setIsAddingLink(true)}>
              <PlusIcon className='h-4 w-4 mr-2' />
              Add Your First Link
            </Button>
          </div>
        </div>
      )}

      {/* Help Text */}
      {enhancedLinks.length > 0 && (
        <div className='text-xs text-gray-500 dark:text-gray-400 space-y-1'>
          <p>💡 Tip: Drag links between categories to reorganize them</p>
          <p>🎵 YouTube links can go in either Social or Music categories</p>
          <p>✨ Links are automatically detected and normalized</p>
        </div>
      )}
    </div>
  );
}
