'use client';

import { Button, CommonDropdown, type CommonDropdownItem } from '@jovie/ui';
import {
  Check,
  Copy,
  ExternalLink,
  MoreVertical,
  Pencil,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { useProfileHeaderParts } from '@/components/organisms/profile-sidebar/ProfileSidebarHeader';
import { DrawerHero } from '@/components/shell/DrawerHero';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { ProfilePaySurface } from '@/features/dashboard/molecules/ProfilePaySurface';
import { useEmailSignatureMenuAction } from '@/features/dashboard/molecules/useEmailSignatureMenuAction';
import { getPlatformCategory } from '@/features/dashboard/organisms/links/utils/platform-category';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { ProfilePreviewBento } from '@/features/profile/ProfilePreviewBento';
import { UtmBuilderDialog } from '@/features/profile/UtmBuilderDialog';
import {
  buildPreviewArtistFromProfile,
  buildProfilePreviewLinks,
} from '@/features/profile/view-models';
import { copyToClipboard } from '@/hooks/useClipboard';
import { buildSignatureInputFromProfile } from '@/lib/email-signature/profile-input';
import {
  useDeletePressPhotoMutation,
  useDspMatchesQuery,
  usePressPhotosQuery,
  usePressPhotoUploadMutation,
  useProfileMonetizationSummary,
  useProfileSaveMutation,
  useRemoveSocialLinkMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { LegacySocialLink } from '@/types/db';
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

/** Base tab options for the profile sidebar categories */
const PROFILE_TAB_OPTIONS_BASE = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'about' as const, label: 'About' },
] as const;

/** Build tab options with optional dot indicator on the Music tab */
function buildTabOptions(hasSuggestions: boolean) {
  if (!hasSuggestions) return PROFILE_TAB_OPTIONS_BASE;
  return PROFILE_TAB_OPTIONS_BASE.map(tab =>
    tab.value === 'dsp'
      ? {
          ...tab,
          label: (
            <span className='inline-flex items-center gap-1.5'>
              <span>Music</span>
              <span className='h-1.5 w-1.5 rounded-full bg-accent' />
            </span>
          ),
        }
      : tab
  );
}

const LINK_ACTION_CATEGORIES: ReadonlySet<CategoryOption> = new Set([
  'social',
  'dsp',
  'earnings',
]);

function resolveCategoryFromTab(
  tab: string | null
): CategoryOption | 'about' | null {
  switch (tab) {
    case 'social':
      return 'social';
    case 'music':
      return 'dsp';
    case 'earn':
      return 'earnings';
    case 'about':
      return 'about';
    default:
      return null;
  }
}

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

/** Convert preview-panel links into the LegacySocialLink shape the public surface expects. */
function toPreviewSocialLinks(
  links: PreviewPanelData['links']
): LegacySocialLink[] {
  const now = new Date().toISOString();
  return buildProfilePreviewLinks(links).map(link => ({
    id: link.id,
    platform: link.platform,
    url: link.url,
    title: link.title,
    order: 0,
    is_visible: link.isVisible,
    created_at: now,
    updated_at: now,
    artist_id: 'preview',
    clicks: 0,
  }));
}

/**
 * Read-only "show off your profile" view: the shared phone-preview bento with a
 * Live badge, a More dropdown (open / copy / UTM builder), live view/click stats
 * + copy URL, and an Edit profile button that flips the rail into edit mode.
 */
function ProfileBentoView({
  previewData,
  profileUrl,
  onClose,
  onEditProfile,
}: Readonly<{
  previewData: PreviewPanelData;
  profileUrl: string;
  onClose: () => void;
  onEditProfile: () => void;
}>) {
  const [utmOpen, setUtmOpen] = useState(false);

  const artist = buildPreviewArtistFromProfile({
    username: previewData.username,
    displayName: previewData.displayName,
    avatarUrl: previewData.avatarUrl,
    bio: previewData.bio,
  });
  const socialLinks = toPreviewSocialLinks(previewData.links);

  const handleCopyLink = useCallback(async () => {
    const copied = await copyToClipboard(profileUrl);
    if (copied) {
      toast.success('Profile link copied');
      return;
    }
    toast.error('Failed to copy link');
  }, [profileUrl]);

  const menuItems: CommonDropdownItem[] = [
    {
      type: 'action',
      id: 'open-link',
      label: 'Open Link',
      icon: <ExternalLink className='h-3.5 w-3.5' />,
      onClick: () =>
        globalThis.open(profileUrl, '_blank', 'noopener,noreferrer'),
    },
    {
      type: 'action',
      id: 'copy-link',
      label: 'Copy Link',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: handleCopyLink,
    },
    {
      type: 'action',
      id: 'utm-builder',
      label: 'UTM Builder',
      icon: <SlidersHorizontal className='h-3.5 w-3.5' />,
      onClick: () => setUtmOpen(true),
    },
    { type: 'separator', id: 'profile-actions-separator' },
    {
      type: 'action',
      id: 'close-preview',
      label: 'Close',
      icon: <X className='h-3.5 w-3.5' />,
      onClick: onClose,
    },
  ];

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-y-auto'>
      <ProfilePreviewBento
        artist={artist}
        socialLinks={socialLinks}
        genres={previewData.genres}
        profileHref={previewData.profilePath}
        showLiveBadge
        caption='Your Live Profile'
        phoneAlign='top'
        showBottomFade
        className='shrink-0'
        heroClassName='aspect-4/5 max-h-110 w-full pt-2'
        phoneFrameClassName='h-110 w-57'
        topRight={
          <CommonDropdown
            items={menuItems}
            align='end'
            aria-label='Profile Actions'
            trigger={
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label='Profile Actions'
                className='h-6 w-6 rounded-full border border-white/12 bg-black/50 text-white backdrop-blur-md hover:bg-black/65 dark:text-white'
              >
                <MoreVertical className='h-3.5 w-3.5' />
              </Button>
            }
          />
        }
        footer={
          <div className='space-y-2 px-1.5 pb-1.5 pt-1.5 lg:px-0 lg:pb-0'>
            <ProfileSmartLinkAnalytics profileUrl={profileUrl} variant='flat' />
            <Button
              type='button'
              variant='primary'
              onClick={onEditProfile}
              className='h-10 w-full rounded-xl text-xs font-caption tracking-tight'
            >
              <Pencil className='mr-2 h-3.5 w-3.5' aria-hidden='true' />
              Edit Profile
            </Button>
          </div>
        }
      />
      <UtmBuilderDialog
        open={utmOpen}
        onClose={() => setUtmOpen(false)}
        baseUrl={profileUrl}
      />
    </div>
  );
}

function ProfileSidebarHeaderCard({
  previewData,
  profileUrl,
  onClose,
  onDone,
  overflowActions,
}: Readonly<{
  previewData: PreviewPanelData;
  profileUrl: string;
  onClose: () => void;
  onDone?: () => void;
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
      className='overflow-hidden'
      testId='profile-contact-header-card'
    >
      <div className='relative'>
        <div className='absolute right-2.5 top-2.5 z-10'>
          <DrawerHeaderActions
            primaryActions={
              onDone
                ? [
                    {
                      id: 'done',
                      label: 'Done',
                      icon: Check,
                      onClick: onDone,
                    },
                  ]
                : []
            }
            overflowActions={overflowActions}
            onClose={onClose}
          />
        </div>
        <DrawerHero
          title={primaryLabel}
          subtitle={secondaryLabel}
          stableLayout
          titleLineClamp={1}
          subtitleLineClamp={1}
          reserveSubtitleSlot
          reserveMetaSlot
          metaOverflow='scroll'
          artwork={
            <DrawerMediaThumb
              src={previewData.avatarUrl}
              alt={primaryLabel}
              sizeClassName='h-15 w-15 rounded-xl'
              sizes='60px'
              fallback={
                <span className='text-lg font-semibold text-secondary-token'>
                  {fallbackLabel}
                </span>
              }
            />
          }
          meta={
            <div className='flex items-center gap-2 text-2xs text-tertiary-token'>
              {detailChips.map(detail => (
                <span key={detail}>{detail}</span>
              ))}
            </div>
          }
          className='[&_h2]:pr-9'
        />
        <ProfileSmartLinkAnalytics profileUrl={profileUrl} variant='flat' />
      </div>
    </DrawerSurfaceCard>
  );
}

export function ProfileContactSidebar() {
  const { isOpen, close } = usePreviewPanelState();
  const { previewData, setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();

  // Rail mode: 'view' shows the phone-preview bento (default — "show off" /
  // "give me my link"); 'edit' shows the link-editing tabs. The Edit profile
  // button flips to edit; Done flips back.
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: monetizationSummary } = useProfileMonetizationSummary(
    Boolean(selectedProfile)
  );

  // Keep a ref to the latest previewData so async callbacks avoid stale closures
  const previewDataRef = useRef(previewData);
  previewDataRef.current = previewData;

  // Tab state
  const [selectedCategory, setSelectedCategory] = useState<
    CategoryOption | 'about'
  >('social');
  const selectedCategoryRef = useRef<CategoryOption | 'about'>('social');
  selectedCategoryRef.current = selectedCategory;

  // Suggested DSP matches — used for dot indicator on Music tab
  const { data: suggestedMatches } = useDspMatchesQuery({
    profileId: selectedProfile?.id ?? '',
    status: 'suggested',
    enabled: !!selectedProfile?.id,
  });
  const hasSuggestions = (suggestedMatches?.length ?? 0) > 0;
  const tabOptions = useMemo(
    () => buildTabOptions(hasSuggestions),
    [hasSuggestions]
  );

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
  const isAddingLinkRef = useRef(false);
  isAddingLinkRef.current = isAddingLink;

  // Track temp link IDs with pending server adds. If user deletes a temp link
  // while its confirm-link request is in flight, we queue a server delete for
  // after the add completes to avoid orphaned server records.
  const pendingAddsRef = useRef<Set<string>>(new Set());
  const deletedWhilePendingRef = useRef<Set<string>>(new Set());

  // Resolve category to ensure it's a valid tab value
  const resolvedCategory = useMemo(() => {
    if (PROFILE_TAB_OPTIONS_BASE.some(tab => tab.value === selectedCategory)) {
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

  useEffect(() => {
    const requestedCategory = resolveCategoryFromTab(searchParams.get('tab'));
    if (
      requestedCategory &&
      requestedCategory !== selectedCategoryRef.current
    ) {
      setSelectedCategory(requestedCategory);
    }

    if (
      requestedCategory === 'earnings' &&
      searchParams.get('addLink') === '1' &&
      !isAddingLinkRef.current
    ) {
      setIsAddingLink(true);
    }
  }, [searchParams]);

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

  const handleSetUsername = useCallback(() => {
    if (pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE) {
      const usernameInput = document.getElementById('username');
      if (usernameInput instanceof HTMLInputElement) {
        usernameInput.focus();
        usernameInput.select();
        usernameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    router.push(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}#username`);
  }, [pathname, router]);

  const handleSetUpTips = useCallback(() => {
    if (monetizationSummary?.manageHref === APP_ROUTES.SETTINGS_PAYMENTS) {
      router.push(monetizationSummary.manageHref);
      return;
    }

    setSelectedCategory('earnings');
    setIsAddingLink(true);

    if (pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set('tab', 'earn');
      nextParams.set('addLink', '1');
      const nextSearch = nextParams.toString();
      const searchSuffix = nextSearch ? `?${nextSearch}` : '';
      router.replace(`${pathname}${searchSuffix}#pay`, {
        scroll: false,
      });
    }
  }, [monetizationSummary, pathname, router, searchParams]);

  const handleManagePayments = useCallback(() => {
    if (!monetizationSummary) return;
    router.push(monetizationSummary.manageHref);
  }, [monetizationSummary, router]);

  const handleViewAnalytics = useCallback(() => {
    router.push(APP_ROUTES.AUDIENCE);
  }, [router]);

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
  const { overflowActions: baseOverflowActions } = useProfileHeaderParts({
    username: previewData?.username ?? '',
    displayName: previewData?.displayName ?? '',
    profilePath: previewData?.profilePath ?? '',
    onClose: close,
  });

  const emailSignatureInput = useMemo(
    () =>
      previewData?.username
        ? buildSignatureInputFromProfile({
            profile: {
              username: previewData.username,
              displayName: previewData.displayName,
              avatarUrl: previewData.avatarUrl,
              genres: previewData.genres,
              location: previewData.location,
            },
            socials: previewData.links.map(link => ({
              label: link.title,
              url: link.url,
            })),
          })
        : null,
    [previewData]
  );
  const { action: emailSignatureAction, modal: emailSignatureModal } =
    useEmailSignatureMenuAction(emailSignatureInput);
  const overflowActions = useMemo(
    () => [...baseOverflowActions, emailSignatureAction],
    [baseOverflowActions, emailSignatureAction]
  );

  // Show skeleton sidebar until preview data loads (prevents CLS)
  if (!previewData) {
    return (
      <EntitySidebarShell
        isOpen={isOpen}
        ariaLabel='Profile Contact'
        headerMode='minimal'
        hideMinimalHeaderBar
        contentBleed
      >
        {emailSignatureModal}
        <div className='space-y-2.5 px-1.5 pb-1.5 pt-2 lg:px-0 lg:pb-0 lg:pt-0.5'>
          <div className='space-y-2.5 p-3'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <div className='h-2 w-12 rounded skeleton' />
                <div className='h-4 w-8 rounded skeleton' />
              </div>
              <div className='space-y-1'>
                <div className='h-2 w-12 rounded skeleton' />
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
                className='flex items-center gap-3 rounded-lg border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-2'
              >
                <div className='h-8 w-8 shrink-0 rounded-lg skeleton' />
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

  const profileSettingsRaw =
    (selectedProfile?.settings as Record<string, unknown> | null) ?? {};
  const allowPhotoDownloads =
    profileSettingsRaw.allowProfilePhotoDownloads === true;
  const showOldReleases = profileSettingsRaw.showOldReleases === true;

  if (mode === 'view') {
    return (
      <EntitySidebarShell
        isOpen={isOpen}
        ariaLabel='Profile Preview'
        headerMode='minimal'
        hideMinimalHeaderBar
        contentBleed
      >
        {emailSignatureModal}
        <ProfileBentoView
          previewData={previewData}
          profileUrl={profileUrl}
          onClose={close}
          onEditProfile={() => setMode('edit')}
        />
      </EntitySidebarShell>
    );
  }

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Profile Contact'
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      entityHeader={
        <ProfileSidebarHeaderCard
          previewData={previewData}
          profileUrl={profileUrl}
          onClose={close}
          onDone={() => setMode('view')}
          overflowActions={overflowActions}
        />
      }
    >
      {emailSignatureModal}
      <DrawerTabbedCard
        testId='profile-contact-tabbed-card'
        className='mt-2.5'
        tabs={
          <DrawerTabs
            value={resolvedCategory}
            onValueChange={value =>
              setSelectedCategory(value as CategoryOption | 'about')
            }
            options={tabOptions}
            ariaLabel='Profile sidebar view'
            actions={
              supportsAddAction ? (
                <AppIconButton
                  type='button'
                  onClick={() => handleAddLink(resolvedCategory)}
                  className='h-7 w-7 rounded-full border-0 bg-transparent text-tertiary-token shadow-none hover:bg-surface-0 hover:text-primary-token'
                  ariaLabel={`Add ${PROFILE_TAB_OPTIONS_BASE.find(t => t.value === resolvedCategory)?.label ?? ''} link`}
                >
                  <Plus className='h-3.5 w-3.5' />
                </AppIconButton>
              ) : undefined
            }
            actionsClassName='h-7 w-7'
            overflowMode='scroll'
            distribution='fill'
          />
        }
        contentClassName='pt-2'
      >
        {resolvedCategory === 'about' ? (
          <ProfileAboutTab
            bio={bio}
            genres={genres}
            location={location}
            hometown={hometown}
            activeSinceYear={activeSinceYear}
            allowPhotoDownloads={allowPhotoDownloads}
            showOldReleases={showOldReleases}
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
            {resolvedCategory === 'earnings' && monetizationSummary ? (
              <div className='mb-2.5'>
                <ProfilePaySurface
                  summary={monetizationSummary}
                  variant='drawer'
                  onSetUsername={handleSetUsername}
                  onSetUpTips={handleSetUpTips}
                  onManagePayments={handleManagePayments}
                  onViewAnalytics={handleViewAnalytics}
                />
              </div>
            ) : null}
            <ProfileLinkList
              links={links}
              selectedCategory={resolvedCategory as CategoryOption}
              onAddLink={handleAddLink}
              onRemoveLink={handleRemoveLink}
              dspConnections={dspConnections}
              profileId={selectedProfile?.id}
              surface='plain'
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
      </DrawerTabbedCard>
    </EntitySidebarShell>
  );
}
