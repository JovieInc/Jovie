'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useArtistSearchQuery } from '@/lib/queries';
import type {
  ComboboxOption,
  PendingClaim,
  SearchResult,
  SelectionState,
  UseArtistSelectionFormReturn,
} from './types';

export function useArtistSelectionForm(): UseArtistSelectionFormReturn {
  const router = useRouter();
  const [selectedArtist, setSelectedArtist] = useState<SearchResult | null>(
    null
  );
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(null);
  const [state, setState] = useState<SelectionState>({
    loading: false,
    error: null,
    retryCount: 0,
  });

  const {
    results: searchResults,
    state: searchState,
    error: searchError,
    search: searchArtists,
    clear: clearResults,
  } = useArtistSearchQuery();

  const isLoading = searchState === 'loading';

  // Check for pending claim in sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('pendingClaim');
    if (stored) {
      try {
        const claim = JSON.parse(stored) as PendingClaim;
        setPendingClaim(claim);

        // Auto-populate the search with the pending artist name
        searchArtists(claim.artistName);
      } catch {
        setState(prev => ({ ...prev, error: 'Invalid pending claim data' }));
      }
    }
  }, [searchArtists]);

  const handleArtistSelect = useCallback(
    (option: ComboboxOption | null) => {
      if (option) {
        // Find the full artist data from results
        const artist = searchResults.find(
          (a: SearchResult) => a.id === option.id
        );
        if (artist) {
          setSelectedArtist(artist);
        }
      } else {
        setSelectedArtist(null);
      }
    },
    [searchResults]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      if (value.trim()) {
        searchArtists(value);
      } else {
        clearResults();
      }
    },
    [searchArtists, clearResults]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedArtist) return;

      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        // Store the selected artist for the onboarding process
        sessionStorage.setItem(
          'selectedArtist',
          JSON.stringify({
            spotifyId: selectedArtist.id,
            artistName: selectedArtist.name,
            imageUrl: selectedArtist.imageUrl,
            timestamp: Date.now(),
          })
        );

        // Clear the pending claim
        sessionStorage.removeItem('pendingClaim');

        // Redirect to onboarding
        router.push('/onboarding');
      } catch {
        setState(prev => ({
          ...prev,
          error: 'Failed to save artist selection. Please try again.',
          loading: false,
        }));
      }
    },
    [selectedArtist, router]
  );

  const handleSkip = useCallback(() => {
    // Clear any pending claims and redirect to onboarding
    sessionStorage.removeItem('pendingClaim');
    sessionStorage.removeItem('selectedArtist');
    router.push('/onboarding');
  }, [router]);

  const retryOperation = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  }, []);

  // Convert Spotify artists to Combobox options
  const options = useMemo(
    () =>
      searchResults.map((artist: SearchResult) => ({
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
      })),
    [searchResults]
  );

  // Auto-select the pending claim artist if found in results
  useEffect(() => {
    if (pendingClaim && searchResults.length > 0 && !selectedArtist) {
      const matchingArtist = searchResults.find(
        (artist: SearchResult) =>
          artist.name.toLowerCase() === pendingClaim.artistName.toLowerCase() ||
          artist.id === pendingClaim.spotifyId
      );
      if (matchingArtist) {
        setSelectedArtist(matchingArtist);
      }
    }
  }, [pendingClaim, searchResults, selectedArtist]);

  return {
    selectedArtist,
    pendingClaim,
    state,
    searchError,
    isLoading,
    options,
    handleArtistSelect,
    handleInputChange,
    handleSubmit,
    handleSkip,
    retryOperation,
  };
}
