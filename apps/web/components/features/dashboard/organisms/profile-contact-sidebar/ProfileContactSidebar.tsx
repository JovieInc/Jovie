'use client';

import { Button, CommonDropdown, Label } from '@jovie/ui';
import { ExternalLink, MoreHorizontal, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelLink,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { DrawerTabs, EntitySidebarShell } from '@/components/molecules/drawer';
import { BASE_URL } from '@/constants/domains';
import { CopyLinkInput } from '@/features/dashboard/atoms/CopyLinkInput';
import { getPlatformCategory } from '@/features/dashboard/organisms/links/utils/platform-category';
import {
  useAvatarMutation,
  useProfileSaveMutation,
  useRemoveSocialLinkMutation,
} from '@/lib/queries';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ProfileAboutTab } from './ProfileAboutTab';
import { ProfileAnalyticsSummary } from './ProfileAnalyticsSummary';
import { ProfileContactHeader } from './ProfileContactHeader';
import { type CategoryOption, ProfileLinkList } from './ProfileLinkList';
import { useProfileHeaderParts } from './ProfileSidebarHeader';
import { buildProfileShareDropdownItems } from './profileLinkShareMenu';
import { SidebarLinkInput } from './SidebarLinkInput';

/** Map a platform's category to a sidebar tab, returning null if no switch is needed. */
function computeTargetCategory(
  platformId: string,
  currentCategory: CategoryOption
): CategoryOption | null {
  const raw = getPlatformCategory(platformId);
  const mapped: CategoryOption =
    raw === 'websites' || raw === 'custom' ? 'social' : (raw as CategoryOption);
  if (mapped === currentCategory) return null;
  if (mapped === 'social' || mapped === 'dsp' || mapped === 'earnings') {
    return mapped;
  }
  return null;
}

/** Tab options for the profile sidebar categories */
const PROFILE_TAB_OPTIONS = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'about' as const, label: 'About' },
];

const LINK_ACTION_CATEGORIES: ReadonlySet<CategoryOption> = new Set([
  'social',
  'dsp',
  'earnings',
]);

export function ProfileContactSidebar() {
  const { isOpen, close } = usePreviewPanelState();
  const { previewData, setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();

  // Keep a ref to the latest previewData so async callbacks avoid stale closures
  const previewDataRef = useRef(previewData);
  previewDataRef.current = previewData;

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

  // Track temp link IDs with pending server adds. If user deletes a temp link
  // while its confirm-link request is in flight, we queue a server delete for
  // after the add completes to avoid orphaned server records.
  const pendingAddsRef = useRef<Set<string>>(new Set());
  const deletedWhilePendingRef = useRef<Set<string>>(new Set());

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

  const supportsAddAction = LINK_ACTION_CATEGORIES.has(
    resolvedCategory as CategoryOption
  );

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
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
      const targetCategory = computeTargetCategory(
        link.platform.id,
        resolvedCategory as CategoryOption
      );
      if (targetCategory) setSelectedCategory(targetCategory);

      // Save to server via confirm-link endpoint
      pendingAddsRef.current.add(optimisticLink.id);
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

        // Replace the temp ID with the server-assigned ID so future deletes work
        const { linkId } = (await response.json()) as { linkId: string };

        // If user deleted this link while the add was in flight, fire a server
        // delete now that we have the real ID, and skip the UI update.
        if (deletedWhilePendingRef.current.has(optimisticLink.id)) {
          deletedWhilePendingRef.current.delete(optimisticLink.id);
          if (linkId && selectedProfile) {
            removeLinkMutation.mutate(
              { profileId: selectedProfile.id, linkId },
              {
                // Suppress global onError — user already saw "Link removed"
                onError: () => {},
              }
            );
          }
          return;
        }

        if (linkId) {
          const current = previewDataRef.current;
          if (current) {
            setPreviewData({
              ...current,
              links: current.links.map(l =>
                l.id === optimisticLink.id ? { ...l, id: linkId } : l
              ),
            });
          }
        }

        toast.success(`${link.platform.name} link added`);
      } catch {
        // If deleted while pending, the UI is already correct (link removed)
        if (deletedWhilePendingRef.current.has(optimisticLink.id)) {
          deletedWhilePendingRef.current.delete(optimisticLink.id);
          return;
        }
        // Revert on failure
        const current = previewDataRef.current;
        if (current) {
          setPreviewData({
            ...current,
            links: current.links.filter(l => l.id !== optimisticLink.id),
          });
        }
        toast.error('Failed to add link');
      } finally {
        pendingAddsRef.current.delete(optimisticLink.id);
      }
    },
    [
      selectedProfile,
      previewData,
      setPreviewData,
      resolvedCategory,
      removeLinkMutation,
    ]
  );

  // Handle removing a link
  const handleRemoveLink = useCallback(
    (linkId: string) => {
      if (!previewData || !selectedProfile) return;

      const removedLink = previewData.links.find(l => l.id === linkId);
      if (!removedLink) return;

      // Snapshot current links before optimistic removal for rollback
      const previousLinks = previewData.links;

      // Optimistically remove from sidebar
      setPreviewData({
        ...previewData,
        links: previewData.links.filter(l => l.id !== linkId),
      });

      // If the add is still in flight, mark for server delete after it completes
      if (linkId.startsWith('temp-') && pendingAddsRef.current.has(linkId)) {
        deletedWhilePendingRef.current.add(linkId);
        toast.success('Link removed');
        return;
      }

      // Remaining temp-* IDs were never persisted (add failed or ID was
      // already replaced with a real one). No server call needed.
      if (linkId.startsWith('temp-')) {
        toast.success('Link removed');
        return;
      }

      removeLinkMutation.mutate(
        { profileId: selectedProfile.id, linkId },
        {
          onSuccess: () => {
            toast.success('Link removed');
          },
          onError: () => {
            // Revert on failure — read current previewData from ref to avoid stale closure
            const current = previewDataRef.current;
            if (current) {
              setPreviewData({ ...current, links: previousLinks });
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
  const profileShareItems = buildProfileShareDropdownItems({
    profileUrl,
    campaignSlug: `${username}-profile`,
    artistName: displayName,
    onCopy: (url, presetLabel) => {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          toast.success(`${presetLabel} link copied`, {
            description: 'Profile URL includes UTM parameters.',
          });
        })
        .catch(() => {
          toast.error('Unable to copy UTM link');
        });
    },
  });

  const allowPhotoDownloads =
    (selectedProfile?.settings as Record<string, unknown> | null)
      ?.allowProfilePhotoDownloads === true;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Profile Contact'
      title={headerTitle}
      headerActions={headerActions}
      entityHeader={
        <div className='space-y-3.5'>
          <div className='rounded-[10px] border border-subtle/75 bg-surface-0 p-3'>
            <ProfileContactHeader
              displayName={displayName}
              username={username}
              avatarUrl={avatarUrl}
              editable
              onDisplayNameChange={handleDisplayNameChange}
              onAvatarUpload={handleAvatarUpload}
            />
          </div>

          {/* Analytics summary */}
          <ProfileAnalyticsSummary />

          {/* Profile URL */}
          <div className='grid grid-cols-[88px,minmax(0,1fr)] items-center gap-3 border-t border-subtle/65 pt-3'>
            <Label className='text-xs font-medium text-secondary-token'>
              Profile link
            </Label>
            <div className='flex items-center gap-2'>
              <CopyLinkInput
                url={profileUrl}
                size='md'
                className='flex-1'
                inputClassName='h-8 px-3 py-2'
              />
              <Button
                type='button'
                size='icon'
                variant='ghost'
                className='h-8 w-8 shrink-0 border border-subtle bg-surface-1'
                onClick={() =>
                  globalThis.open(profileUrl, '_blank', 'noopener,noreferrer')
                }
                aria-label='Open public profile'
              >
                <ExternalLink className='h-4 w-4' aria-hidden='true' />
              </Button>
              <CommonDropdown
                variant='dropdown'
                size='compact'
                align='end'
                side='bottom'
                items={profileShareItems}
                trigger={
                  <AppIconButton
                    type='button'
                    variant='ghost'
                    className='h-8 w-8 shrink-0'
                    ariaLabel='Open profile share options'
                  >
                    <MoreHorizontal className='h-4 w-4' aria-hidden='true' />
                  </AppIconButton>
                }
              />
            </div>
          </div>
        </div>
      }
      tabs={
        <div className='flex items-center gap-1.5'>
          <DrawerTabs
            value={resolvedCategory}
            onValueChange={value =>
              setSelectedCategory(value as CategoryOption | 'about')
            }
            options={PROFILE_TAB_OPTIONS}
            className='flex-1'
            ariaLabel='Profile sidebar view'
          />
          <div className='h-6 w-6 shrink-0'>
            {supportsAddAction && (
              <AppIconButton
                type='button'
                onClick={() => handleAddLink(resolvedCategory)}
                className='h-7 w-7 border-subtle bg-surface-1 text-tertiary-token hover:text-primary-token'
                ariaLabel={`Add ${PROFILE_TAB_OPTIONS.find(t => t.value === resolvedCategory)?.label ?? ''} link`}
              >
                <Plus className='h-4 w-4' />
              </AppIconButton>
            )}
          </div>
        </div>
      }
    >
      {resolvedCategory === 'about' ? (
        <ProfileAboutTab
          bio={bio}
          genres={genres}
          allowPhotoDownloads={allowPhotoDownloads}
        />
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
