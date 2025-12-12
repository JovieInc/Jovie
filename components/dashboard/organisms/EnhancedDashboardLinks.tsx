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
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
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

interface SaveStatus {
  saving: boolean;
  success: boolean | null;
  error: string | null;
  lastSaved: Date | null;
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
  const [avatarSaving, setAvatarSaving] = useState<boolean>(false);
  const avatarTriggerRef = useRef<HTMLDivElement | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    saving: false,
    success: null,
    error: null,
    lastSaved: null,
  });

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

  const [autoRefreshUntilMs, setAutoRefreshUntilMs] = useState<number | null>(
    null
  );

  useEffect(() => {
    if (!dashboardData.selectedProfile) {
      setArtist(null);
      setProfileDisplayName('');
      setProfileUsername('');
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
        setAvatarSaving(true);
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
        setAvatarSaving(false);
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

  useEffect(() => {
    if (!autoRefreshUntilMs) return;

    const intervalMs = 2000;
    const intervalId = window.setInterval(() => {
      if (!autoRefreshUntilMs) {
        window.clearInterval(intervalId);
        return;
      }
      if (Date.now() >= autoRefreshUntilMs) {
        setAutoRefreshUntilMs(null);
        window.clearInterval(intervalId);
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefreshUntilMs, router]);

  // Save links to database (debounced)
  const debouncedSave = useMemo(
    () =>
      debounce(async (...args: unknown[]) => {
        const [input] = args as [LinkItem[]];

        const normalized: LinkItem[] = input.map((item, index) => {
          const rawCategory = item.platform.category as
            | PlatformType
            | undefined;
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
          setSaveStatus(prev => ({ ...prev, saving: true }));

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
            setSaveStatus({
              saving: false,
              success: false,
              error:
                'Missing profile id; please refresh the page and try again.',
              lastSaved: null,
            });
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
              const url = item.normalizedUrl.toLowerCase();
              return (
                url.includes('youtube.com') ||
                url.includes('youtu.be') ||
                url.includes('linktr.ee') ||
                url.includes('laylo.com') ||
                url.includes('beacons.ai')
              );
            });

            if (hasIngestableLink) {
              setAutoRefreshUntilMs(Date.now() + 20000);
              router.refresh();
            }
          }

          const now = new Date();
          setSaveStatus({
            saving: false,
            success: true,
            error: null,
            lastSaved: now,
          });
          toast.success(
            `Links saved successfully. Last saved: ${now.toLocaleTimeString()}`
          );
        } catch (error) {
          console.error('Error saving links:', error);
          const message =
            error instanceof Error ? error.message : 'Failed to save links';
          setSaveStatus({
            saving: false,
            success: false,
            error: message,
            lastSaved: null,
          });
          toast.error(message || 'Failed to save links. Please try again.');
        }
      }, 500),
    [profileId, router, suggestionsEnabled]
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
      setLinks(prev => {
        if (areLinkItemsEqual(prev, mapped)) {
          return prev;
        }
        shouldSave = true;
        return mapped;
      });
      if (shouldSave) {
        debouncedSave(mapped);
      }
    },
    [debouncedSave]
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
  const username = artist?.handle || 'username';
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

  // Prepare links for the phone preview component
  const profilePath = `/${artist?.handle || 'username'}`;

  // Preview panel integration - sync data to context
  const { setPreviewData } = usePreviewPanel();

  // Keep preview data in sync with current links
  useEffect(() => {
    setPreviewData({
      username,
      avatarUrl: avatarUrl || null,
      links: dashboardLinks,
      profilePath,
    });
  }, [username, avatarUrl, dashboardLinks, profilePath, setPreviewData]);

  return (
    <div className='min-w-0 min-h-screen'>
      {/* Main content / links manager */}
      <div className='w-full min-w-0 space-y-6'>
        <div>
          <h1 className='text-2xl font-bold text-primary-token'>Profile</h1>
          <p className='mt-1 text-sm text-secondary-token'>
            Update your profile details and manage your links. Changes save
            automatically.
            {saveStatus.lastSaved && (
              <span className='ml-2 text-xs text-secondary-token'>
                Last saved: {saveStatus.lastSaved.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        {profileId && artist && (
          <div className='rounded-2xl border border-subtle bg-surface-1 p-5 md:p-6'>
            <div className='mb-5 flex items-start justify-between gap-4'>
              <div className='min-w-0'>
                <div className='text-sm font-semibold text-primary-token'>
                  Profile details
                </div>
                <div className='mt-0.5 text-xs text-secondary-token'>
                  Photo, name, username.
                </div>
              </div>

              {profileSaveStatus.saving || profileSaveStatus.success ? (
                <div
                  className='shrink-0 rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-secondary-token'
                  aria-live='polite'
                >
                  {profileSaveStatus.saving
                    ? 'Saving…'
                    : profileSaveStatus.success
                      ? 'Saved'
                      : null}
                </div>
              ) : null}
            </div>

            <div className='grid gap-6 md:grid-cols-[160px,1fr]'>
              <div className='flex flex-col items-start gap-3'>
                <AvatarUploadable
                  ref={avatarTriggerRef}
                  src={avatarUrl}
                  alt={`Avatar for @${artist.handle}`}
                  name={artist.name}
                  size='xl'
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
                  className='shrink-0'
                />
                <button
                  type='button'
                  className='inline-flex items-center justify-center rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-primary-token transition-colors hover:bg-surface-2/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token/20 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 disabled:opacity-60'
                  onClick={() => avatarTriggerRef.current?.click()}
                  disabled={avatarSaving}
                >
                  Change photo
                </button>
                <div className='text-xs text-secondary-token/70'>
                  {avatarSaving ? 'Updating photo…' : 'PNG, JPG, or WebP.'}
                </div>
              </div>

              <div className='grid w-full gap-4 md:max-w-xl md:border-l md:border-subtle md:pl-6'>
                <div className='grid gap-1.5'>
                  <label
                    htmlFor='profile-display-name'
                    className='text-xs font-medium tracking-wide text-secondary-token'
                  >
                    Display name
                  </label>
                  <Input
                    id='profile-display-name'
                    type='text'
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
                    onBlur={() => debouncedProfileSave.flush()}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <label
                    htmlFor='profile-username'
                    className='text-xs font-medium tracking-wide text-secondary-token'
                  >
                    Username
                  </label>
                  <div className='text-xs text-secondary-token/70'>
                    Used in your profile URL
                  </div>
                  <Input
                    id='profile-username'
                    type='text'
                    value={profileUsername}
                    onChange={e => {
                      const nextValue = e.target.value;
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
                    onBlur={() => debouncedProfileSave.flush()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className='flex items-end justify-between gap-3 border-b border-subtle pb-2'>
          <div>
            <h2 className='text-base font-semibold text-primary-token'>
              Links
            </h2>
            <p className='mt-0.5 text-sm text-secondary-token'>
              Add, reorder, and hide links.
            </p>
          </div>
        </div>

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
        />
      </div>
    </div>
  );
}
