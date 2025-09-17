'use client';

import * as React from 'react';
import { type LinkItemData } from '@/components/atoms/LinkItem';
import { LinkCategoryGroup } from '@/components/molecules/LinkCategoryGroup';
import { LinkList } from '@/components/molecules/LinkList';
import { LinkToolbar } from '@/components/molecules/LinkToolbar';
import { cn } from '@/lib/utils';

interface LinkManagerProps {
  links: LinkItemData[];
  onAddLink: () => void;
  onEditLink: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onReorderLinks: (links: LinkItemData[]) => void;
  showCategories?: boolean;
  className?: string;
}

type CategoryType = 'social' | 'music' | 'commerce' | 'other';

const categoryTitles: Record<CategoryType, string> = {
  social: 'Social Media',
  music: 'Music & Streaming',
  commerce: 'Commerce & Payments',
  other: 'Other Links',
};

const categoryOrder: CategoryType[] = ['music', 'social', 'commerce', 'other'];

export function LinkManager({
  links,
  onAddLink,
  onEditLink,
  onDeleteLink,
  onToggleVisibility,
  onReorderLinks,
  showCategories = true,
  className,
}: LinkManagerProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedCategories, setExpandedCategories] = React.useState<
    Record<CategoryType, boolean>
  >({
    social: true,
    music: true,
    commerce: true,
    other: true,
  });

  // Filter links based on search query
  const filteredLinks = React.useMemo(() => {
    if (!searchQuery.trim()) return links;

    const query = searchQuery.toLowerCase();
    return links.filter(
      link =>
        link.title.toLowerCase().includes(query) ||
        link.url.toLowerCase().includes(query) ||
        link.platform.toLowerCase().includes(query)
    );
  }, [links, searchQuery]);

  // Group links by category
  const categorizedLinks = React.useMemo(() => {
    return filteredLinks.reduce(
      (acc, link) => {
        const category = link.category || 'other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(link);
        return acc;
      },
      {} as Record<CategoryType, LinkItemData[]>
    );
  }, [filteredLinks]);

  const handleToggleCategory = (category: CategoryType) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleReorderCategoryLinks = (
    category: CategoryType,
    reorderedLinks: LinkItemData[]
  ) => {
    // Create a new array with the reordered links for this category
    const otherLinks = links.filter(link => link.category !== category);
    const allReorderedLinks = [...otherLinks, ...reorderedLinks];
    onReorderLinks(allReorderedLinks);
  };

  if (links.length === 0) {
    return (
      <div className={cn('space-y-6', className)}>
        <LinkToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onAddLink={onAddLink}
          totalCount={0}
        />

        <div className='text-center py-12'>
          <div className='max-w-md mx-auto'>
            <div className='mb-4 text-4xl'>🔗</div>
            <h3 className='text-lg font-semibold text-primary-token mb-2'>
              No links yet
            </h3>
            <p className='text-muted-foreground mb-6'>
              Start building your link collection by adding your first link.
              Connect your social media, music platforms, and more.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Toolbar */}
      <LinkToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onAddLink={onAddLink}
        totalCount={links.length}
        filteredCount={searchQuery ? filteredLinks.length : undefined}
      />

      {/* Content */}
      {filteredLinks.length === 0 ? (
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>
            No links match your search. Try a different term or add a new link.
          </p>
        </div>
      ) : showCategories ? (
        /* Categorized view */
        <div className='space-y-8'>
          {categoryOrder.map(category => {
            const categoryLinks = categorizedLinks[category] || [];
            if (categoryLinks.length === 0) return null;

            return (
              <LinkCategoryGroup
                key={category}
                category={category}
                title={categoryTitles[category]}
                links={categoryLinks}
                isExpanded={expandedCategories[category]}
                onToggleExpanded={() => handleToggleCategory(category)}
                onAddLink={onAddLink}
                onEditLink={onEditLink}
                onDeleteLink={onDeleteLink}
                onToggleVisibility={onToggleVisibility}
                onReorderLinks={reorderedLinks =>
                  handleReorderCategoryLinks(category, reorderedLinks)
                }
              />
            );
          })}
        </div>
      ) : (
        /* Simple list view */
        <LinkList
          links={filteredLinks}
          onEdit={onEditLink}
          onDelete={onDeleteLink}
          onToggleVisibility={onToggleVisibility}
          onReorder={onReorderLinks}
        />
      )}
    </div>
  );
}
