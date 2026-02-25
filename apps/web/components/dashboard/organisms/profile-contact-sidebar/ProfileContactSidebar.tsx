'use client';

import { Input, SegmentControl } from '@jovie/ui';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelLink,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { isValidUrl } from '@/components/organisms/contact-sidebar/utils';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import {
  useAvatarMutation,
  useProfileSaveMutation,
} from '@/lib/queries/useProfileMutation';
import { useRemoveSocialLinkMutation } from '@/lib/queries/useRemoveSocialLinkMutation';
import { cn } from '@/lib/utils';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';
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
  const { previewData, setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryOption>('social');

  // Mutations for profile editing
  const profileMutation = useProfileSaveMutation();
  const avatarMutation = useAvatarMutation();
  const removeLinkMutation = useRemoveSocialLinkMutation();

  // Add link state
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const addLinkInputRef = useRef<HTMLInputElement | null>(null);

  // Focus add link input when it appears
  useEffect(() => {
    if (isAddingLink) {
      addLinkInputRef.current?.focus();
    }
  }, [isAddingLink]);

  // Calculate category counts for the selector
  const categoryCounts = useMemo(() => {
    if (!previewData?.links) return undefined;
    return getCategoryCounts(previewData.links);
  }, [previewData?.links]);

  // Filter tabs to only show categories with links (always show all when editing)
  const visibleTabs = useMemo(() => {
    if (!categoryCounts) return PROFILE_TAB_OPTIONS;
    // Always show all tabs so user can add to empty categories
    return PROFILE_TAB_OPTIONS;
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

  // Handle adding a new link
  const handleAddLink = useCallback((_category?: string) => {
    setIsAddingLink(true);
    setNewLinkUrl('');
  }, []);

  const handleConfirmAddLink = useCallback(async () => {
    const url = newLinkUrl.trim();
    if (!url || !selectedProfile || !previewData) return;

    // Auto-prefix with https:// if missing
    const fullUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

    if (!isValidUrl(fullUrl)) {
      toast.error('Please enter a valid URL');
      return;
    }

    const detected = detectPlatform(fullUrl);
    if (!detected.isValid) {
      toast.error(detected.error ?? 'Invalid URL');
      return;
    }

    // Optimistically add to sidebar
    const optimisticLink: PreviewPanelLink = {
      id: `temp-${Date.now()}`,
      title: detected.platform.name,
      url: detected.normalizedUrl,
      platform: detected.platform.id,
      isVisible: true,
    };

    setPreviewData({
      ...previewData,
      links: [...previewData.links, optimisticLink],
    });

    setIsAddingLink(false);
    setNewLinkUrl('');

    // Save to server via confirm-link endpoint
    try {
      const response = await fetch('/api/chat/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          platform: detected.platform.id,
          url: fullUrl,
          normalizedUrl: detected.normalizedUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add link');
      }

      toast.success(`${detected.platform.name} link added`);
    } catch {
      // Revert on failure
      setPreviewData({
        ...previewData,
        links: previewData.links.filter(l => l.id !== optimisticLink.id),
      });
      toast.error('Failed to add link');
    }
  }, [newLinkUrl, selectedProfile, previewData, setPreviewData]);

  const handleAddLinkKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleConfirmAddLink();
      }
      if (e.key === 'Escape') {
        setIsAddingLink(false);
        setNewLinkUrl('');
      }
    },
    [handleConfirmAddLink]
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

        {/* Contact Header with Avatar, Name — all editable */}
        <div className='shrink-0 border-b border-subtle px-4 py-3'>
          <ProfileContactHeader
            displayName={displayName}
            username={username}
            avatarUrl={avatarUrl}
            editable
            onDisplayNameChange={handleDisplayNameChange}
            onUsernameChange={handleUsernameChange}
            onAvatarUpload={handleAvatarUpload}
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

        {/* Links List — with add/remove */}
        <div className='flex-1 min-h-0 overflow-y-auto px-4 py-4'>
          <ProfileLinkList
            links={links}
            selectedCategory={resolvedCategory}
            onAddLink={handleAddLink}
            onRemoveLink={handleRemoveLink}
          />

          {/* Inline add link form */}
          {isAddingLink && (
            <div className='mt-3 flex items-center gap-2'>
              <Input
                ref={addLinkInputRef}
                type='url'
                placeholder='Paste link URL...'
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
                onKeyDown={handleAddLinkKeyDown}
                onBlur={() => {
                  if (!newLinkUrl.trim()) {
                    setIsAddingLink(false);
                  }
                }}
                className='h-8 flex-1 text-sm'
                aria-label='New link URL'
              />
              <button
                type='button'
                onClick={() => void handleConfirmAddLink()}
                disabled={!newLinkUrl.trim()}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium',
                  'bg-accent text-on-accent hover:bg-accent/90',
                  'disabled:opacity-50 transition-colors'
                )}
              >
                <Plus className='h-3 w-3' />
                Add
              </button>
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
      </div>
    </RightDrawer>
  );
}
