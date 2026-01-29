'use client';

import { motion } from 'motion/react';
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
    // role="group" is appropriate for segmented controls; <fieldset> has styling constraints
    <div // NOSONAR S6819
      role='group'
      aria-label='Link categories'
      className='relative inline-flex w-full rounded-xl border border-subtle bg-[#f7f7f7] p-1 shadow-inner'
    >
      {visibleCategories.map(category => {
        const isActive = selectedCategory === category.id;

        return (
          <button
            key={category.id}
            type='button'
            onClick={() => onCategoryChange(category.id)}
            aria-pressed={isActive}
            className='relative flex-1 h-8 rounded-lg px-4 text-sm font-medium text-secondary-token transition-colors duration-150 ease-out hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token/70 focus-visible:ring-offset-1 z-10'
          >
            {isActive && (
              <motion.span
                layoutId='category-selector-active'
                className='absolute inset-0 rounded-lg bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]'
                transition={{ type: 'tween', ease: 'easeOut', duration: 0.12 }}
              />
            )}
            <span
              className={
                isActive
                  ? 'relative z-10 font-semibold text-primary-token'
                  : 'relative z-10'
              }
            >
              {category.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
