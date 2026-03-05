'use client';

import Image from 'next/image';
import { useCallback, useReducer, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { AuthButton } from '@/components/auth';
import { useSpotifyConnect } from '@/components/dashboard/organisms/release-provider-matrix/releases-empty-state/hooks/useSpotifyConnect';
import {
  initialState,
  type ReleasesEmptyStateAction,
  type ReleasesEmptyStateState,
} from '@/components/dashboard/organisms/release-provider-matrix/releases-empty-state/types';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { SpotifyArtistResult } from '@/lib/queries/useArtistSearchQuery';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';

function reducer(
  state: ReleasesEmptyStateState,
  action: ReleasesEmptyStateAction
): ReleasesEmptyStateState {
  switch (action.type) {
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload, showResults: true };
    case 'SET_SHOW_RESULTS':
      return { ...state, showResults: action.payload };
    case 'SET_ACTIVE_RESULT_INDEX':
      return { ...state, activeResultIndex: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_SEARCH':
      return {
        ...state,
        searchQuery: '',
        showResults: false,
        activeResultIndex: -1,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

interface OnboardingDspStepProps {
  readonly title: string;
  readonly prompt?: string;
  readonly onConnected: (
    releases: ReleaseViewModel[],
    artistName: string
  ) => void;
  readonly onSkip: () => void;
  readonly isTransitioning: boolean;
}

export function OnboardingDspStep({
  title,
  prompt,
  onConnected,
  onSkip,
  isTransitioning,
}: OnboardingDspStepProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [importingArtist, setImportingArtist] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    results,
    state: searchState,
    search,
    clear: searchClear,
  } = useArtistSearchQuery();

  const handleImportStart = useCallback((artistName: string) => {
    setImportingArtist(artistName || 'artist');
  }, []);

  const {
    isPending,
    extractSpotifyArtistId,
    connectFromUrl,
    handleArtistSelect,
  } = useSpotifyConnect({
    dispatch,
    searchClear,
    onConnected,
    onImportStart: handleImportStart,
  });

  const handleInputChange = useCallback(
    (value: string) => {
      dispatch({ type: 'SET_SEARCH_QUERY', payload: value });

      // Check if it's a Spotify URL
      const artistId = extractSpotifyArtistId(value);
      if (artistId) {
        connectFromUrl(artistId);
        return;
      }

      search(value);
    },
    [extractSpotifyArtistId, connectFromUrl, search]
  );

  const handleSelect = useCallback(
    (artist: SpotifyArtistResult) => {
      handleArtistSelect({
        id: artist.id,
        name: artist.name,
        url: artist.url,
      });
    },
    [handleArtistSelect]
  );

  const isImporting = isPending || importingArtist !== null;

  if (isImporting) {
    return (
      <div className='flex flex-col items-center justify-center h-full'>
        <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
          <div className={FORM_LAYOUT.headerSection}>
            <h1 className={FORM_LAYOUT.title}>Importing your music</h1>
            <p className={FORM_LAYOUT.hint}>
              Connecting{' '}
              {importingArtist ? `"${importingArtist}"` : 'your artist'} from
              Spotify...
            </p>
          </div>
          <div className='flex justify-center py-8'>
            <LoadingSpinner size='lg' className='text-accent' />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col items-center justify-center h-full'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          {prompt ? <p className={FORM_LAYOUT.hint}>{prompt}</p> : null}
        </div>

        <div className={FORM_LAYOUT.formInner}>
          <div className='relative'>
            <div
              className={[
                'w-full flex items-center gap-2 rounded-[6px] border bg-surface-0 dark:bg-surface-1 px-4 py-2.5',
                'focus-within:ring-2 focus-within:ring-accent/40 focus-within:ring-offset-2 focus-within:ring-offset-surface-0',
                state.error ? 'border-error' : 'border-subtle',
              ].join(' ')}
            >
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='h-4 w-4 shrink-0 text-secondary-token'
                aria-hidden='true'
              >
                <circle cx='11' cy='11' r='8' />
                <path d='m21 21-4.3-4.3' />
              </svg>
              <input
                ref={inputRef}
                type='text'
                value={state.searchQuery}
                onChange={e => handleInputChange(e.target.value)}
                placeholder='Search for your artist or paste a Spotify link'
                autoComplete='off'
                autoCapitalize='none'
                autoCorrect='off'
                spellCheck={false}
                className='min-w-0 flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token focus-visible:outline-none'
              />
              {searchState === 'loading' && (
                <LoadingSpinner size='sm' className='text-secondary-token' />
              )}
            </div>

            {state.showResults && results.length > 0 && (
              <ul className='absolute left-0 right-0 top-full z-10 mt-1 max-h-[240px] overflow-y-auto rounded-lg border border-subtle bg-surface-1 shadow-lg'>
                {results.map((artist, index) => (
                  <li key={artist.id}>
                    <button
                      type='button'
                      onClick={() => handleSelect(artist)}
                      onMouseEnter={() =>
                        dispatch({
                          type: 'SET_ACTIVE_RESULT_INDEX',
                          payload: index,
                        })
                      }
                      className={[
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        state.activeResultIndex === index
                          ? 'bg-surface-2/60'
                          : 'hover:bg-surface-2/40',
                      ].join(' ')}
                    >
                      {artist.imageUrl ? (
                        <Image
                          src={artist.imageUrl}
                          alt=''
                          width={32}
                          height={32}
                          className='h-8 w-8 shrink-0 rounded-full object-cover'
                          unoptimized
                        />
                      ) : (
                        <div className='h-8 w-8 shrink-0 rounded-full bg-surface-2' />
                      )}
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium text-primary-token'>
                          {artist.name}
                        </p>
                        {artist.followers != null && (
                          <p className='text-xs text-secondary-token'>
                            {artist.followers.toLocaleString()} followers
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {state.error && (
            <p className='text-error text-sm text-center'>{state.error}</p>
          )}

          <AuthButton
            onClick={onSkip}
            variant='secondary'
            disabled={isTransitioning}
          >
            Skip for now
          </AuthButton>
        </div>

        <div className={FORM_LAYOUT.footerHint}>
          You can always connect your music later from the dashboard.
        </div>
      </div>
    </div>
  );
}
