import { Button } from '@jovie/ui';
import { AtSign, Loader2 } from 'lucide-react';
import Image from 'next/image';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import { formatArtistPickerDifferentiator } from '@/lib/onboarding/artist-picker-match';
import {
  getDisplaySpotifyFollowers,
  normalizeArtistMetrics,
} from '@/lib/onboarding/canonical-metrics';
import { formatCompactCount } from '@/lib/onboarding/tool-artifact-format';
import { cn } from '@/lib/utils';

function formatFollowers(count: number | null | undefined): string | null {
  const compact = formatCompactCount(count);
  return compact ? `${compact} followers` : null;
}

function ArtistAvatar({
  imageUrl,
  name,
  size = 'md',
}: {
  readonly imageUrl?: string | null;
  readonly name: string;
  readonly size?: 'sm' | 'md';
}) {
  const dimension = size === 'sm' ? 32 : 42;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();

  if (imageUrl) {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-full border border-subtle bg-surface-0',
          size === 'sm' ? 'h-8 w-8' : 'h-11 w-11'
        )}
      >
        <Image
          src={imageUrl}
          alt=''
          width={dimension}
          height={dimension}
          className='h-full w-full object-cover'
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-2xs font-semibold text-secondary-token',
        size === 'sm' ? 'h-8 w-8' : 'h-11 w-11'
      )}
      aria-hidden
    >
      {initials || <AtSign className='h-4 w-4' />}
    </div>
  );
}

export function OnboardingArtistProposal({
  artist,
  disabled,
  onConfirm,
  onNotMe,
}: {
  readonly artist: SpotifyArtistResult | null;
  readonly disabled: boolean;
  readonly onConfirm: (artist: SpotifyArtistResult) => void;
  readonly onNotMe: () => void;
}) {
  const followers = artist
    ? formatFollowers(
        getDisplaySpotifyFollowers(
          normalizeArtistMetrics(
            { followers: artist.followers },
            { source: 'spotify_search' }
          )
        )
      )
    : null;

  return (
    <div
      className='min-h-44 w-full max-w-md py-1'
      data-testid='onboarding-artist-picker'
      data-mode='proposal'
    >
      <p className='text-sm font-semibold leading-5 tracking-tight text-primary-token'>
        Is This You?
      </p>
      {artist ? (
        <div
          className='mt-3 flex items-center gap-3'
          data-testid='onboarding-artist-proposal'
        >
          <ArtistAvatar imageUrl={artist.imageUrl} name={artist.name} />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium leading-5 text-primary-token'>
              {artist.name}
            </span>
            {followers ? (
              <span className='block truncate text-xs leading-5 tabular-nums text-secondary-token'>
                {followers}
              </span>
            ) : null}
          </span>
        </div>
      ) : (
        <div
          className='mt-3 flex h-10 items-center gap-2 text-xs text-secondary-token'
          role='status'
        >
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
          Searching Spotify
        </div>
      )}
      <div className='mt-3 flex items-center gap-2'>
        <Button
          type='button'
          data-testid='onboarding-artist-confirm'
          disabled={disabled || !artist}
          onClick={() => {
            if (artist) onConfirm(artist);
          }}
        >
          That&apos;s Me
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-testid='onboarding-artist-not-me'
          disabled={disabled}
          onClick={onNotMe}
        >
          Not Me
        </Button>
      </div>
    </div>
  );
}

export function ArtistResultRow({
  artist,
  query,
  disabled,
  selected,
  onSelect,
}: {
  readonly artist: SpotifyArtistResult;
  readonly query: string;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  // Followers + exact-name cue; never Spotify's opaque "popularity" score
  // (2026-10-31 golden-path walk + JOV-7823 wrong-match guard).
  const meta = formatArtistPickerDifferentiator(artist, query);

  return (
    <Button
      type='button'
      onClick={onSelect}
      disabled={disabled}
      variant={selected ? 'secondary' : 'ghost'}
      className='w-full justify-start'
    >
      <span className='mr-3 flex'>
        <ArtistAvatar imageUrl={artist.imageUrl} name={artist.name} size='sm' />
      </span>
      <span className='mr-3 min-w-0 flex-1 text-left'>
        <span className='block truncate text-app font-medium leading-5 text-primary-token'>
          {artist.name}
        </span>
        {meta ? (
          <span className='block truncate text-xs leading-5 text-tertiary-token'>
            {meta}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          'inline-flex h-7 shrink-0 items-center rounded-full border px-2 text-2xs font-medium',
          selected
            ? 'border-success text-success'
            : 'border-subtle text-secondary-token'
        )}
      >
        {selected ? 'Selected' : 'Use'}
      </span>
    </Button>
  );
}
