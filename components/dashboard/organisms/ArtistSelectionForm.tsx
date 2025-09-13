'use client';

import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Container } from '@/components/site/Container';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { Combobox } from '@/components/ui/Combobox';
import { useArtistSearch } from '@/lib/hooks/useArtistSearch';

interface PendingClaim {
  spotifyId: string;
  artistName: string;
  timestamp: number;
}

interface SelectionState {
  loading: boolean;
  error: string | null;
  retryCount: number;
}

interface SearchResult {
  id: string;
  name: string;
  imageUrl?: string;
  popularity: number;
  followers?: number;
  spotifyUrl: string;
}

export function ArtistSelectionForm() {
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
    searchResults,
    isLoading,
    error: searchError,
    searchArtists,
    clearResults,
  } = useArtistSearch();

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
    (option: { id: string; name: string; imageUrl?: string } | null) => {
      if (option) {
        // Find the full artist data from results
        const artist = searchResults.find(a => a.id === option.id);
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
      searchResults.map(artist => ({
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
        artist =>
          artist.name.toLowerCase() === pendingClaim.artistName.toLowerCase() ||
          artist.id === pendingClaim.spotifyId
      );
      if (matchingArtist) {
        setSelectedArtist(matchingArtist);
      }
    }
  }, [pendingClaim, searchResults, selectedArtist]);

  return (
    <div className='min-h-screen bg-base transition-colors'>
      {/* Subtle grid background pattern */}
      <div className='absolute inset-0 grid-bg dark:grid-bg-dark' />

      {/* Gradient orbs - more subtle like Linear */}
      <div className='absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-full blur-3xl' />
      <div className='absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl' />

      {/* Theme Toggle */}
      <div className='absolute top-4 right-4 z-20'>
        <ThemeToggle />
      </div>

      <Container className='relative z-10'>
        <div className='flex min-h-screen items-center justify-center py-12'>
          <div className='w-full max-w-md'>
            {/* Header */}
            <div className='text-center mb-8'>
              <h1 className='text-3xl font-semibold text-gray-900 dark:text-white mb-2 transition-colors'>
                Select Your Artist
              </h1>
              <p className='text-gray-600 dark:text-white/70 text-lg transition-colors'>
                {pendingClaim
                  ? `We found "${pendingClaim.artistName}" in your Spotify. Is this you?`
                  : 'Search for your artist profile on Spotify to get started.'}
              </p>
            </div>

            {/* Error display */}
            {state.error && (
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6'>
                <div className='flex items-center justify-between'>
                  <p className='text-red-800 dark:text-red-200 text-sm'>
                    {state.error}
                  </p>
                  <Button
                    onClick={retryOperation}
                    variant='secondary'
                    size='sm'
                    disabled={state.retryCount >= 3}
                  >
                    {state.retryCount >= 3 ? 'Max retries' : 'Retry'}
                  </Button>
                </div>
              </div>
            )}

            {/* Form Card */}
            <div className='bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-gray-200/50 dark:border-white/10 rounded-xl p-6 shadow-xl transition-colors'>
              <form onSubmit={handleSubmit} className='space-y-6'>
                <div>
                  <Combobox
                    options={options}
                    value={
                      selectedArtist
                        ? {
                            id: selectedArtist.id,
                            name: selectedArtist.name,
                            imageUrl: selectedArtist.imageUrl,
                          }
                        : null
                    }
                    onChange={handleArtistSelect}
                    onInputChange={handleInputChange}
                    placeholder='Search for your artist on Spotify...'
                    label='Artist Profile'
                    isLoading={isLoading}
                    error={searchError}
                    className='w-full'
                  />
                </div>

                <div className='flex flex-col space-y-3'>
                  <Button
                    type='submit'
                    disabled={!selectedArtist || state.loading}
                    variant='primary'
                    className='w-full'
                  >
                    {state.loading ? 'Saving...' : 'Continue with This Artist'}
                  </Button>

                  <Button
                    type='button'
                    onClick={handleSkip}
                    variant='secondary'
                    className='w-full'
                  >
                    Skip for Now
                  </Button>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className='text-center mt-8'>
              <p className='text-sm text-gray-500 dark:text-white/50 transition-colors'>
                You can always update your artist profile later
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
