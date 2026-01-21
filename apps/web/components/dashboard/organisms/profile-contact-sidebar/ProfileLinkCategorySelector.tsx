'use client';

import type { LinkSection } from '@/components/dashboard/organisms/links/utils/link-categorization';

export type CategoryOption = LinkSection | 'all';

interface Category {
  id: CategoryOption;
  label: string;
}

const CATEGORIES: Category[] = [
  { id: 'social', label: 'Social' },
  { id: 'dsp', label: 'Music' },
  { id: 'earnings', label: 'Earn' },
  { id: 'custom', label: 'Web' },
];

export interface ProfileLinkCategorySelectorProps {
  selectedCategory: CategoryOption;
  onCategoryChange: (category: CategoryOption) => void;
  categoryCounts?: Partial<Record<CategoryOption, number>>;
}

export function ProfileLinkCategorySelector({
  selectedCategory,
  onCategoryChange,
  categoryCounts,
}: ProfileLinkCategorySelectorProps) {
  // Filter to only show categories that have links
  const visibleCategories = categoryCounts
    ? CATEGORIES.filter(cat => (categoryCounts[cat.id] ?? 0) > 0)
    : CATEGORIES;

  // If only one or no categories have links, don't show the selector
  if (visibleCategories.length <= 1) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset not appropriate for segmented control
    <div
      role='group'
      aria-label='Link categories'
      className='inline-flex w-full rounded-full border border-subtle bg-surface-1/40 p-0.5 ring-1 ring-inset ring-white/5 dark:ring-white/10 backdrop-blur-sm'
    >
      {visibleCategories.map(category => {
        const isActive = selectedCategory === category.id;
        const count = categoryCounts?.[category.id] ?? 0;

        return (
          <button
            key={category.id}
            type='button'
            onClick={() => onCategoryChange(category.id)}
            aria-pressed={isActive}
            className={
              isActive
                ? 'flex-1 h-7 rounded-full bg-surface-1 px-2.5 text-xs font-semibold text-primary-token shadow-sm shadow-black/10 dark:shadow-black/40 transition-all'
                : 'flex-1 h-7 rounded-full px-2.5 text-xs font-medium text-secondary-token transition-all hover:bg-surface-2/40 hover:text-primary-token'
            }
          >
            {category.label}
            {count > 0 && (
              <span
                className={
                  isActive
                    ? 'ml-1 text-secondary-token'
                    : 'ml-1 text-tertiary-token'
                }
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
