'use client';

import { Button, Input } from '@jovie/ui';
import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { LinkCategory } from '../molecules/LinkCategory';

type Platform =
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'youtube'
  | 'spotify'
  | 'applemusic'
  | 'custom';

export type LinkItem = {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  isVisible: boolean;
  category?: 'social' | 'music' | 'commerce' | 'other';
};

interface EnhancedDashboardLayoutProps {
  links: LinkItem[];
  onAddLink: () => void;
  onEditLink: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onReorderLinks: (links: LinkItem[]) => void;
  className?: string;
}

export function EnhancedDashboardLayout({
  links,
  onAddLink,
  onEditLink,
  onDeleteLink,
  onToggleVisibility,
  onReorderLinks,
  className,
}: EnhancedDashboardLayoutProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDraggingId, setIsDraggingId] = useState<string | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Filter links based on search query
  const filteredLinks = links.filter(
    link =>
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.platform.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Categorize links
  const categorizedLinks = filteredLinks.reduce(
    (acc, link) => {
      const category = link.category || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(link);
      return acc;
    },
    {} as Record<string, LinkItem[]>
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.PointerEvent, id: string) => {
      setIsDraggingId(id);
      const index = links.findIndex(link => link.id === id);
      if (index !== -1) {
        dragItem.current = index;
      }
      // Add a class to the body to change the cursor
      document.body.style.cursor = 'grabbing';
    },
    [links]
  );

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Handle drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      if (dragItem.current === null || dragOverItem.current === null) return;

      const newLinks = [...links];
      const draggedItem = newLinks[dragItem.current];

      // Remove the dragged item
      newLinks.splice(dragItem.current, 1);
      // Insert it at the new position
      newLinks.splice(dragOverItem.current, 0, draggedItem);

      // Reset the refs
      dragItem.current = null;
      dragOverItem.current = null;

      // Update the parent component with the new order
      onReorderLinks(newLinks);

      // Reset cursor
      document.body.style.cursor = '';
    },
    [links, onReorderLinks]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDraggingId(null);
    dragItem.current = null;
    dragOverItem.current = null;
    // Reset cursor
    document.body.style.cursor = '';
  }, []);

  // Handle drag enter

  // Clear search query
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Get category title and type
  const getCategoryInfo = (category: string) => {
    const info = {
      social: { title: 'Social Links', type: 'social' as const },
      music: { title: 'Music & Streaming', type: 'music' as const },
      commerce: { title: 'Commerce & Support', type: 'commerce' as const },
      other: { title: 'Other Links', type: 'other' as const },
    };

    return (
      info[category as keyof typeof info] || {
        title: category,
        type: 'other' as const,
      }
    );
  };

  return (
    <div className={cn('flex flex-col md:flex-row gap-6 h-full', className)}>
      {/* Left column - Links management */}
      <div className='flex-1'>
        <div className='bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-subtle'>
          {/* Header */}
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6'>
            <div>
              <h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
                Manage Links
              </h1>
              <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                Add, edit, and organize your links
              </p>
            </div>

            <Button onClick={onAddLink} className='shrink-0'>
              <Icon name='Plus' className='w-4 h-4 mr-2' />
              Add new link
            </Button>
          </div>

          {/* Search and filter */}
          <div className='mb-6'>
            <div className='relative'>
              <Icon
                name='Search'
                className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400'
              />
              <Input
                type='text'
                placeholder='Search links...'
                className='pl-10 pr-10'
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type='button'
                  onClick={clearSearch}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300'
                >
                  <Icon name='X' className='w-4 h-4' />
                </button>
              )}
            </div>

            <div className='flex items-center justify-between mt-3'>
              <div className='text-sm text-gray-500 dark:text-gray-400'>
                {filteredLinks.length}{' '}
                {filteredLinks.length === 1 ? 'link' : 'links'} found
              </div>

              <button
                type='button'
                className='inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              >
                <Icon name='ArrowUpDown' className='w-3.5 h-3.5 mr-1.5' />
                <span>Sort</span>
              </button>
            </div>
          </div>

          {/* Links list */}
          <div
            className='space-y-6'
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          >
            {Object.entries(categorizedLinks).map(
              ([category, categoryLinks]) => {
                const { title, type } = getCategoryInfo(category);

                return (
                  <LinkCategory
                    key={category}
                    type={type}
                    title={title}
                    links={categoryLinks}
                    onAddLink={onAddLink}
                    onEditLink={onEditLink}
                    onDeleteLink={onDeleteLink}
                    onToggleVisibility={onToggleVisibility}
                    onDragStart={handleDragStart}
                    isDraggingId={isDraggingId}
                  />
                );
              }
            )}

            {filteredLinks.length === 0 && (
              <div className='text-center py-12'>
                <div className='mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4'>
                  <Icon name='Search' className='w-6 h-6 text-gray-400' />
                </div>
                <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-1'>
                  No links found
                </h3>
                <p className='text-gray-500 dark:text-gray-400 mb-4'>
                  {searchQuery
                    ? "Try adjusting your search or filter to find what you're looking for."
                    : 'Get started by adding your first link.'}
                </p>
                <Button onClick={onAddLink}>
                  <Icon name='Plus' className='w-4 h-4 mr-2' />
                  Add your first link
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview is handled by the parent component */}
      <div className='mt-4 text-center'>
        <p className='text-sm text-gray-500 dark:text-gray-400'>
          Changes are saved automatically
        </p>
      </div>
    </div>
  );
}
