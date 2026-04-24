'use client';

import { Search } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useReducer, useRef } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AuthButton } from '@/features/auth';
import { useSpotifyConnect } from '@/features/dashboard/organisms/release-provider-matrix/releases-empty-state/hooks/useSpotifyConnect';
import {
  initialState,
  type ReleasesEmptyStateAction,
  type ReleasesEmptyStateState,
} from '@/features/dashboard/organisms/release-provider-matrix/releases-empty-state/types';
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { env } from '@/lib/env-client';
import { type SpotifyArtistResult, useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

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
    artistName: string,
    spotifyArtistId?: string,
    spotifyUrl?: string
  ) => void;
  readonly onSkip: () => void;
  readonly isTransitioning: boolean;
}

/**
 * DSP connection step in onboarding.
 * JOV-1340: Uses fireAndForget mode so artist selection proceeds
 * immediately; the actual import runs in the background.
 */
export function OnboardingDspStep({
  title,
  prompt,
  onConnected,
  onSkip,
  isTransitioning,
}: OnboardingDspStepProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    results,
    state: searchState,
    search,
    clear: searchClear,
  } = useArtistSearchQuery();

  const { extractSpotifyArtistId, connectFromUrl, handleArtistSelect } =
    useSpotifyConnect({
      dispatch,
      searchClear,
      onConnected,
      fireAndForget: !env.IS_E2E, // Keep onboarding deterministic in Playwright
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

  return (
    <div className='flex flex-col items-center justify-center h-full'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={cn(FORM_LAYOUT.headerSection, 'mb-6')}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          {prompt ? <p className={FORM_LAYOUT.hint}>{prompt}</p> : null}
        </div>

        <ContentSurfaceCard className='p-4 sm:p-5'>
          <div className={cn(FORM_LAYOUT.formInner, 'space-y-2.5')}>
            <div className='relative'>
              <div
                className={cn(
                  AUTH_SURFACE.fieldShell,
                  state.error && AUTH_SURFACE.fieldShellError
                )}
              >
                <Search
                  className='h-4 w-4 shrink-0 text-tertiary-token'
                  aria-hidden='true'
                />
                <input
                  ref={inputRef}
                  type='text'
                  data-testid='spotify-link-input'
                  value={state.searchQuery}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder='Search for your artist or paste a Spotify link'
                  autoComplete='off'
                  autoCapitalize='none'
                  autoCorrect='off'
                  spellCheck={false}
                  aria-label='Search for your artist or paste a Spotify link'
                  aria-invalid={Boolean(state.error)}
                  aria-describedby={
                    state.error ? 'onboarding-dsp-search-error' : undefined
                  }
                  className={AUTH_SURFACE.fieldInput}
                />
                {searchState === 'loading' && (
                  <LoadingSpinner size='sm' className='text-tertiary-token' />
                )}
              </div>

              {state.showResults && results.length > 0 && (
                <ContentSurfaceCard
                  as='ul'
                  className='absolute top-full right-0 left-0 z-10 mt-2 max-h-[240px] overflow-y-auto p-1'
                >
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
                        className={cn(
                          'w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                          state.activeResultIndex === index
                            ? 'bg-surface-0'
                            : 'hover:bg-surface-0'
                        )}
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
                          <div className='h-8 w-8 shrink-0 rounded-full bg-surface-0' />
                        )}
                        <div className='min-w-0 flex-1'>
                          <p className='truncate text-app font-caption text-primary-token'>
                            {artist.name}
                          </p>
                          {artist.followers != null && (
                            <p className='text-[11px] text-tertiary-token'>
                              {artist.followers.toLocaleString()} followers
                            </p>
                          )}
                        </div>
                        {artist.isClaimed && (
                          <span className={AUTH_SURFACE.subtlePill}>
                            On Jovie
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ContentSurfaceCard>
              )}
            </div>

            {state.error && (
              <p
                id='onboarding-dsp-search-error'
                role='alert'
                className='text-error text-app text-center'
              >
                {state.error}
              </p>
            )}

            <AuthButton
              onClick={onSkip}
              variant='secondary'
              disabled={isTransitioning}
            >
              Skip for now
            </AuthButton>
          </div>
        </ContentSurfaceCard>

        <div className={cn(FORM_LAYOUT.footerHint, 'mt-4')}>
          You can always connect your music later from the dashboard.
        </div>
      </div>
    </div>
  );
}
