'use client';

/**
 * Spotify Connect Hook
 *
 * Handles connecting to Spotify artists via search or URL.
 * JOV-1340: Added `fireAndForget` option for non-blocking onboarding flow.
 */

import { useCallback, useTransition } from 'react';
import { connectSpotifyArtist } from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { env } from '@/lib/env-client';
import type { ReleasesEmptyStateAction } from '../types';

export interface SpotifyArtist {
  id: string;
  name: string;
  url: string;
}

export interface UseSpotifyConnectParams {
  dispatch: React.Dispatch<ReleasesEmptyStateAction>;
  searchClear: () => void;
  onConnected?: (
    releases: ReleaseViewModel[],
    artistName: string,
    spotifyArtistId?: string,
    spotifyUrl?: string
  ) => void;
  onImportStart?: (artistName: string) => void;
  /**
   * JOV-1340: When true, proceeds immediately without waiting for
   * the connect API call. The import runs in the background.
   * Used by onboarding to avoid blocking the user.
   */
  fireAndForget?: boolean;
}

export function useSpotifyConnect({
  dispatch,
  searchClear,
  onConnected,
  onImportStart,
  fireAndForget = false,
}: UseSpotifyConnectParams) {
  const [isPending, startTransition] = useTransition();
  const includeTracks = env.IS_E2E ? false : undefined;

  // Extract Spotify artist ID from URL
  const extractSpotifyArtistId = useCallback((input: string): string | null => {
    const trimmed = input.trim();
    const artistMatch =
      /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/.exec(trimmed);
    return artistMatch ? artistMatch[1] : null;
  }, []);

  // Handle direct connection from pasted URL
  const connectFromUrl = useCallback(
    (artistId: string) => {
      const artistUrl = `https://open.spotify.com/artist/${artistId}`;
      dispatch({ type: 'SET_ERROR', payload: null });
      dispatch({ type: 'CLEAR_SEARCH' });
      searchClear();

      if (fireAndForget) {
        // JOV-1340: Proceed immediately, connect in background
        onConnected?.([], '', artistId, artistUrl);
        void connectSpotifyArtist({
          spotifyArtistId: artistId,
          spotifyArtistUrl: artistUrl,
          artistName: '',
          includeTracks,
        }).catch(() => {
          // Import failure is non-critical during onboarding
        });
        return;
      }

      onImportStart?.('');
      startTransition(async () => {
        try {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artistId,
            spotifyArtistUrl: artistUrl,
            artistName: '',
            includeTracks,
          });

          if (result.success) {
            dispatch({ type: 'CLEAR_SEARCH' });
            if (result.importing) {
              onConnected?.([], result.artistName, artistId, artistUrl);
            } else {
              onConnected?.(
                result.releases,
                result.artistName,
                artistId,
                artistUrl
              );
            }
          } else {
            dispatch({ type: 'SET_ERROR', payload: result.message });
          }
        } catch (err) {
          dispatch({
            type: 'SET_ERROR',
            payload:
              err instanceof Error ? err.message : 'Failed to connect artist',
          });
        }
      });
    },
    [
      dispatch,
      searchClear,
      onConnected,
      onImportStart,
      fireAndForget,
      includeTracks,
    ]
  );

  // Handle selection from search results
  const handleArtistSelect = useCallback(
    (artist: SpotifyArtist) => {
      dispatch({ type: 'SET_ERROR', payload: null });
      dispatch({ type: 'CLEAR_SEARCH' });
      searchClear();

      if (fireAndForget) {
        // JOV-1340: Proceed immediately, connect in background
        onConnected?.([], artist.name, artist.id, artist.url);
        void connectSpotifyArtist({
          spotifyArtistId: artist.id,
          spotifyArtistUrl: artist.url,
          artistName: artist.name,
          includeTracks,
        }).catch(() => {
          // Import failure is non-critical during onboarding
        });
        return;
      }

      onImportStart?.(artist.name);
      startTransition(async () => {
        try {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artist.id,
            spotifyArtistUrl: artist.url,
            artistName: artist.name,
            includeTracks,
          });

          if (result.success) {
            if (result.importing) {
              onConnected?.([], result.artistName, artist.id, artist.url);
            } else {
              onConnected?.(
                result.releases,
                result.artistName,
                artist.id,
                artist.url
              );
            }
          } else {
            dispatch({ type: 'SET_ERROR', payload: result.message });
          }
        } catch (err) {
          dispatch({
            type: 'SET_ERROR',
            payload:
              err instanceof Error ? err.message : 'Failed to connect artist',
          });
        }
      });
    },
    [
      searchClear,
      dispatch,
      onConnected,
      onImportStart,
      fireAndForget,
      includeTracks,
    ]
  );

  return {
    isPending: fireAndForget ? false : isPending,
    extractSpotifyArtistId,
    connectFromUrl,
    handleArtistSelect,
  };
}
