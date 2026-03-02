'use client';

import { SegmentControl } from '@jovie/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelLink,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { getPlatformCategory } from '@/components/dashboard/organisms/links/utils/platform-category';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { BASE_URL } from '@/constants/domains';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import {
  useAvatarMutation,
  useProfileSaveMutation,
} from '@/lib/queries/useProfileMutation';
import { useRemoveSocialLinkMutation } from '@/lib/queries/useRemoveSocialLinkMutation';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ProfileAboutTab } from './ProfileAboutTab';
import { ProfileAnalyticsSummary } from './ProfileAnalyticsSummary';
import { ProfileContactHeader } from './ProfileContactHeader';
import {
  type CategoryOption,
  getCategoryCounts,
  ProfileLinkList,
} from './ProfileLinkList';
import { ProfilePhotoSettings } from './ProfilePhotoSettings';
import { ProfileSidebarHeader } from './ProfileSidebarHeader';
import { SidebarLinkInput } from './SidebarLinkInput';

/** Top-level sidebar tab */
type SidebarTab = 'overview' | 'about';

/** Top-level tab options */
const SIDEBAR_TAB_OPTIONS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'about' as const, label: 'About' },
];

/** Tab options for the profile link categories (used within Overview tab) */
const PROFILE_LINK_TAB_OPTIONS = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'custom' as const, label: 'Web' },
];

export function ProfileContactSidebar() {
  const { isOpen, close } = usePreviewPanelState();
  const { previewData, setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();

  // Top-level tab state
  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');

  // Link category state (within Overview tab)
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryOption>('social');

  // Mutations for profile editing
  const profileMutation = useProfileSaveMutation();
  const avatarMutation = useAvatarMutation();
  const removeLinkMutation = useRemoveSocialLinkMutation();

  // Add link state
  const [isAddingLink, setIsAddingLink] = useState(false);

  // Calculate category counts for the selector
  const categoryCounts = useMemo(() => {
    if (!previewData?.links) return undefined;
    return getCategoryCounts(previewData.links);
  }, [previewData?.links]);

  // Filter tabs to only show categories with links (always show all when editing)
  const visibleLinkTabs = useMemo(() => {
    if (!categoryCounts) return PROFILE_LINK_TAB_OPTIONS;
    // Always show all tabs so user can add to empty categories
    return PROFILE_LINK_TAB_OPTIONS;
  }, [categoryCounts]);

  // Synchronously resolve category to prevent brief mismatch when visibleLinkTabs changes
  const resolvedCategory = useMemo(() => {
    if (visibleLinkTabs.some(tab => tab.value === selectedCategory)) {
      return selectedCategory;
    }
    return visibleLinkTabs[0]?.value ?? selectedCategory;
  }, [visibleLinkTabs, selectedCategory]);

  // Sync state when resolved category differs (e.g., after data load)
  useEffect(() => {
    if (resolvedCategory !== selectedCategory) {
      setSelectedCategory(resolvedCategory);
    }
  }, [resolvedCategory, selectedCategory]);

  // Handle display name change — save to server and instantly update sidebar
  const handleDisplayNameChange = useCallback(
    (value: string) => {
      if (!selectedProfile || !previewData) return;

      // Instantly update sidebar
      setPreviewData({
        ...previewData,
        displayName: value,
      });

      // Save to server
      profileMutation.mutate(
        { updates: { displayName: value } },
        {
          onError: () => {
            // Revert on failure
            setPreviewData({
              ...previewData,
              displayName: previewData.displayName,
            });
          },
        }
      );
    },
    [selectedProfile, previewData, setPreviewData, profileMutation]
  );

  // Handle username change — save to server and instantly update sidebar
  const handleUsernameChange = useCallback(
    (value: string) => {
      if (!selectedProfile || !previewData) return;

      // Instantly update sidebar
      setPreviewData({
        ...previewData,
        username: value,
        profilePath: `/${value}`,
      });

      // Save to server
      profileMutation.mutate(
        { updates: { username: value } },
        {
          onError: () => {
            // Revert on failure
            setPreviewData({
              ...previewData,
              username: previewData.username,
              profilePath: previewData.profilePath,
            });
          },
        }
      );
    },
    [selectedProfile, previewData, setPreviewData, profileMutation]
  );

  // Handle avatar upload — save to server and instantly update sidebar
  const handleAvatarUpload = useCallback(
    async (file: File): Promise<string> => {
      const url = await avatarMutation.mutateAsync(file);

      // Instantly update sidebar
      if (previewData) {
        setPreviewData({
          ...previewData,
          avatarUrl: url,
        });
      }

      toast.success('Profile photo updated');
      return url;
    },
    [avatarMutation, previewData, setPreviewData]
  );

  // Existing platform IDs for filtering suggestions
  const existingPlatformIds = useMemo(
    () =>
      previewData?.links
        .filter(l => l.platform !== 'youtube')
        .map(l => l.platform) ?? [],
    [previewData?.links]
  );

  // Handle adding a new link (opens smart input)
  const handleAddLink = useCallback((_category?: string) => {
    setIsAddingLink(true);
  }, []);

  // Handle smart add — receives a detected link from SidebarLinkInput
  const handleSmartAddLink = useCallback(
    async (link: DetectedLink) => {
      if (!selectedProfile || !previewData) return;

      // Optimistically add to sidebar
      const optimisticLink: PreviewPanelLink = {
        id: `temp-${Date.now()}`,
        title: link.suggestedTitle ?? link.platform.name,
        url: link.normalizedUrl,
        platform: link.platform.id,
        isVisible: true,
      };

      setPreviewData({
        ...previewData,
        links: [...previewData.links, optimisticLink],
      });

      setIsAddingLink(false);

      // Auto-switch to the correct tab for the new link
      const linkCategory = getPlatformCategory(link.platform.id);
      const mappedCategory: CategoryOption =
        linkCategory === 'websites'
          ? 'custom'
          : (linkCategory as CategoryOption);
      if (
        mappedCategory !== resolvedCategory &&
        (mappedCategory === 'social' ||
          mappedCategory === 'dsp' ||
          mappedCategory === 'earnings' ||
          mappedCategory === 'custom')
      ) {
        setSelectedCategory(mappedCategory);
      }

      // Save to server via confirm-link endpoint
      try {
        const response = await fetch('/api/chat/confirm-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: selectedProfile.id,
            platform: link.platform.id,
            url: link.originalUrl,
            normalizedUrl: link.normalizedUrl,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to add link');
        }

        toast.success(`${link.platform.name} link added`);
      } catch {
        // Revert on failure
        setPreviewData({
          ...previewData,
          links: previewData.links.filter(l => l.id !== optimisticLink.id),
        });
        toast.error('Failed to add link');
      }
    },
    [selectedProfile, previewData, setPreviewData, resolvedCategory]
  );

  // Handle removing a link
  const handleRemoveLink = useCallback(
    (linkId: string) => {
      if (!previewData || !selectedProfile) return;

      const removedLink = previewData.links.find(l => l.id === linkId);
      if (!removedLink) return;

      // Optimistically remove from sidebar
      setPreviewData({
        ...previewData,
        links: previewData.links.filter(l => l.id !== linkId),
      });

      // Save to server
      removeLinkMutation.mutate(
        { profileId: selectedProfile.id, linkId },
        {
          onSuccess: () => {
            toast.success('Link removed');
          },
          onError: () => {
            // Revert on failure
            if (previewData && removedLink) {
              setPreviewData({
                ...previewData,
                links: [...previewData.links, removedLink],
              });
            }
            toast.error('Failed to remove link');
          },
        }
      );
    },
    [previewData, selectedProfile, setPreviewData, removeLinkMutation]
  );

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

  const {
    username,
    displayName,
    avatarUrl,
    bio,
    genres,
    links,
    profilePath,
    dspConnections,
  } = previewData;

  const profileUrl = `${BASE_URL}${profilePath}`;

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

        {/* Contact Header with Avatar, Name + Analytics + Profile URL */}
        <div className='shrink-0 px-4 pt-3 pb-4 space-y-3'>
          <ProfileContactHeader
            displayName={displayName}
            username={username}
            avatarUrl={avatarUrl}
            editable
            onDisplayNameChange={handleDisplayNameChange}
            onUsernameChange={handleUsernameChange}
            onAvatarUpload={handleAvatarUpload}
          />

          {/* Analytics summary */}
          <ProfileAnalyticsSummary />

          {/* Profile URL */}
          <a
            href={profileUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='block text-[12px] text-secondary-token hover:text-primary-token transition-colors truncate'
          >
            {profileUrl.replace(/^https?:\/\//, '')}
          </a>
        </div>

        {/* Top-level tabs */}
        <div className='border-b border-t border-subtle px-3 py-1.5 shrink-0'>
          <SegmentControl
            value={activeTab}
            onValueChange={setActiveTab}
            options={SIDEBAR_TAB_OPTIONS}
            size='sm'
            aria-label='Profile sidebar view'
          />
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <>
            {/* Link category tabs */}
            {visibleLinkTabs.length > 1 && (
              <div className='border-b border-subtle px-3 py-1.5 shrink-0'>
                <SegmentControl
                  value={resolvedCategory}
                  onValueChange={setSelectedCategory}
                  options={visibleLinkTabs}
                  size='sm'
                  aria-label='Link categories'
                />
              </div>
            )}

            {/* Links List — with add/remove */}
            <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4'>
              <ProfileLinkList
                links={links}
                selectedCategory={resolvedCategory}
                onAddLink={handleAddLink}
                onRemoveLink={handleRemoveLink}
                dspConnections={dspConnections}
              />

              {/* Smart add link input with platform suggestions */}
              {isAddingLink && (
                <div className='mt-3'>
                  <SidebarLinkInput
                    categoryFilter={
                      resolvedCategory === 'all' ? 'social' : resolvedCategory
                    }
                    existingPlatforms={existingPlatformIds}
                    onAdd={handleSmartAddLink}
                    onCancel={() => setIsAddingLink(false)}
                    creatorName={previewData?.displayName}
                  />
                </div>
              )}
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
          </>
        )}

        {activeTab === 'about' && (
          <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4'>
            <ProfileAboutTab bio={bio} genres={genres} />
          </div>
        )}
      </div>
    </RightDrawer>
  );
}
