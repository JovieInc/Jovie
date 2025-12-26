'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { Input } from '@/components/atoms/Input';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';

import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import { usePollingCoordinator } from '@/lib/hooks/usePollingCoordinator';
import { useProfileSaveToasts } from '@/lib/hooks/useProfileSaveToasts';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { debounce } from '@/lib/utils';
import {
  type DetectedLink,
  getPlatformCategory,
  type PlatformCategory,
} from '@/lib/utils/platform-detection';
import {
  getSocialPlatformLabel,
  type SaveStatus,
  type SocialPlatform,
} from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

const GroupedLinksManager = dynamic(
  () =>
    import('@/components/dashboard/organisms/GroupedLinksManager').then(
      mod => ({
        default: mod.GroupedLinksManager,
      })
    ),
  {
    loading: () => (
      <div className='space-y-3'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='h-16 animate-pulse rounded-lg bg-surface-1' />
        ))}
      </div>
    ),
    ssr: false,
  }
);

type ProfileUpdatePayload = {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
};

type ProfileUpdateResponse = {
  profile: {
    username?: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  warning?: string;
};

// Alias PlatformCategory from shared utility for local usage
type PlatformType = PlatformCategory;

function getHostnameForUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function _isIngestableUrl(value: string): boolean {
  const hostname = getHostnameForUrl(value);
  if (!hostname) return false;

  if (hostname === 'youtu.be') return true;
  if (hostname === 'linktr.ee') return true;
  if (hostname === 'laylo.com') return true;
  if (hostname === 'beacons.ai') return true;

  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
    return true;
  }

  return false;
}

interface Platform {
  id: string;
  name: string;
  category: PlatformType;
  icon: string;
  color: string;
  placeholder: string;
}

interface LinkItem {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  isVisible: boolean;
  order: number;
  category: PlatformType;
  normalizedUrl: string;
  originalUrl: string;
  suggestedTitle: string;
  isValid: boolean;
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number | null;
  sourcePlatform?: string | null;
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  evidence?: { sources?: string[]; signals?: string[] } | null;
  version?: number;
}

interface SuggestedLink extends DetectedLink {
  suggestionId: string;
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number | null;
  sourcePlatform?: string | null;
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  evidence?: { sources?: string[]; signals?: string[] } | null;
}

function areLinkItemsEqual(a: LinkItem[], b: LinkItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!right) return false;
    if (left.id !== right.id) return false;
    if (left.normalizedUrl !== right.normalizedUrl) return false;
    if (left.originalUrl !== right.originalUrl) return false;
    if (left.isVisible !== right.isVisible) return false;
    if (left.category !== right.category) return false;
    if (left.platform.id !== right.platform.id) return false;
  }
  return true;
}

function areSuggestionListsEqual(
  a: SuggestedLink[],
  b: SuggestedLink[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  const serialize = (list: SuggestedLink[]) =>
    list
      .map(
        item =>
          `${item.suggestionId ?? item.normalizedUrl}:${item.platform.id}:${item.normalizedUrl}`
      )
      .sort();

  const aSig = serialize(a);
  const bSig = serialize(b);
  return aSig.every((value, index) => value === bSig[index]);
}

export function EnhancedDashboardLinks({
  initialLinks,
}: {
  initialLinks: ProfileSocialLink[];
}) {
  const router = useRouter();
  const dashboardData = useDashboardData();
  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  const isMusicProfile =
    dashboardData.selectedProfile?.creatorType === 'artist';
  const profileId = dashboardData.selectedProfile?.id;

  const [profileDisplayName, setProfileDisplayName] = useState<string>(
    dashboardData.selectedProfile?.displayName ?? ''
  );
  const [profileUsername, setProfileUsername] = useState<string>(
    dashboardData.selectedProfile?.username ?? ''
  );

  const [editingField, setEditingField] = useState<
    'displayName' | 'username' | null
  >(null);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>({
    saving: false,
    success: null,
    error: null,
    lastSaved: null,
  });
  const lastProfileSavedRef = useRef<{
    displayName: string;
    username: string;
  } | null>(null);
  const linkIngestionGate = useFeatureGate(STATSIG_FLAGS.LINK_INGESTION);
  const suggestionsEnabled = linkIngestionGate?.value ?? false;

  useEffect(() => {
    if (!profileSaveStatus.success) return;
    const timeoutId = window.setTimeout(() => {
      setProfileSaveStatus(prev => ({ ...prev, success: null }));
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [profileSaveStatus.success]);

  useProfileSaveToasts(profileSaveStatus);

  const [autoRefreshUntilMs, setAutoRefreshUntilMs] = useState<number | null>(
    null
  );
  useEffect(() => {
    if (!dashboardData.selectedProfile) {
      setArtist(null);
      setProfileDisplayName('');
      setProfileUsername('');
      setEditingField(null);
      lastProfileSavedRef.current = null;
      return;
    }

    setArtist(
      convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    );
    setProfileDisplayName(dashboardData.selectedProfile.displayName ?? '');
    setProfileUsername(dashboardData.selectedProfile.username ?? '');

    lastProfileSavedRef.current = {
      displayName: dashboardData.selectedProfile.displayName ?? '',
      username: dashboardData.selectedProfile.username ?? '',
    };
    setProfileSaveStatus({
      saving: false,
      success: null,
      error: null,
      lastSaved: null,
    });
  }, [dashboardData.selectedProfile]);

  useEffect(() => {
    if (editingField === 'displayName') {
      displayNameInputRef.current?.focus();
      displayNameInputRef.current?.select();
    }
    if (editingField === 'username') {
      usernameInputRef.current?.focus();
      usernameInputRef.current?.select();
    }
  }, [editingField]);

  const updateProfile = useCallback(
    async (updates: ProfileUpdatePayload): Promise<ProfileUpdateResponse> => {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      const body = (await response.json().catch(() => null)) as
        | ProfileUpdateResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const message =
          body && 'error' in body && typeof body.error === 'string'
            ? body.error
            : 'Failed to update profile';
        throw new Error(message);
      }

      if (!body || !('profile' in body)) {
        throw new Error('Failed to update profile');
      }

      return body;
    },
    []
  );

  const uploadAvatar = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const body = (await response.json().catch(() => null)) as {
      blobUrl?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      const message = body?.error ?? 'Upload failed';
      throw new Error(message);
    }

    if (!body?.blobUrl) {
      throw new Error('Upload failed');
    }

    return body.blobUrl;
  }, []);

  const saveProfile = useCallback(
    async (next: { displayName: string; username: string }): Promise<void> => {
      if (!profileId) {
        setProfileSaveStatus({
          saving: false,
          success: false,
          error: 'Missing profile id; please refresh and try again.',
          lastSaved: null,
        });
        toast.error('Missing profile id; please refresh and try again.');
        return;
      }

      const username = next.username.trim();
      const displayName = next.displayName.trim();

      if (displayName.length === 0 || username.length === 0) {
        return;
      }

      const lastSaved = lastProfileSavedRef.current;
      if (
        lastSaved &&
        lastSaved.displayName === displayName &&
        lastSaved.username === username
      ) {
        return;
      }

      setProfileSaveStatus(prev => ({
        ...prev,
        saving: true,
        success: null,
        error: null,
      }));

      try {
        const result = await updateProfile({
          displayName,
          username,
        });

        const nextHandle = result.profile.username ?? artist?.handle;
        const nextName = result.profile.displayName ?? artist?.name;
        const nextAvatar =
          typeof result.profile.avatarUrl === 'string'
            ? result.profile.avatarUrl
            : artist?.image_url;

        if (nextHandle || nextName || nextAvatar) {
          setArtist(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              handle: nextHandle ?? prev.handle,
              name: nextName ?? prev.name,
              image_url: nextAvatar ?? prev.image_url,
            };
          });
        }

        lastProfileSavedRef.current = { displayName, username };

        setProfileSaveStatus({
          saving: false,
          success: true,
          error: null,
          lastSaved: new Date(),
        });

        if (result.warning) {
          toast.message(result.warning);
        }

        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update profile';
        setProfileSaveStatus({
          saving: false,
          success: false,
          error: message,
          lastSaved: null,
        });
        toast.error(message);
      }
    },
    [
      artist?.handle,
      artist?.image_url,
      artist?.name,
      profileId,
      router,
      updateProfile,
    ]
  );

  const debouncedProfileSave = useMemo(
    () =>
      debounce(async (...args: unknown[]) => {
        const [next] = args as [{ displayName: string; username: string }];
        await saveProfile(next);
      }, 900),
    [saveProfile]
  );

  useEffect(() => {
    return () => {
      debouncedProfileSave.flush();
    };
  }, [debouncedProfileSave]);

  const handleAvatarUpload = useCallback(
    async (file: File): Promise<string> => {
      try {
        const blobUrl = await uploadAvatar(file);
        const result = await updateProfile({ avatarUrl: blobUrl });
        const nextAvatar = result.profile.avatarUrl ?? blobUrl;
        setArtist(prev => {
          if (!prev) return prev;
          return { ...prev, image_url: nextAvatar };
        });
        if (result.warning) {
          toast.message(result.warning);
        } else {
          toast.success('Profile photo updated');
        }
        router.refresh();
        return nextAvatar;
      } finally {
        // no-op
      }
    },
    [router, updateProfile, uploadAvatar]
  );

  const buildPlatformMeta = useCallback((link: ProfileSocialLink): Platform => {
    const displayName = getSocialPlatformLabel(link.platform as SocialPlatform);
    const category: PlatformType =
      (link.platformType as PlatformType | null | undefined) ??
      getPlatformCategory(link.platform);
    return {
      id: link.platform,
      name: displayName,
      category,
      icon: link.platform,
      color: '#000000',
      placeholder: link.url,
    };
  }, []);

  const convertDbLinkToDetected = useCallback(
    (
      link: ProfileSocialLink
    ): DetectedLink & {
      id: string;
      state?: 'active' | 'suggested' | 'rejected';
      confidence?: number | null;
      sourcePlatform?: string | null;
      sourceType?: 'manual' | 'admin' | 'ingested' | null;
      evidence?: { sources?: string[]; signals?: string[] } | null;
    } => {
      const platform = buildPlatformMeta(link);
      const title = link.displayText || platform.name;
      return {
        // DetectedLink fields
        platform,
        normalizedUrl: link.url,
        originalUrl: link.url,
        suggestedTitle: title,
        isValid: true,
        // Extended metadata
        id: link.id,
        state: link.state ?? 'active',
        confidence:
          typeof link.confidence === 'number'
            ? link.confidence
            : Number.parseFloat(String(link.confidence ?? '0')) || null,
        sourcePlatform: link.sourcePlatform ?? null,
        sourceType: link.sourceType ?? null,
        evidence: link.evidence ?? null,
      };
    },
    [buildPlatformMeta]
  );

  // Convert database social links to LinkItem format
  const convertDbLinksToLinkItems = useCallback(
    (dbLinks: ProfileSocialLink[] = []): LinkItem[] => {
      return dbLinks.map((link, index) => {
        const detected = convertDbLinkToDetected(link);
        const platformMeta = buildPlatformMeta(link);
        const order =
          typeof link.sortOrder === 'number' ? link.sortOrder : index;
        const isVisible = link.isActive ?? true;
        const category = platformMeta.category;

        const item: LinkItem = {
          id: detected.id,
          title: detected.suggestedTitle,
          url: detected.normalizedUrl,
          platform: platformMeta,
          isVisible,
          order,
          category,
          normalizedUrl: detected.normalizedUrl,
          originalUrl: detected.originalUrl,
          suggestedTitle: detected.suggestedTitle,
          isValid: detected.isValid,
          state: detected.state,
          confidence: detected.confidence ?? null,
          sourcePlatform: detected.sourcePlatform ?? null,
          sourceType: detected.sourceType ?? null,
          evidence: detected.evidence ?? null,
          version: link.version ?? 1,
        };

        return item;
      });
    },
    [buildPlatformMeta, convertDbLinkToDetected]
  );

  const [links, setLinks] = useState<LinkItem[]>(() =>
    convertDbLinksToLinkItems(initialLinks)
  );

  const [suggestions, setSuggestions] = useState<SuggestedLink[]>([]);

  useEffect(() => {
    const newLinks = convertDbLinksToLinkItems(initialLinks);
    setLinks(prev => (areLinkItemsEqual(prev, newLinks) ? prev : newLinks));
  }, [initialLinks, convertDbLinksToLinkItems]);

  const fetchSuggestions = useCallback(async (): Promise<void> => {
    if (!profileId || !suggestionsEnabled) return;

    try {
      const response = await fetch(
        `/api/dashboard/${profileId}/link-suggestions`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        console.warn('Failed to fetch suggestions');
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        suggestions?: Array<{
          platform: {
            id: string;
            name: string;
            category?: PlatformType;
            icon: string;
            color: string;
            placeholder: string;
          };
          normalizedUrl: string;
          originalUrl: string;
          suggestedTitle: string;
          isValid: boolean;
          suggestionId: string;
          state?: 'active' | 'suggested' | 'rejected';
          confidence?: number | null;
          sourcePlatform?: string | null;
          sourceType?: 'manual' | 'admin' | 'ingested' | null;
          evidence?: { sources?: string[]; signals?: string[] } | null;
        }>;
      } | null;

      if (!data?.suggestions) {
        setSuggestions([]);
        return;
      }

      const newSuggestions: SuggestedLink[] = data.suggestions.map(item => ({
        ...item,
        platform: {
          ...item.platform,
          category:
            (item.platform.category as PlatformType | null | undefined) ??
            getPlatformCategory(item.platform.id),
        },
      }));

      setSuggestions(prev =>
        areSuggestionListsEqual(prev, newSuggestions) ? prev : newSuggestions
      );
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    }
  }, [profileId, suggestionsEnabled]);

  usePollingCoordinator({
    profileId,
    autoRefreshUntilMs,
    suggestionsEnabled,
    onFetch: fetchSuggestions,
  });

  const handleAcceptSuggestion = useCallback(
    async (suggestion: SuggestedLink): Promise<void> => {
      if (!profileId) return;

      try {
        const response = await fetch(
          `/api/dashboard/${profileId}/link-suggestions/${suggestion.suggestionId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'accept' }),
          }
        );

        if (response.ok) {
          toast.success('Link added successfully');
          setAutoRefreshUntilMs(Date.now() + 5000);

          // Remove from suggestions
          setSuggestions(prev =>
            prev.filter(s => s.suggestionId !== suggestion.suggestionId)
          );
        } else {
          toast.error('Failed to add link');
        }
      } catch (error) {
        console.error('Error accepting suggestion:', error);
        toast.error('Failed to add link');
      }
    },
    [profileId]
  );

  const handleRejectSuggestion = useCallback(
    async (suggestion: SuggestedLink): Promise<void> => {
      if (!profileId) return;

      try {
        const response = await fetch(
          `/api/dashboard/${profileId}/link-suggestions/${suggestion.suggestionId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'reject' }),
          }
        );

        if (response.ok) {
          // Remove from suggestions
          setSuggestions(prev =>
            prev.filter(s => s.suggestionId !== suggestion.suggestionId)
          );
        } else {
          toast.error('Failed to dismiss suggestion');
        }
      } catch (error) {
        console.error('Error rejecting suggestion:', error);
        toast.error('Failed to dismiss suggestion');
      }
    },
    [profileId]
  );

  const handleLinkChange = useCallback(
    async (updatedLinks: LinkItem[]): Promise<void> => {
      setLinks(updatedLinks);
      if (!profileId) return;

      try {
        const updatePayload = updatedLinks.map((link, index) => ({
          id: link.id,
          displayText: link.title,
          url: link.url,
          isActive: link.isVisible,
          sortOrder: index,
        }));

        const response = await fetch(
          `/api/dashboard/${profileId}/social-links`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatePayload),
          }
        );

        if (!response.ok) {
          toast.error('Failed to update links');
          setAutoRefreshUntilMs(Date.now() + 3000);
        } else {
          toast.success('Links updated');
        }
      } catch (error) {
        console.error('Error updating links:', error);
        toast.error('Failed to update links');
        setAutoRefreshUntilMs(Date.now() + 3000);
      }
    },
    [profileId]
  );

  const handleLinkAdd = useCallback(
    async (link: LinkItem): Promise<void> => {
      if (!profileId) return;

      try {
        const response = await fetch(
          `/api/dashboard/${profileId}/social-links`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              platform: link.platform.id,
              displayText: link.title,
              url: link.url,
            }),
          }
        );

        if (response.ok) {
          toast.success('Link added successfully');
          setAutoRefreshUntilMs(Date.now() + 5000);
        } else {
          toast.error('Failed to add link');
        }
      } catch (error) {
        console.error('Error adding link:', error);
        toast.error('Failed to add link');
      }
    },
    [profileId]
  );

  const handleLinkDelete = useCallback(
    async (linkId: string): Promise<void> => {
      if (!profileId) return;

      try {
        const response = await fetch(
          `/api/dashboard/${profileId}/social-links/${linkId}`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          toast.success('Link removed successfully');
          setAutoRefreshUntilMs(Date.now() + 5000);
        } else {
          toast.error('Failed to remove link');
        }
      } catch (error) {
        console.error('Error deleting link:', error);
        toast.error('Failed to remove link');
      }
    },
    [profileId]
  );

  const _previewPanel = usePreviewPanel();

  return (
    <div className='space-y-6'>
      <div className='rounded-lg border border-surface-2 bg-surface-0 p-6'>
        <div className='space-y-6'>
          {/* Display Name Field */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-text-2'>
              Display Name
            </label>
            {editingField === 'displayName' ? (
              <div className='flex gap-2'>
                <Input
                  ref={displayNameInputRef}
                  value={profileDisplayName}
                  onChange={e => setProfileDisplayName(e.target.value)}
                  onBlur={() => {
                    setEditingField(null);
                    debouncedProfileSave({
                      displayName: profileDisplayName,
                      username: profileUsername,
                    });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setEditingField(null);
                      debouncedProfileSave({
                        displayName: profileDisplayName,
                        username: profileUsername,
                      });
                    }
                  }}
                  className='flex-1'
                />
              </div>
            ) : (
              <div
                onClick={() => setEditingField('displayName')}
                className='cursor-pointer rounded-lg border border-surface-2 bg-surface-1 p-3 text-text-1 hover:bg-surface-2'
              >
                {profileDisplayName || 'Click to add display name'}
              </div>
            )}
          </div>

          {/* Username Field */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-text-2'>Username</label>
            {editingField === 'username' ? (
              <div className='flex gap-2'>
                <Input
                  ref={usernameInputRef}
                  value={profileUsername}
                  onChange={e => setProfileUsername(e.target.value)}
                  onBlur={() => {
                    setEditingField(null);
                    debouncedProfileSave({
                      displayName: profileDisplayName,
                      username: profileUsername,
                    });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setEditingField(null);
                      debouncedProfileSave({
                        displayName: profileDisplayName,
                        username: profileUsername,
                      });
                    }
                  }}
                  className='flex-1'
                />
              </div>
            ) : (
              <div
                onClick={() => setEditingField('username')}
                className='cursor-pointer rounded-lg border border-surface-2 bg-surface-1 p-3 text-text-1 hover:bg-surface-2'
              >
                {profileUsername || 'Click to add username'}
              </div>
            )}
          </div>

          {/* Avatar Upload */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-text-2'>
              Profile Photo
            </label>
            {isMusicProfile && artist ? (
              <AvatarUploadable
                artist={artist}
                onUpload={handleAvatarUpload}
                maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
                supportedMimeTypes={SUPPORTED_IMAGE_MIME_TYPES}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Links Manager */}
      <GroupedLinksManager
        links={links}
        suggestions={suggestionsEnabled ? suggestions : []}
        onLinksChange={handleLinkChange}
        onAcceptSuggestion={handleAcceptSuggestion}
        onRejectSuggestion={handleRejectSuggestion}
        onAddLink={handleLinkAdd}
        onDeleteLink={handleLinkDelete}
      />
    </div>
  );
}
