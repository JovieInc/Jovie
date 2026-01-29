/**
 * Spotify Connect Hook
 *
 * Handles connecting to Spotify artists via search or URL.
 */

import { useCallback, useTransition } from 'react';
import { connectSpotifyArtist } from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { ReleasesEmptyStateAction } from '../types';

export interface SpotifyArtist {
  id: string;
  name: string;
  url: string;
}

export interface UseSpotifyConnectParams {
  dispatch: React.Dispatch<ReleasesEmptyStateAction>;
  searchClear: () => void;
  onConnected?: (releases: ReleaseViewModel[], artistName: string) => void;
  onImportStart?: (artistName: string) => void;
}

export function useSpotifyConnect({
  dispatch,
  searchClear,
  onConnected,
  onImportStart,
}: UseSpotifyConnectParams) {
  const [isPending, startTransition] = useTransition();

  // Extract Spotify artist ID from URL
  const extractSpotifyArtistId = useCallback((input: string): string | null => {
    const trimmed = input.trim();
    const artistMatch = trimmed.match(
      /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/
    );
    return artistMatch ? artistMatch[1] : null;
  }, []);

  // Handle direct connection from pasted URL
  const connectFromUrl = useCallback(
    (artistId: string) => {
      const artistUrl = `https://open.spotify.com/artist/${artistId}`;
      onImportStart?.('');

      startTransition(async () => {
        try {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artistId,
            spotifyArtistUrl: artistUrl,
            artistName: '',
          });

          if (result.success) {
            dispatch({ type: 'CLEAR_SEARCH' });
            onConnected?.(result.releases, result.artistName);
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
    [dispatch, onConnected, onImportStart]
  );

  // Handle selection from search results
  const handleArtistSelect = useCallback(
    (artist: SpotifyArtist) => {
      dispatch({ type: 'SET_ERROR', payload: null });

      // Clear the search UI and show importing state immediately
      dispatch({ type: 'CLEAR_SEARCH' });
      searchClear();
      onImportStart?.(artist.name);

      startTransition(async () => {
        try {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artist.id,
            spotifyArtistUrl: artist.url,
            artistName: artist.name,
          });

          if (result.success) {
            onConnected?.(result.releases, result.artistName);
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
    [searchClear, dispatch, onConnected, onImportStart]
  );

  // Handle manual URL submission
  const handleManualSubmit = useCallback(
    (manualUrl: string): boolean => {
      dispatch({ type: 'SET_ERROR', payload: null });

      const trimmedUrl = manualUrl.trim();
      if (!trimmedUrl) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Please enter a Spotify artist URL',
        });
        return false;
      }

      const artistId = extractSpotifyArtistId(trimmedUrl);
      if (!artistId) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Please enter a valid Spotify artist URL',
        });
        return false;
      }

      const artistUrl = `https://open.spotify.com/artist/${artistId}`;

      // Clear the form and show importing state
      dispatch({ type: 'RESET_MANUAL_MODE' });
      onImportStart?.('');

      startTransition(async () => {
        try {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artistId,
            spotifyArtistUrl: artistUrl,
            artistName: '',
          });

          if (result.success) {
            onConnected?.(result.releases, result.artistName);
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

      return true;
    },
    [dispatch, extractSpotifyArtistId, onConnected, onImportStart]
  );

  return {
    isPending,
    extractSpotifyArtistId,
    connectFromUrl,
    handleArtistSelect,
    handleManualSubmit,
  };
}
