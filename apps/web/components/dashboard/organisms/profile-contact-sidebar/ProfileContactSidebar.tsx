'use client';

import { SegmentControl } from '@jovie/ui';
import { LogOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { useUserButton } from '@/components/organisms/user-button';
import { APP_ROUTES } from '@/constants/routes';
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
  const { isOpen, close } = usePreviewPanelState();
  const { previewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();
  const { menuActions } = useUserButton({
    settingsHref: APP_ROUTES.SETTINGS,
  });
  const { handleSignOut, loading } = menuActions;
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

  // Show skeleton sidebar until preview data loads (prevents CLS)
  if (!previewData) {
    return (
      <RightDrawer
        isOpen={isOpen}
        width={SIDEBAR_WIDTH}
        ariaLabel='Profile Contact'
      >
        <div className='flex h-full flex-col'>
          {/* Header skeleton */}
          <div className='flex h-12 shrink-0 items-center justify-between border-b border-subtle px-4'>
            <div className='h-4 w-24 rounded skeleton' />
            <div className='h-6 w-6 rounded skeleton' />
          </div>
          {/* Avatar + name skeleton */}
          <div className='shrink-0 border-b border-subtle px-4 py-3'>
            <div className='flex items-center gap-3'>
              <div className='h-12 w-12 rounded-full skeleton' />
              <div className='space-y-2'>
                <div className='h-4 w-28 rounded skeleton' />
                <div className='h-3 w-20 rounded skeleton' />
              </div>
            </div>
          </div>
          {/* Tab skeleton */}
          <div className='border-b border-subtle px-3 py-1.5 shrink-0'>
            <div className='flex gap-2'>
              <div className='h-7 w-16 rounded-md skeleton' />
              <div className='h-7 w-16 rounded-md skeleton' />
              <div className='h-7 w-14 rounded-md skeleton' />
            </div>
          </div>
          {/* Link rows skeleton */}
          <div className='flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3'>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className='flex items-center gap-3'>
                <div className='h-8 w-8 rounded-md skeleton shrink-0' />
                <div className='flex-1 h-4 rounded skeleton' />
              </div>
            ))}
          </div>
        </div>
      </RightDrawer>
    );
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

        {/* Sign out */}
        <div className='shrink-0 border-t border-subtle px-4 py-3'>
          <button
            type='button'
            onClick={handleSignOut}
            disabled={loading.signOut}
            className='flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-secondary-token hover:bg-surface-2 hover:text-primary-token transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
          >
            <LogOut className='size-4 text-tertiary-token' aria-hidden />
            {loading.signOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </RightDrawer>
  );
}
