'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/dashboard/actions';
import { useDashboardData } from '@/app/dashboard/DashboardDataContext';
import { usePreviewPanel } from '@/app/dashboard/PreviewPanelContext';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { GroupedLinksManager } from './GroupedLinksManager';

// Define platform types
type PlatformType = 'social' | 'dsp' | 'earnings' | 'custom';

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
  const dashboardData = useDashboardData();
  const [artist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  const isMusicProfile =
    dashboardData.selectedProfile?.creatorType === 'artist';
  const profileId = dashboardData.selectedProfile?.id;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    saving: false,
    success: null,
    error: null,
    lastSaved: null,
  });
  const linkIngestionGate = useFeatureGate(STATSIG_FLAGS.LINK_INGESTION);
  const suggestionsEnabled = linkIngestionGate?.value ?? false;

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

  useEffect(() => {
    setSuggestedLinks(
      convertDbLinksToSuggestions(suggestionInitialLinks || [])
    );
  }, [convertDbLinksToSuggestions, suggestionInitialLinks]);

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
            rawCategory === 'earnings'
              ? rawCategory
              : 'custom';

          return {
            ...item,
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
          setLinks(normalized);

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
    [profileId]
  );

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

  // Get username and avatar for preview
  const username = artist?.name || 'username';
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
      <div className='w-full min-w-0'>
        <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm h-full'>
          <div className='mb-6'>
            <h1 className='text-2xl font-bold text-primary-token'>
              Manage Links
            </h1>
            <p className='mt-1 text-sm text-secondary-token'>
              Add and manage your social and streaming links. Changes save
              automatically.
              {saveStatus.lastSaved && (
                <span className='ml-2 text-xs text-secondary-token'>
                  Last saved: {saveStatus.lastSaved.toLocaleTimeString()}
                </span>
              )}
            </p>
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
    </div>
  );
}
