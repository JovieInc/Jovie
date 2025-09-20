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
import {
  ArrowTopRightOnSquareIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  EyeSlashIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import * as React from 'react';
import { toast } from 'sonner';
import { type LinkItemData } from '@/components/atoms/LinkItem';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { UnifiedLinkInput } from '@/components/molecules/UnifiedLinkInput';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useFocusManager,
  useKeyboardShortcuts,
} from '@/hooks/useKeyboardShortcuts';
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
  const [expandedCategories, setExpandedCategories] = React.useState<
    Set<CategoryType>
  >(
    new Set(categoryOrder) // All expanded by default
  );

  // Input refs for keyboard shortcuts
  const inputRef = React.useRef<HTMLInputElement>(null);

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

  // Determine if user is searching vs adding a URL
  const isSearching = React.useMemo(() => {
    return (
      searchQuery &&
      !searchQuery.includes('.') &&
      !searchQuery.startsWith('http') &&
      !searchQuery.startsWith('@')
    );
  }, [searchQuery]);

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

  // Keyboard navigation
  const { focusedIndex, focusedItem, focusNext, focusPrevious, clearFocus } =
    useFocusManager(filteredLinks);

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

  // Handle copying URL to clipboard
  const handleCopyUrl = React.useCallback(
    async (url: string, title: string) => {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(`Copied ${title} URL to clipboard`);
      } catch {
        toast.error('Failed to copy URL to clipboard');
      }
    },
    []
  );

  // Handle opening URL in new tab
  const handleOpenUrl = React.useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // Keyboard shortcuts configuration
  const shortcuts = React.useMemo(
    () => [
      {
        key: 'k',
        metaKey: true,
        action: () => {
          inputRef.current?.focus();
        },
        description: 'Focus search input',
      },
      {
        key: 'n',
        metaKey: true,
        action: () => {
          inputRef.current?.focus();
        },
        description: 'Add new link',
      },
      {
        key: 'ArrowDown',
        action: () => {
          if (filteredLinks.length > 0) {
            focusNext();
          }
        },
        description: 'Focus next link',
      },
      {
        key: 'ArrowUp',
        action: () => {
          if (filteredLinks.length > 0) {
            focusPrevious();
          }
        },
        description: 'Focus previous link',
      },
      {
        key: 'Enter',
        action: () => {
          if (focusedItem) {
            onEditLink(focusedItem.id);
          }
        },
        description: 'Edit focused link',
      },
      {
        key: 'Delete',
        action: () => {
          if (focusedItem) {
            onDeleteLink(focusedItem.id);
          }
        },
        description: 'Delete focused link',
      },
      {
        key: 'Backspace',
        action: () => {
          if (focusedItem) {
            onDeleteLink(focusedItem.id);
          }
        },
        description: 'Delete focused link',
      },
      {
        key: ' ',
        action: () => {
          if (focusedItem) {
            onToggleVisibility(focusedItem.id);
          }
        },
        description: 'Toggle focused link visibility',
      },
      {
        key: 'Escape',
        action: () => {
          clearFocus();
        },
        description: 'Clear selection',
      },
      {
        key: '1',
        action: () => {
          const musicCategory = document.getElementById('category-music');
          musicCategory?.scrollIntoView({ behavior: 'smooth' });
        },
        description: 'Jump to Music category',
      },
      {
        key: '2',
        action: () => {
          const socialCategory = document.getElementById('category-social');
          socialCategory?.scrollIntoView({ behavior: 'smooth' });
        },
        description: 'Jump to Social category',
      },
      {
        key: '3',
        action: () => {
          const commerceCategory = document.getElementById('category-commerce');
          commerceCategory?.scrollIntoView({ behavior: 'smooth' });
        },
        description: 'Jump to Commerce category',
      },
      {
        key: '4',
        action: () => {
          const otherCategory = document.getElementById('category-other');
          otherCategory?.scrollIntoView({ behavior: 'smooth' });
        },
        description: 'Jump to Other category',
      },
    ],
    [
      filteredLinks.length,
      focusNext,
      focusPrevious,
      clearFocus,
      focusedItem,
      onEditLink,
      onDeleteLink,
      onToggleVisibility,
    ]
  );

  useKeyboardShortcuts(shortcuts);

  // Render a single link item with icon
  const renderLinkItem = (link: EnhancedLinkItem, index: number) => {
    const isFocused = focusedIndex === index;

    return (
      <div
        key={link.id}
        className={cn(
          'flex items-center gap-4 p-4 bg-white dark:bg-gray-800',
          'rounded-xl border border-gray-200 dark:border-gray-700',
          'hover:shadow-md hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50',
          'hover:border-gray-300 dark:hover:border-gray-600',
          'hover:scale-[1.01] transition-all duration-200 cursor-move',
          'group',
          !link.isVisible && 'opacity-60',
          isFocused && [
            'ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 dark:ring-offset-gray-900',
            'border-blue-300 dark:border-blue-600',
            'shadow-lg shadow-blue-200/50 dark:shadow-blue-900/50',
          ]
        )}
        tabIndex={isFocused ? 0 : -1}
        data-testid={`link-item-${link.id}`}
      >
        {/* Platform Icon */}
        <div className='shrink-0 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg group-hover:bg-gray-100 dark:group-hover:bg-gray-600 transition-colors'>
          <SocialIcon
            platform={link.platformInfo?.id || 'website'}
            className='h-6 w-6'
          />
        </div>

        {/* Link Info */}
        <div className='flex-1 min-w-0'>
          <div className='font-semibold text-sm truncate text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
            {link.detectedInfo?.suggestedTitle || link.title}
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 truncate mt-1'>
            {link.url}
          </div>
        </div>

        {/* Quick Actions + Context Menu */}
        <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
          {/* Quick Toggle Visibility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => onToggleVisibility(link.id)}
                className='h-9 w-9 p-0 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                aria-label={link.isVisible ? 'Hide link' : 'Show link'}
              >
                {link.isVisible ? (
                  <EyeIcon className='h-4 w-4' />
                ) : (
                  <EyeSlashIcon className='h-4 w-4' />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {link.isVisible ? 'Hide link' : 'Show link'}
            </TooltipContent>
          </Tooltip>

          {/* Context Menu */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='h-9 w-9 p-0 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                    aria-label='More actions'
                  >
                    <EllipsisVerticalIcon className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More actions</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align='end' className='w-48'>
              <DropdownMenuItem onClick={() => onEditLink(link.id)}>
                <PencilIcon className='h-4 w-4 mr-2' />
                Edit link
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => handleOpenUrl(link.url)}>
                <ArrowTopRightOnSquareIcon className='h-4 w-4 mr-2' />
                Open in new tab
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => handleCopyUrl(link.url, link.title)}
              >
                <LinkIcon className='h-4 w-4 mr-2' />
                Copy URL
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => onToggleVisibility(link.id)}>
                {link.isVisible ? (
                  <EyeSlashIcon className='h-4 w-4 mr-2' />
                ) : (
                  <EyeIcon className='h-4 w-4 mr-2' />
                )}
                {link.isVisible ? 'Hide link' : 'Show link'}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => onDeleteLink(link.id)}
                variant='destructive'
              >
                <TrashIcon className='h-4 w-4 mr-2' />
                Delete link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  // Toggle category expansion
  const toggleCategory = (category: CategoryType) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Auto-expand categories with links, collapse empty ones
  React.useEffect(() => {
    const categoriesWithLinks = new Set<CategoryType>();
    enhancedLinks.forEach(link => {
      categoriesWithLinks.add((link.category || 'other') as CategoryType);
    });

    // Only expand categories that have links
    setExpandedCategories(categoriesWithLinks);
  }, [enhancedLinks]); // Update when links change

  // Empty state check
  const isEmpty = enhancedLinks.length === 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Unified Search/Add Input - Always prominent */}
      <div className={cn('w-full max-w-2xl', isEmpty ? 'mx-auto' : '')}>
        <UnifiedLinkInput
          ref={inputRef}
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
            const isExpanded = expandedCategories.has(category);
            const hasLinks = categoryLinks.length > 0;

            // Don't show empty categories unless user is actively searching (not adding a URL)
            if (!hasLinks && !isSearching) return null;

            return (
              <div
                key={category}
                id={`category-${category}`}
                className={cn(
                  'rounded-xl overflow-hidden transition-all duration-300',
                  hasLinks
                    ? categoryColors[category]
                    : 'bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700'
                )}
              >
                <button
                  onClick={() => toggleCategory(category)}
                  className='w-full p-4 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors'
                >
                  <div className='flex items-center gap-3'>
                    <div
                      className={cn(
                        'transition-transform duration-200',
                        isExpanded ? 'rotate-90' : ''
                      )}
                    >
                      <svg
                        className='w-4 h-4'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z'
                          clipRule='evenodd'
                        />
                      </svg>
                    </div>
                    <h3 className='font-semibold text-left'>
                      {categoryTitles[category]}
                    </h3>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-normal text-gray-500 dark:text-gray-400'>
                      {categoryLinks.length}{' '}
                      {categoryLinks.length === 1 ? 'link' : 'links'}
                    </span>
                    {!hasLinks && (
                      <span className='text-xs text-gray-400 dark:text-gray-500'>
                        • Click to add
                      </span>
                    )}
                  </div>
                </button>

                {/* Collapsible content */}
                <div
                  className={cn(
                    'transition-all duration-300 ease-out',
                    isExpanded
                      ? 'max-h-[2000px] opacity-100'
                      : 'max-h-0 opacity-0 overflow-hidden'
                  )}
                >
                  <div className='p-4 pt-0'>
                    {categoryLinks.length > 0 ? (
                      <SortableContext
                        items={categoryLinks.map(l => l.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className='space-y-2'>
                          {categoryLinks.map(link => {
                            // Find the global index for keyboard navigation
                            const globalIndex = filteredLinks.findIndex(
                              l => l.id === link.id
                            );
                            return renderLinkItem(link, globalIndex);
                          })}
                        </div>
                      </SortableContext>
                    ) : (
                      <div className='text-center py-6 text-gray-500 dark:text-gray-400'>
                        {isSearching
                          ? 'No links match your search'
                          : `Drop links here to add to ${categoryTitles[category]}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {draggedItem && (
            <div className='opacity-90'>{renderLinkItem(draggedItem, -1)}</div>
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
