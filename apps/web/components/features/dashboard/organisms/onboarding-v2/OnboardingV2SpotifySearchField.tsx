import { Button, CompositeField, HostDrawnInput, Spinner } from '@jovie/ui';
import { ArrowRight, Music2 } from 'lucide-react';
import Image from 'next/image';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { presentUnmanagedListing } from '@/lib/profile/artist-status-presentation';
import type { SpotifyArtistResult } from '@/lib/queries';
import type { SelectedArtist } from './onboardingV2Model';

interface OnboardingV2SpotifySearchFieldProps {
  readonly isLoading: boolean;
  readonly onInput: (value: string) => void;
  readonly onSelectArtist: (artist: SelectedArtist) => void;
  readonly results: SpotifyArtistResult[];
  readonly value: string;
}

function SearchResults({
  onSelectArtist,
  results,
}: Readonly<{
  onSelectArtist: (artist: SelectedArtist) => void;
  results: SpotifyArtistResult[];
}>) {
  if (results.length === 0) return null;

  return (
    <ContentSurfaceCard className='absolute top-full right-0 left-0 z-10 mt-2'>
      <ul className='max-h-80 overflow-y-auto p-1'>
        {results.map(artist => {
          const followerLabel = artist.followers
            ? `${artist.followers.toLocaleString()} followers`
            : 'Spotify';

          return (
            <li key={artist.id}>
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  onSelectArtist({
                    id: artist.id,
                    imageUrl: artist.imageUrl ?? null,
                    name: artist.name,
                    url: artist.url,
                  });
                }}
                className='w-full justify-start'
              >
                {artist.imageUrl ? (
                  <Image
                    src={artist.imageUrl}
                    alt=''
                    width={40}
                    height={40}
                    className='mr-3 h-10 w-10 rounded-full object-cover'
                    unoptimized
                  />
                ) : (
                  <div className='mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-0 text-tertiary-token'>
                    <Music2 className='h-4 w-4' />
                  </div>
                )}

                <div className='mr-3 min-w-0 flex-1 text-left'>
                  <p className='truncate text-sm font-semibold text-primary-token'>
                    {artist.name}
                  </p>
                  <p className='text-xs text-secondary-token'>
                    {followerLabel}
                  </p>
                </div>

                {artist.isClaimed ? (
                  <span
                    className='shrink-0 text-2xs text-tertiary-token'
                    data-testid='listing-badge'
                  >
                    {presentUnmanagedListing().label}
                  </span>
                ) : (
                  <ArrowRight className='h-4 w-4 shrink-0 text-tertiary-token' />
                )}
              </Button>
            </li>
          );
        })}

        <li className='flex items-center justify-between border-t border-subtle px-3 py-2'>
          <span className='text-xs text-tertiary-token'>Need help?</span>
          <a
            href='mailto:support@jov.ie'
            className='text-xs text-secondary-token transition-colors hover:text-primary-token'
          >
            Contact support
          </a>
        </li>
      </ul>
    </ContentSurfaceCard>
  );
}

export function OnboardingV2SpotifySearchField({
  isLoading,
  onInput,
  onSelectArtist,
  results,
  value,
}: Readonly<OnboardingV2SpotifySearchFieldProps>) {
  return (
    <div className='relative'>
      <CompositeField surface='field' shape='md' size='md' className='w-full'>
        <Music2 className='h-4 w-4 shrink-0 text-tertiary-token' />
        <HostDrawnInput
          aria-label='Search By Artist Name Or Paste A Spotify Link'
          autoCapitalize='none'
          autoComplete='off'
          autoCorrect='off'
          className='min-w-0 flex-1'
          onChange={event => onInput(event.target.value)}
          placeholder='Search by artist name or paste a Spotify link'
          spellCheck={false}
          type='text'
          value={value}
        />
        {isLoading ? <Spinner size='sm' /> : null}
      </CompositeField>
      <SearchResults onSelectArtist={onSelectArtist} results={results} />
    </div>
  );
}
