'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePreviewPanel } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { ProfileContactHeader } from './ProfileContactHeader';
import {
  type CategoryOption,
  ProfileLinkCategorySelector,
} from './ProfileLinkCategorySelector';
import { getCategoryCounts, ProfileLinkList } from './ProfileLinkList';
import { ProfileSidebarHeader } from './ProfileSidebarHeader';

export function ProfileContactSidebar() {
  const { isOpen, close, previewData } = usePreviewPanel();
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryOption>('social');

  // Calculate category counts for the selector
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- intentional: optional chaining dep
  const categoryCounts = useMemo(() => {
    if (!previewData?.links) return undefined;
    return getCategoryCounts(previewData.links);
  }, [previewData?.links]);

  // Auto-select first category with links if current selection is empty
  useEffect(() => {
    if (!categoryCounts) return;

    setSelectedCategory(prevSelectedCategory => {
      const currentCount = categoryCounts[prevSelectedCategory] ?? 0;
      if (currentCount > 0) return prevSelectedCategory;

      // Find first category with links
      const categories: CategoryOption[] = [
        'social',
        'dsp',
        'earnings',
        'custom',
      ];
      for (const cat of categories) {
        if ((categoryCounts[cat] ?? 0) > 0) {
          return cat;
        }
      }

      return prevSelectedCategory;
    });
  }, [categoryCounts]);

  // Don't render until we have preview data
  if (!previewData) {
    return null;
  }

  const { username, displayName, avatarUrl, links, profilePath } = previewData;

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Profile Contact'
    >
      <div className='flex h-full flex-col'>
        {/* Header */}
        <ProfileSidebarHeader
          username={username}
          displayName={displayName}
          profilePath={profilePath}
          onClose={close}
        />

        {/* Content */}
        <div className='flex-1 min-h-0 overflow-y-auto p-4 space-y-6'>
          {/* Contact Header with Avatar, Name */}
          <ProfileContactHeader
            displayName={displayName}
            username={username}
            avatarUrl={avatarUrl}
          />

          {/* Category Selector */}
          <ProfileLinkCategorySelector
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            categoryCounts={categoryCounts}
          />

          {/* Links List */}
          <ProfileLinkList links={links} selectedCategory={selectedCategory} />
        </div>
      </div>
    </RightDrawer>
  );
}
