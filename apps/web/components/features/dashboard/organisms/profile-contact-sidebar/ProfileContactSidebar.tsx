'use client';

import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelData,
  type PreviewPanelLink,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import {
  DrawerMediaThumb,
  DrawerSurfaceCard,
  DrawerTabs,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { useProfileHeaderParts } from '@/components/organisms/profile-sidebar/ProfileSidebarHeader';
import { BASE_URL } from '@/constants/domains';
import { getPlatformCategory } from '@/features/dashboard/organisms/links/utils/platform-category';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import {
  useDeletePressPhotoMutation,
  usePressPhotosQuery,
  usePressPhotoUploadMutation,
  useProfileSaveMutation,
  useRemoveSocialLinkMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ProfileAboutTab } from './ProfileAboutTab';
import { type CategoryOption, ProfileLinkList } from './ProfileLinkList';
import { ProfileSmartLinkAnalytics } from './ProfileSmartLinkAnalytics';
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

let tempLinkIdCounter = 0;

function createTempLinkId(): string {
  tempLinkIdCounter += 1;
  return `temp-${Date.now()}-${tempLinkIdCounter}`;
}

/** Persist a detected link to the server. Returns the server-assigned linkId. */
async function confirmLinkOnServer(
  profileId: string,
  link: DetectedLink
): Promise<string> {
  const response = await fetch('/api/chat/confirm-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId,
      platform: link.platform.id,
      url: link.originalUrl,
      normalizedUrl: link.normalizedUrl,
    }),
  });
  if (!response.ok) throw new Error('Failed to add link');
  const { linkId } = (await response.json()) as { linkId: string };
  return linkId;
}

function ProfileEntityHeader({
  previewData,
  onClose,
  overflowActions,
}: Readonly<{
  previewData: PreviewPanelData;
  onClose: () => void;
  overflowActions: ReturnType<typeof useProfileHeaderParts>['overflowActions'];
}>) {
  const primaryLabel =
    previewData.displayName?.trim() || `@${previewData.username}`;
  const secondaryLabel =
    previewData.displayName?.trim() &&
    previewData.displayName !== previewData.username
      ? `@${previewData.username}`
      : previewData.profilePath;
  const detailChips = [
    previewData.location?.trim() || null,
    `${previewData.links.length} link${previewData.links.length === 1 ? '' : 's'}`,
  ].filter(Boolean);
  const fallbackLabel = primaryLabel.replace(/^@/, '').charAt(0).toUpperCase();

  return (
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
      testId='profile-contact-header-card'
    >
      <div className='relative p-3.5'>
        <div className='absolute right-2.5 top-2.5'>
          <DrawerHeaderActions
            primaryActions={[
              {
                id: 'close-profile-contact',
                label: 'Close profile details',
                icon: X,
                onClick: onClose,
              },
            ]}
            overflowActions={overflowActions}
          />
        </div>
        <EntityHeaderCard
          title={primaryLabel}
          subtitle={secondaryLabel}
          meta={
            <div className='mt-1 flex flex-wrap items-center gap-2 text-[11px] text-tertiary-token'>
              {detailChips.map(detail => (
                <span key={detail}>{detail}</span>
              ))}
            </div>
          }
          image={
            <DrawerMediaThumb
              src={previewData.avatarUrl}
              alt={primaryLabel}
              sizeClassName='h-[60px] w-[60px] rounded-[14px]'
              sizes='60px'
              fallback={
                <span className='text-[18px] font-[590] text-secondary-token'>
                  {fallbackLabel}
                </span>
              }
            />
          }
          className='pr-8'
        />
      </div>
    </DrawerSurfaceCard>
  );
}

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
  const pressPhotoUploadMutation = usePressPhotoUploadMutation(
    selectedProfile?.id
  );
  const deletePressPhotoMutation = useDeletePressPhotoMutation(
    selectedProfile?.id
  );
  const removeLinkMutation = useRemoveSocialLinkMutation();
  const { data: pressPhotos = [] } = usePressPhotosQuery(
    selectedProfile?.id ?? ''
  );

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

  const handlePressPhotoUpload = useCallback(
    async (file: File) => {
      const uploadedPhoto = await pressPhotoUploadMutation.mutateAsync(file);
      toast.success('Press photo uploaded');
      return uploadedPhoto;
    },
    [pressPhotoUploadMutation]
  );

  const handlePressPhotoDelete = useCallback(
    async (photoId: string) => {
      await deletePressPhotoMutation.mutateAsync(photoId);
      toast.success('Press photo deleted');
    },
    [deletePressPhotoMutation]
  );

  // Handle bio change — save to server and instantly update sidebar
  const handleBioChange = useCallback(
    (value: string) => {
      if (!selectedProfile || !previewData) return;
      setPreviewData({ ...previewData, bio: value || null });
      profileMutation.mutate(
        { updates: { bio: value } },
        {
          onError: () => {
            setPreviewData({ ...previewData, bio: previewData.bio });
            toast.error('Failed to update bio');
          },
        }
      );
    },
    [selectedProfile, previewData, setPreviewData, profileMutation]
  );

  // Handle location change — save to server and instantly update sidebar
  const handleLocationChange = useCallback(
    (value: string | null) => {
      if (!selectedProfile || !previewData) return;
      setPreviewData({ ...previewData, location: value });
      profileMutation.mutate(
        { updates: { location: value } },
        {
          onError: () => {
            setPreviewData({ ...previewData, location: previewData.location });
            toast.error('Failed to update location');
          },
        }
      );
    },
    [selectedProfile, previewData, setPreviewData, profileMutation]
  );

  // Handle hometown change — save to server and instantly update sidebar
  const handleHometownChange = useCallback(
    (value: string | null) => {
      if (!selectedProfile || !previewData) return;
      setPreviewData({ ...previewData, hometown: value });
      profileMutation.mutate(
        { updates: { hometown: value } },
        {
          onError: () => {
            setPreviewData({
              ...previewData,
              hometown: previewData.hometown,
            });
            toast.error('Failed to update hometown');
          },
        }
      );
    },
    [selectedProfile, previewData, setPreviewData, profileMutation]
  );

  // Handle genres change — save to server and instantly update sidebar
  const handleGenresChange = useCallback(
    (value: string[]) => {
      if (!selectedProfile || !previewData) return;
      setPreviewData({ ...previewData, genres: value });
      profileMutation.mutate(
        { updates: { genres: value } },
        {
          onError: () => {
            setPreviewData({ ...previewData, genres: previewData.genres });
            toast.error('Failed to update genres');
          },
        }
      );
    },
    [selectedProfile, previewData, setPreviewData, profileMutation]
  );

  // Existing platform IDs for filtering suggestions
  const existingPlatformIds = useMemo(
    () =>
      previewData?.links
        .filter(l => l.platform !== 'youtube')
        .map(l => l.platform) ?? [],
    [previewData?.links]
  );

  // Reconcile optimistic ID with server ID, or clean up if user deleted while pending
  const reconcileAfterPersist = useCallback(
    (
      linkId: string,
      optimisticId: string,
      platformName: string,
      profileId: string
    ) => {
      if (deletedWhilePendingRef.current.has(optimisticId)) {
        deletedWhilePendingRef.current.delete(optimisticId);
        if (linkId) {
          removeLinkMutation.mutate(
            { profileId, linkId },
            { onError: () => {} }
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
              l.id === optimisticId ? { ...l, id: linkId } : l
            ),
          });
        }
      }
      toast.success(`${platformName} link added`);
    },
    [removeLinkMutation, setPreviewData]
  );

  // Revert optimistic add on failure
  const revertOptimisticAdd = useCallback(
    (optimisticId: string) => {
      if (deletedWhilePendingRef.current.has(optimisticId)) {
        deletedWhilePendingRef.current.delete(optimisticId);
        return;
      }
      const current = previewDataRef.current;
      if (current) {
        setPreviewData({
          ...current,
          links: current.links.filter(l => l.id !== optimisticId),
        });
      }
      toast.error('Failed to add link');
    },
    [setPreviewData]
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
        id: createTempLinkId(),
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
        const linkId = await confirmLinkOnServer(selectedProfile.id, link);
        reconcileAfterPersist(
          linkId,
          optimisticLink.id,
          link.platform.name,
          selectedProfile.id
        );
      } catch {
        revertOptimisticAdd(optimisticLink.id);
      } finally {
        pendingAddsRef.current.delete(optimisticLink.id);
      }
    },
    [
      selectedProfile,
      previewData,
      setPreviewData,
      resolvedCategory,
      reconcileAfterPersist,
      revertOptimisticAdd,
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
  const { overflowActions } = useProfileHeaderParts({
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
        headerMode='minimal'
        hideMinimalHeaderBar
      >
        <div className='flex min-h-full flex-col gap-2.5 pt-0.5'>
          <div className={cn(LINEAR_SURFACE.sidebarCard, 'space-y-2.5 p-3')}>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <div className='h-[9px] w-12 rounded skeleton' />
                <div className='h-4 w-8 rounded skeleton' />
              </div>
              <div className='space-y-1'>
                <div className='h-[9px] w-12 rounded skeleton' />
                <div className='h-4 w-8 rounded skeleton' />
              </div>
            </div>
            <div className='h-8 rounded-full skeleton' />
          </div>
          <div className='flex items-center gap-1'>
            <div className='h-7 w-14 rounded-full skeleton' />
            <div className='h-7 w-14 rounded-full skeleton' />
            <div className='h-7 w-12 rounded-full skeleton' />
            <div className='h-7 w-14 rounded-full skeleton' />
          </div>
          <div className={cn(LINEAR_SURFACE.drawerCardSm, 'space-y-2 p-2')}>
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className='flex items-center gap-3 rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-2'
              >
                <div className='h-8 w-8 shrink-0 rounded-[8px] skeleton' />
                <div className='flex-1 h-4 rounded skeleton' />
              </div>
            ))}
          </div>
        </div>
      </EntitySidebarShell>
    );
  }

  const {
    bio,
    genres,
    location,
    hometown,
    activeSinceYear,
    links,
    profilePath,
    dspConnections,
  } = previewData;

  const profileUrl = `${BASE_URL}${profilePath}`;

  const allowPhotoDownloads =
    (selectedProfile?.settings as Record<string, unknown> | null)
      ?.allowProfilePhotoDownloads === true;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Profile Contact'
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeader={
        <ProfileEntityHeader
          previewData={previewData}
          onClose={close}
          overflowActions={overflowActions}
        />
      }
      tabs={
        <DrawerTabs
          value={resolvedCategory}
          onValueChange={value =>
            setSelectedCategory(value as CategoryOption | 'about')
          }
          options={PROFILE_TAB_OPTIONS}
          ariaLabel='Profile sidebar view'
          actions={
            supportsAddAction ? (
              <AppIconButton
                type='button'
                onClick={() => handleAddLink(resolvedCategory)}
                className='h-[26px] w-[26px] rounded-full border-0 bg-transparent text-tertiary-token shadow-none hover:bg-surface-0 hover:text-primary-token'
                ariaLabel={`Add ${PROFILE_TAB_OPTIONS.find(t => t.value === resolvedCategory)?.label ?? ''} link`}
              >
                <Plus className='h-3.5 w-3.5' />
              </AppIconButton>
            ) : undefined
          }
          actionsClassName='h-[26px] w-[26px]'
          overflowMode='scroll'
          distribution='fill'
        />
      }
    >
      <div className='flex min-h-full flex-col gap-2.5 pt-0.5'>
        <ProfileSmartLinkAnalytics profileUrl={profileUrl} />

        <div className='min-h-0 flex-1'>
          {resolvedCategory === 'about' ? (
            <ProfileAboutTab
              bio={bio}
              genres={genres}
              location={location}
              hometown={hometown}
              activeSinceYear={activeSinceYear}
              allowPhotoDownloads={allowPhotoDownloads}
              pressPhotos={pressPhotos}
              onBioChange={handleBioChange}
              onLocationChange={handleLocationChange}
              onHometownChange={handleHometownChange}
              onGenresChange={handleGenresChange}
              onPressPhotoUpload={handlePressPhotoUpload}
              onPressPhotoDelete={handlePressPhotoDelete}
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

              {isAddingLink && (
                <div className='mt-2.5'>
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
                    creatorName={previewData.displayName}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </EntitySidebarShell>
  );
}
