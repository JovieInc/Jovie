'use client';

import { SegmentControl } from '@jovie/ui';
import { useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanel } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { ProfileContactHeader } from './ProfileContactHeader';
import {
  type CategoryOption,
  getCategoryCounts,
  ProfileLinkList,
} from './ProfileLinkList';
import { ProfilePhotoSettings } from './ProfilePhotoSettings';
import { ProfileSidebarHeader } from './ProfileSidebarHeader';

/** Tab options for the profile link categories */
const PROFILE_TAB_OPTIONS = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'custom' as const, label: 'Web' },
];

export function ProfileContactSidebar() {
  const { isOpen, close, previewData } = usePreviewPanel();
  const { selectedProfile } = useDashboardData();
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryOption>('social');

  // Calculate category counts for the selector
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- intentional: optional chaining dep
  const categoryCounts = useMemo(() => {
    if (!previewData?.links) return undefined;
    return getCategoryCounts(previewData.links);
  }, [previewData?.links]);

  // Filter tabs to only show categories with links
  const visibleTabs = useMemo(() => {
    if (!categoryCounts) return PROFILE_TAB_OPTIONS;
    return PROFILE_TAB_OPTIONS.filter(
      tab => (categoryCounts[tab.value] ?? 0) > 0
    );
  }, [categoryCounts]);

  // Synchronously resolve category to prevent brief mismatch when visibleTabs changes
  const resolvedCategory = useMemo(() => {
    if (visibleTabs.some(tab => tab.value === selectedCategory)) {
      return selectedCategory;
    }
    return visibleTabs[0]?.value ?? selectedCategory;
  }, [visibleTabs, selectedCategory]);

  // Sync state when resolved category differs (e.g., after data load)
  useEffect(() => {
    if (resolvedCategory !== selectedCategory) {
      setSelectedCategory(resolvedCategory);
    }
  }, [resolvedCategory, selectedCategory]);

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

        {/* Contact Header with Avatar, Name */}
        <div className='shrink-0 border-b border-subtle px-4 py-3'>
          <ProfileContactHeader
            displayName={displayName}
            username={username}
            avatarUrl={avatarUrl}
          />
        </div>

        {/* Category tabs */}
        {visibleTabs.length > 1 && (
          <div className='border-b border-subtle px-3 py-1.5 shrink-0'>
            <SegmentControl
              value={resolvedCategory}
              onValueChange={setSelectedCategory}
              options={visibleTabs}
              size='sm'
              aria-label='Link categories'
            />
          </div>
        )}

        {/* Links List */}
        <div className='flex-1 min-h-0 overflow-y-auto px-4 py-4'>
          <ProfileLinkList links={links} selectedCategory={resolvedCategory} />
        </div>

        {/* Profile Photo Download Settings */}
        <div className='shrink-0 border-t border-subtle px-4 py-3'>
          <ProfilePhotoSettings
            allowDownloads={
              (selectedProfile?.settings as Record<string, unknown> | null)
                ?.allowProfilePhotoDownloads === true
            }
          />
        </div>
      </div>
    </RightDrawer>
  );
}
