'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_PLATFORMS } from '@/constants/platforms';
import { useProfileMutation } from '@/lib/queries';
import {
  useDashboardSocialLinksQuery,
  useSaveSocialLinksMutation,
} from '@/lib/queries/useDashboardSocialLinksQuery';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { Artist, CreatorProfile } from '@/types/db';
import { convertCreatorProfileToArtist } from '@/types/db';

/** The three primary DSP fields stored on the profile. */
export interface PrimaryDSPFields {
  spotify_url: string;
  apple_music_url: string;
  youtube_url: string;
}

/** An additional music DSP link (stored via social_links table). */
export interface AdditionalDSPLink {
  id: string;
  platform: string;
  url: string;
}

/** Music platform IDs from the platform registry. */
const MUSIC_PLATFORM_IDS: Set<string> = new Set(
  ALL_PLATFORMS.filter(p => p.category === 'music').map(p => p.id)
);

/** Primary DSP IDs that are stored on the profile (not in social_links). */
const PRIMARY_DSP_IDS: Set<string> = new Set([
  'spotify',
  'apple_music',
  'youtube',
]);

interface UseMusicLinksFormOptions {
  artist: Artist;
  onUpdate?: (artist: Artist) => void;
}

export interface UseMusicLinksFormReturn {
  /** The primary DSP fields (Spotify, Apple Music, YouTube). */
  primaryFields: PrimaryDSPFields;
  /** Additional music DSP links. */
  additionalLinks: AdditionalDSPLink[];
  /** Update a primary DSP field. */
  updatePrimaryField: (key: keyof PrimaryDSPFields, value: string) => void;
  /** Schedule URL normalization for a primary field. */
  schedulePrimaryNormalize: (
    key: keyof PrimaryDSPFields,
    value: string
  ) => void;
  /** Handle blur on a primary field. */
  handlePrimaryBlur: (key: keyof PrimaryDSPFields) => void;
  /** Add an additional DSP link. */
  addAdditionalLink: (platform?: string) => void;
  /** Remove an additional DSP link by index. */
  removeAdditionalLink: (index: number) => void;
  /** Update an additional DSP link field. */
  updateAdditionalLink: (
    index: number,
    field: keyof AdditionalDSPLink,
    value: string
  ) => void;
  /** Schedule URL normalization for an additional link. */
  scheduleAdditionalNormalize: (index: number, value: string) => void;
  /** Handle blur on an additional link URL. */
  handleAdditionalBlur: (index: number) => void;
  /** Save all changes (primary + additional). */
  handleSubmit: (e: React.FormEvent) => void;
  /** Whether any save is in progress. */
  loading: boolean;
  /** Whether initial data is loading. */
  initialLoading: boolean;
  /** Error message, if any. */
  error: string | undefined;
  /** Whether save was successful. */
  success: boolean;
}

export function useMusicLinksForm({
  artist,
  onUpdate,
}: UseMusicLinksFormOptions): UseMusicLinksFormReturn {
  // Primary DSP fields (stored on profile)
  const [primaryFields, setPrimaryFields] = useState<PrimaryDSPFields>({
    spotify_url: artist.spotify_url || '',
    apple_music_url: artist.apple_music_url || '',
    youtube_url: artist.youtube_url || '',
  });

  // Additional music DSP links (stored in social_links table)
  const [additionalLinks, setAdditionalLinks] = useState<AdditionalDSPLink[]>(
    []
  );
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Fetch existing social links to extract music DSPs
  const { data: fetchedLinks, isLoading: isFetchingLinks } =
    useDashboardSocialLinksQuery(artist.id);

  // Profile mutation for primary DSPs
  const { mutate: updateProfile, isPending: isProfileSaving } =
    useProfileMutation({
      silent: true,
      onSuccess: data => {
        const updatedArtist = convertCreatorProfileToArtist(
          data.profile as unknown as CreatorProfile
        );
        onUpdate?.(updatedArtist);
      },
      onError: () => {
        setError('Failed to update music links');
      },
    });

  // Social links mutation for additional DSPs
  const { mutateAsync: saveSocialMutation, isPending: isSocialSaving } =
    useSaveSocialLinksMutation(artist.id);

  // Initialize additional links from fetched social links (music platforms only)
  useEffect(() => {
    if (fetchedLinks) {
      const musicLinks = fetchedLinks.filter(
        link =>
          MUSIC_PLATFORM_IDS.has(link.platform) &&
          !PRIMARY_DSP_IDS.has(link.platform)
      );
      setAdditionalLinks(musicLinks);
    }
  }, [fetchedLinks]);

  // Auto-clear success after 3s
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Cleanup timers
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
    };
  }, []);

  // -- Primary field handlers --

  const updatePrimaryField = useCallback(
    (key: keyof PrimaryDSPFields, value: string) => {
      setPrimaryFields(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const schedulePrimaryNormalize = useCallback(
    (key: keyof PrimaryDSPFields, value: string) => {
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        try {
          const norm = normalizeUrl(value.trim());
          setPrimaryFields(prev =>
            prev[key] === norm ? prev : { ...prev, [key]: norm }
          );
        } catch {
          // ignore
        }
      }, 500);
    },
    []
  );

  const handlePrimaryBlur = useCallback((key: keyof PrimaryDSPFields) => {
    setPrimaryFields(prev => {
      const norm = normalizeUrl((prev[key] || '').trim());
      return prev[key] === norm ? prev : { ...prev, [key]: norm };
    });
  }, []);

  // -- Additional link handlers --

  const addAdditionalLink = useCallback((platform?: string) => {
    setAdditionalLinks(prev => [
      ...prev,
      { id: '', platform: platform || 'soundcloud', url: '' },
    ]);
  }, []);

  const removeAdditionalLink = useCallback((index: number) => {
    setAdditionalLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateAdditionalLink = useCallback(
    (index: number, field: keyof AdditionalDSPLink, value: string) => {
      setAdditionalLinks(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    []
  );

  const scheduleAdditionalNormalize = useCallback(
    (index: number, value: string) => {
      const key = `additional-${index}`;
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        try {
          const norm = normalizeUrl(value.trim());
          setAdditionalLinks(prev => {
            const next = [...prev];
            if (!next[index] || next[index].url === norm) return prev;
            next[index] = { ...next[index], url: norm };
            return next;
          });
        } catch {
          // ignore
        }
      }, 500);
    },
    []
  );

  const handleAdditionalBlur = useCallback((index: number) => {
    setAdditionalLinks(prev => {
      const next = [...prev];
      if (!next[index]) return prev;
      const norm = normalizeUrl((next[index].url || '').trim());
      if (next[index].url === norm) return prev;
      next[index] = { ...next[index], url: norm };
      return next;
    });
  }, []);

  // -- Save handler --

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(undefined);
      setSuccess(false);

      try {
        // 1. Save primary DSPs to profile
        updateProfile({
          profileId: artist.id,
          updates: {
            spotify_url: primaryFields.spotify_url || null,
            apple_music_url: primaryFields.apple_music_url || null,
            youtube_url: primaryFields.youtube_url || null,
          },
        });

        // 2. Save additional DSP links via social links API
        // We need to include ALL non-music social links + our music links
        const nonMusicLinks = (fetchedLinks || []).filter(
          link =>
            !MUSIC_PLATFORM_IDS.has(link.platform) ||
            PRIMARY_DSP_IDS.has(link.platform)
        );

        const additionalToSave = additionalLinks
          .filter(link => link.url.trim())
          .map((link, index) => ({
            platform: link.platform,
            platformType: link.platform,
            url: link.url.trim(),
            sortOrder: nonMusicLinks.length + index,
            isActive: true,
          }));

        // Rebuild full links list: keep non-music links + add music DSP links
        const allLinks = [
          ...nonMusicLinks.map((link, index) => ({
            platform: link.platform,
            platformType: link.platform,
            url: link.url,
            sortOrder: index,
            isActive: true,
          })),
          ...additionalToSave,
        ];

        await saveSocialMutation({ profileId: artist.id, links: allLinks });

        setSuccess(true);
      } catch {
        setError('Failed to save music links');
      }
    },
    [
      artist.id,
      primaryFields,
      additionalLinks,
      fetchedLinks,
      updateProfile,
      saveSocialMutation,
    ]
  );

  return {
    primaryFields,
    additionalLinks,
    updatePrimaryField,
    schedulePrimaryNormalize,
    handlePrimaryBlur,
    addAdditionalLink,
    removeAdditionalLink,
    updateAdditionalLink,
    scheduleAdditionalNormalize,
    handleAdditionalBlur,
    handleSubmit,
    loading: isProfileSaving || isSocialSaving,
    initialLoading: isFetchingLinks,
    error,
    success,
  };
}
