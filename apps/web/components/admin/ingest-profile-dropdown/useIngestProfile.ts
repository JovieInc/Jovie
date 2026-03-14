'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useArtistSearchQuery, useIngestProfileMutation } from '@/lib/queries';
import { detectPlatform, normalizeUrl } from '@/lib/utils/platform-detection';
import type { PlatformInfo } from '@/lib/utils/platform-detection/types';
import {
  getNetworkFromPlatform,
  INGEST_NETWORKS,
  type IngestNetworkId,
} from './ingest-network-options';
import type { UseIngestProfileReturn } from './types';

interface UseIngestProfileOptions {
  onIngestPending?: (profile: { id: string; username: string }) => void;
}

export function getNormalizedInputUrl(
  network: IngestNetworkId,
  inputValue: string
): string {
  const trimmed = inputValue.trim();
  if (!trimmed) return '';

  if (network === 'spotify') {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return normalizeUrl(trimmed);
    }

    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
      return `https://open.spotify.com/artist/${trimmed}`;
    }

    return normalizeUrl(trimmed);
  }

  const hasProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://');
  if (hasProtocol || trimmed.includes('.')) {
    return normalizeUrl(trimmed);
  }

  const networkConfig = INGEST_NETWORKS.find(option => option.id === network);
  if (!networkConfig) {
    return normalizeUrl(trimmed);
  }

  return normalizeUrl(`${networkConfig.preset}${trimmed}`);
}

export function useIngestProfile({
  onIngestPending,
}: UseIngestProfileOptions): UseIngestProfileReturn {
  const router = useRouter();
  const notifications = useNotifications();

  const [open, setOpen] = useState(false);
  const [network, setNetwork] = useState<IngestNetworkId>('instagram');
  const [inputValue, setInputValue] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const inputPlaceholder =
    INGEST_NETWORKS.find(option => option.id === network)?.placeholder ??
    'Paste profile URL';

  const normalizedInputUrl = useMemo(
    () => getNormalizedInputUrl(network, inputValue),
    [network, inputValue]
  );

  const detectedPlatform: PlatformInfo | null = useMemo(() => {
    if (!normalizedInputUrl) return null;

    try {
      const detected = detectPlatform(normalizedInputUrl);
      if (detected.platform.id === 'website') return null;
      return detected.platform;
    } catch {
      return null;
    }
  }, [normalizedInputUrl]);

  const artistSearch = useArtistSearchQuery({
    minQueryLength: 2,
    limit: 6,
  });

  // Use refs for stable access in effects to avoid re-render loops
  const artistSearchRef = useRef(artistSearch);
  useLayoutEffect(() => {
    artistSearchRef.current = artistSearch;
  });

  useEffect(() => {
    const detectedNetwork = getNetworkFromPlatform(detectedPlatform);
    if (!detectedNetwork || detectedNetwork === network) return;

    // Auto-switch when a URL clearly maps to another network.
    if (inputValue.includes('.') || inputValue.startsWith('http')) {
      setNetwork(detectedNetwork);
    }
  }, [detectedPlatform, inputValue, network]);

  useEffect(() => {
    const { search, clear } = artistSearchRef.current;
    if (network !== 'spotify') {
      clear();
      return;
    }

    if (inputValue.trim().startsWith('http')) {
      clear();
      return;
    }

    search(inputValue);
  }, [inputValue, network]);

  const ingestProfileMutation = useIngestProfileMutation();

  const runIngestion = useCallback(
    async (url: string): Promise<void> => {
      const result = await ingestProfileMutation.mutateAsync({ url });
      const profileId = result.profile?.id;
      const profileUsername = result.profile?.username;
      notifications.success(
        profileUsername
          ? `Created creator profile @${profileUsername}`
          : 'Created new creator profile',
        {
          action: profileUsername
            ? {
                label: 'View profile',
                onClick: () => router.push(`/${profileUsername}`),
              }
            : undefined,
        }
      );
      if (profileId && profileUsername) {
        onIngestPending?.({ id: profileId, username: profileUsername });
      }
      setIsSuccess(true);
      setInputValue('');
      artistSearchRef.current.clear();
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setIsSuccess(false);
      }, 900);
    },
    [ingestProfileMutation, notifications, router, onIngestPending]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmed = inputValue.trim();
      const isSpotifyNameSearch =
        network === 'spotify' &&
        !trimmed.startsWith('http') &&
        !/^[a-zA-Z0-9]{22}$/.test(trimmed);

      // For Spotify name searches, auto-select the top result
      if (isSpotifyNameSearch) {
        const topResult = artistSearchRef.current.results[0];
        if (!topResult) {
          notifications.error(
            'Select a Spotify artist or paste a Spotify artist URL'
          );
          return;
        }
        setInputValue(topResult.url);
        try {
          await runIngestion(getNormalizedInputUrl('spotify', topResult.url));
        } catch (error) {
          console.error('Ingestion error', error);
          notifications.error(
            error instanceof Error ? error.message : 'Failed to ingest profile'
          );
          setIsSuccess(false);
        }
        return;
      }

      const normalizedUrl = getNormalizedInputUrl(network, inputValue);
      if (!normalizedUrl) {
        notifications.error(
          network === 'spotify'
            ? 'Select a Spotify artist or paste a Spotify artist URL'
            : 'Enter a profile URL or handle'
        );
        return;
      }

      try {
        await runIngestion(normalizedUrl);
      } catch (error) {
        console.error('Ingestion error', error);
        notifications.error(
          error instanceof Error ? error.message : 'Failed to ingest profile'
        );
        setIsSuccess(false);
      }
    },
    [inputValue, network, notifications, runIngestion]
  );

  return {
    open,
    setOpen,
    network,
    setNetwork,
    inputValue,
    setInputValue,
    inputPlaceholder,
    isLoading: ingestProfileMutation.isPending,
    isSuccess,
    detectedPlatform,
    spotifyResults: artistSearch.results,
    spotifyState: artistSearch.state,
    spotifyError: artistSearch.error,
    selectSpotifyArtist: artist => {
      setInputValue(artist.url);
      setNetwork('spotify');
    },
    handleSubmit,
  };
}
