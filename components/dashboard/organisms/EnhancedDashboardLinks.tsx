'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { Input } from '@/components/atoms/Input';
import { GroupedLinksManager } from '@/components/dashboard/organisms/GroupedLinksManager';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { useProfileSaveToasts } from '@/lib/hooks/useProfileSaveToasts';
import { usePollingCoordinator } from '@/lib/hooks/usePollingCoordinator';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { getProfileIdentity } from '@/lib/profile/profile-identity';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import {
  getSocialPlatformLabel,
  type SaveStatus,
  type SocialPlatform,
} from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

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

// Define platform types
type PlatformType = 'social' | 'dsp' | 'earnings' | 'websites' | 'custom';

function getHostnameForUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isIngestableUrl(value: string): boolean {
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

function getPlatformCategory(platform: string): PlatformType {
  const dspPlatforms = new Set([
    'spotify',
    'apple_music',
    'youtube_music',
    'soundcloud',
    'bandcamp',
    'tidal',
    'deezer',
    'amazon_music',
    'pandora',
  ]);

  const websitePlatforms = new Set(['website', 'linktree', 'laylo', 'beacons']);

  const earningsPlatforms = new Set([
    'patreon',
    'buy_me_a_coffee',
    'kofi',
    'paypal',
    'venmo',
    'cashapp',
    'shopify',
    'etsy',
    'amazon',
  ]);

  const socialPlatforms = new Set([
    'instagram',
    'twitter',
    'snapchat',
    'tiktok',
    'youtube',
    'facebook',
    'twitch',
  ]);

  if (dspPlatforms.has(platform)) return 'dsp';
  if (earningsPlatforms.has(platform)) return 'earnings';
  if (socialPlatforms.has(platform)) return 'social';
  if (websitePlatforms.has(platform)) return 'websites';
  return 'custom';
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
        };

        return item;
      });
    },
    [buildPlatformMeta, convertDbLinkToDetected]
  );

  const convertDbLinksToSuggestions = useCallback(
    (dbLinks: ProfileSocialLink[] = []): SuggestedLink[] => {
      return dbLinks.map(link => {
        const detected = convertDbLinkToDetected(link);
        return {
          ...detected,
          suggestionId: link.id,
        };
      });
    },
    [convertDbLinkToDetected]
  );

  const activeInitialLinks = useMemo(
    () => (initialLinks || []).filter(l => l.state !== 'suggested'),
    [initialLinks]
  );
  const suggestionInitialLinks = useMemo(
    () => (initialLinks || []).filter(l => l.state === 'suggested'),
    [initialLinks]
  );

  // Initialize links from server props
  const [links, setLinks] = useState<LinkItem[]>(() => {
    return convertDbLinksToLinkItems(activeInitialLinks || []);
  });

  const linksRef = useRef<LinkItem[]>(links);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  const suggestionSyncAbortRef = useRef<AbortController | null>(null);

  const [suggestedLinks, setSuggestedLinks] = useState<SuggestedLink[]>(() =>
    convertDbLinksToSuggestions(suggestionInitialLinks || [])
  );

  // Sync links when server props change (e.g., navigation back to page)
  useEffect(() => {
    setLinks(convertDbLinksToLinkItems(activeInitialLinks || []));
  }, [convertDbLinksToLinkItems, activeInitialLinks]);

  useEffect(() => {
    setSuggestedLinks(
      convertDbLinksToSuggestions(suggestionInitialLinks || [])
    );
  }, [convertDbLinksToSuggestions, suggestionInitialLinks]);

  const syncSuggestionsFromServer = useCallback(async () => {
    if (!profileId || !suggestionsEnabled) return;

    suggestionSyncAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionSyncAbortRef.current = controller;

    try {
      const response = await fetch(
        `/api/dashboard/social-links?profileId=${profileId}`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (!response.ok) return;

      const data = (await response.json().catch(() => null)) as {
        links?: ProfileSocialLink[];
      } | null;

      if (!data?.links) return;
      const nextSuggestions = convertDbLinksToSuggestions(
        data.links.filter(link => link.state === 'suggested')
      );
      setSuggestedLinks(prev =>
        areSuggestionListsEqual(prev, nextSuggestions) ? prev : nextSuggestions
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Failed to refresh suggestions', error);
    } finally {
      suggestionSyncAbortRef.current = null;
    }
  }, [convertDbLinksToSuggestions, profileId, suggestionsEnabled]);

  const pollIntervalMs = useMemo(
    () => (autoRefreshUntilMs ? 2000 : 4500),
    [autoRefreshUntilMs]
  );

  // Use polling coordinator to manage suggestion syncing
  const { registerTask, unregisterTask, updateTask } = usePollingCoordinator();

  useEffect(() => {
    if (!profileId || !suggestionsEnabled) {
      unregisterTask('sync-suggestions');
      return;
    }

    const cleanup = registerTask({
      id: 'sync-suggestions',
      callback: async () => {
        await syncSuggestionsFromServer();
        if (autoRefreshUntilMs && Date.now() >= autoRefreshUntilMs) {
          setAutoRefreshUntilMs(null);
        }
      },
      intervalMs: pollIntervalMs,
      priority: 1,
      enabled: true,
    });

    return cleanup;
  }, [
    profileId,
    suggestionsEnabled,
    pollIntervalMs,
    autoRefreshUntilMs,
    syncSuggestionsFromServer,
    registerTask,
    unregisterTask,
  ]);

  // Update interval when pollIntervalMs changes
  useEffect(() => {
    if (profileId && suggestionsEnabled) {
      updateTask('sync-suggestions', { intervalMs: pollIntervalMs });
    }
  }, [pollIntervalMs, profileId, suggestionsEnabled, updateTask]);

  const saveLoopRunningRef = useRef(false);
  const pendingSaveRef = useRef<LinkItem[] | null>(null);

  const persistLinks = useCallback(
    async (input: LinkItem[]): Promise<void> => {
      const normalized: LinkItem[] = input.map((item, index) => {
        const rawCategory = item.platform.category as PlatformType | undefined;
        const category: PlatformType =
          rawCategory === 'dsp' ||
          rawCategory === 'social' ||
          rawCategory === 'earnings' ||
          rawCategory === 'websites' ||
          rawCategory === 'custom'
            ? rawCategory
            : 'custom';

        return {
          ...item,
          platform: {
            ...item.platform,
            category,
          },
          category,
          order: typeof item.order === 'number' ? item.order : index,
        };
      });

      try {
        const payload = normalized.map((l, index) => ({
          platform: l.platform.id,
          platformType: l.platform.category,
          url: l.normalizedUrl,
          sortOrder: index,
          isActive: l.isVisible !== false,
          displayText: l.title,
          state: l.state ?? (l.isVisible ? 'active' : 'suggested'),
          confidence:
            typeof l.confidence === 'number'
              ? Number(l.confidence.toFixed(2))
              : undefined,
          sourcePlatform: l.sourcePlatform ?? undefined,
          sourceType: l.sourceType ?? undefined,
          evidence: l.evidence ?? undefined,
        }));

        if (!profileId) {
          toast.error('Unable to save links. Please refresh and try again.');
          return;
        }

        const response = await fetch('/api/dashboard/social-links', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, links: payload }),
        });
        if (!response.ok) {
          let message = 'Failed to save links';
          try {
            const data = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (data?.error && typeof data.error === 'string') {
              message = data.error;
            }
          } catch {
            // swallow JSON parse errors and fall back to default message
          }
          throw new Error(message);
        }

        // Keep normalized links locally; server IDs will be applied on next load
        setLinks(prev =>
          areLinkItemsEqual(prev, normalized) ? prev : normalized
        );

        if (suggestionsEnabled) {
          const hasIngestableLink = normalized.some(item => {
            return isIngestableUrl(item.normalizedUrl);
          });

          if (hasIngestableLink) {
            setAutoRefreshUntilMs(Date.now() + 20000);
            void syncSuggestionsFromServer();
          }
        }

        const now = new Date();
        toast.success(
          `Links saved successfully. Last saved: ${now.toLocaleTimeString()}`
        );
      } catch (error) {
        console.error('Error saving links:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to save links';
        toast.error(message || 'Failed to save links. Please try again.');
      }
    },
    [profileId, suggestionsEnabled, syncSuggestionsFromServer]
  );

  const enqueueSave = useCallback(
    (input: LinkItem[]): void => {
      pendingSaveRef.current = input;

      if (saveLoopRunningRef.current) return;
      saveLoopRunningRef.current = true;

      void (async () => {
        while (pendingSaveRef.current) {
          const next = pendingSaveRef.current;
          pendingSaveRef.current = null;
          await persistLinks(next);
        }
        saveLoopRunningRef.current = false;
      })();
    },
    [persistLinks]
  );

  // Save links to database (debounced) - enqueue ensures we never write older state after newer state.
  const debouncedSave = useMemo(
    () =>
      debounce((...args: unknown[]) => {
        const [input] = args as [LinkItem[]];
        enqueueSave(input);
      }, 500),
    [enqueueSave]
  );

  // Cancel pending saves when profileId changes to prevent saving to wrong profile
  // Flush on unmount to prevent data loss
  useEffect(() => {
    return () => {
      // On profileId change, cancel (don't flush) to avoid saving stale data to old profile
      // On unmount, this also cancels which is safe since component is going away
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Flush pending saves on actual unmount (not profileId change)
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManagerLinksChange = useCallback(
    (updated: DetectedLink[]) => {
      const mapped: LinkItem[] = updated.map((link, index) => {
        const meta = link as unknown as {
          id?: string;
          state?: 'active' | 'suggested' | 'rejected';
          confidence?: number | null;
          sourcePlatform?: string | null;
          sourceType?: 'manual' | 'admin' | 'ingested' | null;
          evidence?: { sources?: string[]; signals?: string[] } | null;
        };
        const rawVisibility = (link as unknown as { isVisible?: boolean })
          .isVisible;
        const isVisible = rawVisibility ?? true;
        const rawCategory = link.platform.category as PlatformType | undefined;
        const category: PlatformType = rawCategory ?? 'custom';

        const idBase = link.normalizedUrl || link.originalUrl;
        const state = meta.state ?? (isVisible ? 'active' : 'suggested');

        return {
          id: meta.id || `${link.platform.id}::${category}::${idBase}`,
          title: link.suggestedTitle || link.platform.name,
          url: link.normalizedUrl,
          platform: {
            id: link.platform.id,
            name: link.platform.name,
            category,
            icon: link.platform.icon,
            color: `#${link.platform.color}`,
            placeholder: link.platform.placeholder,
          },
          isVisible,
          order: index,
          category,
          normalizedUrl: link.normalizedUrl,
          originalUrl: link.originalUrl,
          suggestedTitle: link.suggestedTitle,
          isValid: link.isValid,
          state,
          confidence:
            typeof meta.confidence === 'number' ? meta.confidence : null,
          sourcePlatform: meta.sourcePlatform ?? null,
          sourceType: meta.sourceType ?? null,
          evidence: meta.evidence ?? null,
        };
      });
      let shouldSave = false;
      const isAdd = mapped.length > linksRef.current.length;
      setLinks(prev => {
        if (areLinkItemsEqual(prev, mapped)) {
          return prev;
        }
        shouldSave = true;
        return mapped;
      });
      if (shouldSave) {
        if (isAdd) {
          debouncedSave.cancel();
          enqueueSave(mapped);
        } else {
          debouncedSave(mapped);
        }
      }
    },
    [debouncedSave, enqueueSave]
  );

  const handleAcceptSuggestion = useCallback(
    async (
      suggestion: DetectedLink & {
        suggestionId?: string;
      }
    ) => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return null;
      }

      try {
        const suggestionId = suggestion.suggestionId;
        if (!suggestionId) {
          return null;
        }
        const response = await fetch('/api/dashboard/social-links', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            linkId: suggestionId,
            action: 'accept',
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || 'Failed to accept link');
        }

        const data = (await response.json()) as {
          link?: ProfileSocialLink;
        };

        if (data.link) {
          const [detected] = convertDbLinksToLinkItems([data.link]);
          setSuggestedLinks(prev =>
            prev.filter(s => s.suggestionId !== suggestionId)
          );
          if (detected) {
            setLinks(prev => [...prev, detected]);
          }
          toast.success('Link added to your list');
          return detected;
        }
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to accept link'
        );
      }
      return null;
    },
    [convertDbLinksToLinkItems, profileId]
  );

  const handleDismissSuggestion = useCallback(
    async (
      suggestion: DetectedLink & {
        suggestionId?: string;
      }
    ) => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return;
      }

      if (!suggestion.suggestionId) {
        return;
      }

      try {
        const response = await fetch('/api/dashboard/social-links', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            linkId: suggestion.suggestionId,
            action: 'dismiss',
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || 'Failed to dismiss link');
        }

        setSuggestedLinks(prev =>
          prev.filter(s => s.suggestionId !== suggestion.suggestionId)
        );
        toast.success('Suggestion dismissed');
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to dismiss link'
        );
      }
    },
    [profileId]
  );

  // Get username/handle and avatar for preview
  const { username, displayName, profilePath } = getProfileIdentity({
    profileUsername,
    profileDisplayName,
    artistHandle: artist?.handle,
    artistName: artist?.name,
  });
  const avatarUrl = artist?.image_url || null;

  // Convert links to the format expected by EnhancedDashboardLayout
  const dashboardLinks = useMemo(
    () =>
      links.map(link => {
        // Map our internal category type to the expected category type in EnhancedDashboardLayout
        const mapCategory = (
          category: PlatformType
        ): 'social' | 'music' | 'commerce' | 'other' | undefined => {
          switch (category) {
            case 'dsp':
              return 'music';
            case 'social':
              return 'social';
            case 'earnings':
              return 'commerce';
            case 'custom':
              return 'other';
            default:
              return undefined;
          }
        };

        return {
          id: link.id,
          title: link.title,
          url: link.normalizedUrl,
          platform: link.platform.id as
            | 'instagram'
            | 'twitter'
            | 'tiktok'
            | 'youtube'
            | 'spotify'
            | 'applemusic'
            | 'custom',
          isVisible: link.isVisible,
          category: mapCategory(link.category),
        };
      }),
    [links]
  );

  // Preview panel integration - sync data to context
  const { setPreviewData } = usePreviewPanel();

  // Keep preview data in sync with current links
  useEffect(() => {
    setPreviewData({
      username,
      displayName,
      avatarUrl: avatarUrl || null,
      links: dashboardLinks,
      profilePath,
    });
  }, [
    avatarUrl,
    dashboardLinks,
    displayName,
    profilePath,
    setPreviewData,
    username,
  ]);

  return (
    <div className='min-w-0 min-h-screen'>
      {/* Main content / links manager */}
      <div className='w-full min-w-0 space-y-4'>
        {profileId && artist && (
          <div className='mx-auto w-full max-w-2xl'>
            <div className='flex flex-col items-center gap-3'>
              <AvatarUploadable
                src={avatarUrl}
                alt={`Avatar for @${username}`}
                name={displayName}
                size='display-lg'
                uploadable
                onUpload={handleAvatarUpload}
                onError={message => {
                  toast.error(
                    message || 'Failed to upload avatar. Please try again.'
                  );
                }}
                maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
                acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
                showHoverOverlay
              />

              <div className='w-full max-w-md space-y-1.5'>
                <div className='grid gap-1'>
                  {editingField === 'displayName' ? (
                    <Input
                      ref={displayNameInputRef}
                      id='profile-display-name'
                      type='text'
                      aria-label='Display name'
                      value={profileDisplayName}
                      onChange={e => {
                        const nextValue = e.target.value;
                        setProfileDisplayName(nextValue);
                        setProfileSaveStatus(prev => ({
                          ...prev,
                          success: null,
                          error: null,
                        }));
                        debouncedProfileSave({
                          displayName: nextValue,
                          username: profileUsername,
                        });
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          debouncedProfileSave.flush();
                          setEditingField(null);
                        }
                        if (e.key === 'Escape') {
                          debouncedProfileSave.cancel();
                          setProfileDisplayName(
                            lastProfileSavedRef.current?.displayName ?? ''
                          );
                          setEditingField(null);
                        }
                      }}
                      onBlur={() => {
                        debouncedProfileSave.flush();
                        setEditingField(null);
                      }}
                    />
                  ) : (
                    <button
                      type='button'
                      className='w-full rounded-md py-1.5 text-center text-base font-medium text-primary-token hover:bg-surface-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent'
                      onClick={() => setEditingField('displayName')}
                      aria-label='Edit display name'
                    >
                      {profileDisplayName || 'Add display name'}
                    </button>
                  )}
                </div>

                <div className='grid gap-1'>
                  {editingField === 'username' ? (
                    <Input
                      ref={usernameInputRef}
                      id='profile-username'
                      type='text'
                      aria-label='Username'
                      value={profileUsername}
                      onChange={e => {
                        const rawValue = e.target.value;
                        const nextValue = rawValue.startsWith('@')
                          ? rawValue.slice(1)
                          : rawValue;
                        setProfileUsername(nextValue);
                        setProfileSaveStatus(prev => ({
                          ...prev,
                          success: null,
                          error: null,
                        }));
                        debouncedProfileSave({
                          displayName: profileDisplayName,
                          username: nextValue,
                        });
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          debouncedProfileSave.flush();
                          setEditingField(null);
                        }
                        if (e.key === 'Escape') {
                          debouncedProfileSave.cancel();
                          setProfileUsername(
                            lastProfileSavedRef.current?.username ?? ''
                          );
                          setEditingField(null);
                        }
                      }}
                      onBlur={() => {
                        debouncedProfileSave.flush();
                        setEditingField(null);
                      }}
                    />
                  ) : (
                    <button
                      type='button'
                      className='w-full rounded-md py-1 text-center text-sm font-medium text-secondary-token hover:bg-surface-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent'
                      onClick={() => setEditingField('username')}
                      aria-label='Edit username'
                    >
                      {profileUsername || 'Add username'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <GroupedLinksManager
          initialLinks={links as unknown as DetectedLink[]}
          onLinksChange={handleManagerLinksChange}
          creatorName={artist?.name ?? undefined}
          isMusicProfile={isMusicProfile}
          suggestedLinks={
            suggestionsEnabled ? (suggestedLinks as DetectedLink[]) : []
          }
          onAcceptSuggestion={
            suggestionsEnabled ? handleAcceptSuggestion : undefined
          }
          onDismissSuggestion={
            suggestionsEnabled ? handleDismissSuggestion : undefined
          }
          suggestionsEnabled={suggestionsEnabled}
          profileId={profileId}
        />
      </div>
    </div>
  );
}
