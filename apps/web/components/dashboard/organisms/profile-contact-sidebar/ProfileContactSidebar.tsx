'use client';

import { Label, SegmentControl } from '@jovie/ui';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { updateAllowProfilePhotoDownloads } from '@/app/app/(shell)/dashboard/actions/creator-profile';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelLink,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import { getPlatformCategory } from '@/components/dashboard/organisms/links/utils/platform-category';
import {
  DrawerAsyncToggle,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { BASE_URL } from '@/constants/domains';
import {
  useAvatarMutation,
  useProfileSaveMutation,
} from '@/lib/queries/useProfileMutation';
import { useRemoveSocialLinkMutation } from '@/lib/queries/useRemoveSocialLinkMutation';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ProfileAboutTab } from './ProfileAboutTab';
import { ProfileAnalyticsSummary } from './ProfileAnalyticsSummary';
import { ProfileContactHeader } from './ProfileContactHeader';
import { type CategoryOption, ProfileLinkList } from './ProfileLinkList';
import { useProfileHeaderParts } from './ProfileSidebarHeader';
import { SidebarLinkInput } from './SidebarLinkInput';

/** Tab options for the profile sidebar categories */
const PROFILE_TAB_OPTIONS = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'about' as const, label: 'About' },
];

export function ProfileContactSidebar() {
  const { isOpen, close } = usePreviewPanelState();
  const { previewData, setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();

  // Tab state
  const [selectedCategory, setSelectedCategory] = useState<
    CategoryOption | 'about'
  >('social');

  // Mutations for profile editing
  const profileMutation = useProfileSaveMutation();
  const avatarMutation = useAvatarMutation();
  const removeLinkMutation = useRemoveSocialLinkMutation();

  // Add link state
  const [isAddingLink, setIsAddingLink] = useState(false);

  // Resolve category to ensure it's a valid tab value
  const resolvedCategory = useMemo(() => {
    if (PROFILE_TAB_OPTIONS.some(tab => tab.value === selectedCategory)) {
      return selectedCategory;
    }
    return 'social' as const;
  }, [selectedCategory]);

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

      // Prevent duplicate platforms (except YouTube which can have multiple channels)
      if (link.platform.id !== 'youtube') {
        const existingLink = previewData.links.find(
          l => l.platform === link.platform.id
        );
        if (existingLink) {
          toast.error(`${link.platform.name} link already exists`);
          setIsAddingLink(false);
          return;
        }
      }

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
      const mappedCategory =
        linkCategory === 'websites' || linkCategory === 'custom'
          ? 'social'
          : (linkCategory as CategoryOption);
      if (
        mappedCategory !== resolvedCategory &&
        (mappedCategory === 'social' ||
          mappedCategory === 'dsp' ||
          mappedCategory === 'earnings')
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

  // Header parts hook needs to be called unconditionally
  const { title: headerTitle, actions: headerActions } = useProfileHeaderParts({
    username: previewData?.username ?? '',
    displayName: previewData?.displayName ?? '',
    profilePath: previewData?.profilePath ?? '',
    onClose: close,
  });

  // Show skeleton sidebar until preview data loads (prevents CLS)
  if (!previewData) {
    return (
      <EntitySidebarShell
        isOpen={isOpen}
        ariaLabel='Profile Contact'
        title={<div className='h-4 w-24 rounded skeleton' />}
        onClose={close}
        entityHeader={
          <div className='flex items-center gap-4'>
            <div className='h-20 w-20 rounded-full skeleton' />
            <div className='space-y-2'>
              <div className='h-5 w-28 rounded skeleton' />
              <div className='h-3.5 w-20 rounded skeleton' />
            </div>
          </div>
        }
        tabs={
          <div className='flex gap-2'>
            <div className='h-7 w-16 rounded-md skeleton' />
            <div className='h-7 w-16 rounded-md skeleton' />
            <div className='h-7 w-14 rounded-md skeleton' />
          </div>
        }
      >
        <div className='space-y-3'>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className='flex items-center gap-3'>
              <div className='h-8 w-8 rounded-md skeleton shrink-0' />
              <div className='flex-1 h-4 rounded skeleton' />
            </div>
          ))}
        </div>
      </EntitySidebarShell>
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

  const photoSettingsFooter =
    resolvedCategory !== 'about' ? (
      <DrawerAsyncToggle
        label='Photo downloads'
        ariaLabel='Allow profile photo downloads on public pages'
        checked={
          (selectedProfile?.settings as Record<string, unknown> | null)
            ?.allowProfilePhotoDownloads === true
        }
        onToggle={updateAllowProfilePhotoDownloads}
        successMessage={on =>
          on ? 'Photo downloads enabled' : 'Photo downloads disabled'
        }
      />
    ) : undefined;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Profile Contact'
      title={headerTitle}
      headerActions={headerActions}
      entityHeader={
        <div className='space-y-4'>
          <ProfileContactHeader
            displayName={displayName}
            username={username}
            avatarUrl={avatarUrl}
            editable
            onDisplayNameChange={handleDisplayNameChange}
            onAvatarUpload={handleAvatarUpload}
          />

          {/* Analytics summary */}
          <ProfileAnalyticsSummary />

          {/* Profile URL */}
          <div className='grid grid-cols-[88px,minmax(0,1fr)] items-center gap-3'>
            <Label className='text-xs font-medium text-secondary-token'>
              Profile link
            </Label>
            <CopyLinkInput url={profileUrl} size='sm' />
          </div>
        </div>
      }
      tabs={
        <div className='flex items-center gap-1.5'>
          <SegmentControl
            value={resolvedCategory}
            onValueChange={setSelectedCategory}
            options={PROFILE_TAB_OPTIONS}
            size='sm'
            className='flex-1'
            aria-label='Profile sidebar view'
          />
          {(resolvedCategory === 'social' ||
            resolvedCategory === 'dsp' ||
            resolvedCategory === 'earnings') && (
            <button
              type='button'
              onClick={() => handleAddLink(resolvedCategory)}
              className='shrink-0 p-1 rounded-md text-tertiary-token hover:text-primary-token hover:bg-surface-2 transition-colors'
              aria-label={`Add ${PROFILE_TAB_OPTIONS.find(t => t.value === resolvedCategory)?.label ?? ''} link`}
            >
              <Plus className='h-4 w-4' />
            </button>
          )}
        </div>
      }
      footer={photoSettingsFooter}
    >
      {resolvedCategory === 'about' ? (
        <ProfileAboutTab bio={bio} genres={genres} />
      ) : (
        <>
          <ProfileLinkList
            links={links}
            selectedCategory={resolvedCategory as CategoryOption}
            onAddLink={handleAddLink}
            onRemoveLink={handleRemoveLink}
            dspConnections={dspConnections}
          />

          {/* Smart add link input with platform suggestions */}
          {isAddingLink && (
            <div className='mt-3'>
              <SidebarLinkInput
                categoryFilter={
                  resolvedCategory === 'social' ||
                  resolvedCategory === 'dsp' ||
                  resolvedCategory === 'earnings'
                    ? resolvedCategory
                    : 'social'
                }
                existingPlatforms={existingPlatformIds}
                onAdd={handleSmartAddLink}
                onCancel={() => setIsAddingLink(false)}
                creatorName={previewData?.displayName}
              />
            </div>
          )}
        </>
      )}
    </EntitySidebarShell>
  );
}
