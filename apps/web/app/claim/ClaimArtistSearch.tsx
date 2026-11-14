'use client';

import { Button, buttonVariants, Input } from '@jovie/ui';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { Avatar } from '@/components/molecules/Avatar/Avatar';
import { APP_ROUTES } from '@/constants/routes';
import type { SpotifyArtistResult } from '@/lib/contracts/api';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 6;

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

function claimStartHref(spotifyId: string): string {
  return `${APP_ROUTES.CLAIM_START}?spotify=${encodeURIComponent(spotifyId)}`;
}

function formatFollowers(followers: number | undefined): string | null {
  if (!followers) return null;
  return `${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(followers)} followers`;
}

interface ArtistRowProps {
  readonly artist: SpotifyArtistResult;
}

function ArtistRow({ artist }: ArtistRowProps) {
  const followers = formatFollowers(artist.followers);
  const owned = artist.isClaimedByCurrentUser === true;
  const takenByOther = artist.isClaimed === true && !owned;

  let trailing: ReactNode;
  if (owned) {
    trailing = (
      <span className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        Open
      </span>
    );
  } else if (takenByOther) {
    trailing = (
      <span className='text-xs font-medium text-tertiary-token'>Claimed</span>
    );
  } else {
    trailing = (
      <span
        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        data-testid='claim-artist-option-cta'
      >
        Claim
      </span>
    );
  }

  const content = (
    <>
      <Avatar
        src={artist.imageUrl ?? null}
        alt={artist.name}
        name={artist.name}
        size='md'
      />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-app font-medium text-primary-token'>
          {artist.name}
        </span>
        {owned ? (
          <span className='block text-xs text-tertiary-token'>
            Your profile
          </span>
        ) : followers ? (
          <span className='block text-xs tabular-nums text-tertiary-token'>
            {followers}
          </span>
        ) : null}
      </span>
      {trailing}
    </>
  );

  const rowClassName =
    'flex min-h-11 items-center gap-3 rounded-xl border border-subtle bg-surface-1 px-3 py-2';

  if (takenByOther) {
    return (
      <li>
        <div
          className={`${rowClassName} opacity-60`}
          aria-disabled='true'
          data-testid='claim-artist-claimed'
        >
          {content}
        </div>
      </li>
    );
  }

  // The whole row is the link; the trailing pill only shows the action.
  return (
    <li>
      <Link
        href={owned ? APP_ROUTES.DASHBOARD : claimStartHref(artist.id)}
        prefetch={false}
        className={`${rowClassName} focus-ring-themed hover:bg-surface-2`}
        data-testid={owned ? 'claim-artist-owned' : 'claim-artist-option'}
      >
        {content}
      </Link>
    </li>
  );
}

/** Spotify artist search → `/claim/start`, which decides the next step. */
export function ClaimArtistSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyArtistResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      setStatus('loading');
      fetch(
        `/api/spotify/search?q=${encodeURIComponent(trimmed)}&limit=${SEARCH_LIMIT}`,
        { signal: controller.signal, cache: 'no-store' }
      )
        .then(async response => {
          if (!response.ok) throw new Error(`search ${response.status}`);
          setResults((await response.json()) as SpotifyArtistResult[]);
          setStatus('done');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setStatus('error');
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      globalThis.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <label
          htmlFor='claim-artist-search'
          className='block text-xs font-medium text-secondary-token'
        >
          Find your artist on Spotify
        </label>
        <Input
          id='claim-artist-search'
          type='search'
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder='Artist name'
          autoComplete='off'
          data-testid='claim-artist-search'
        />
      </div>

      <div
        aria-live='polite'
        aria-busy={status === 'loading'}
        className='min-h-6'
      >
        {/* With results on screen, a new search dims them in place instead of
            adding a line above them, so the rows and the button never jump. */}
        {status === 'loading' && results.length === 0 ? (
          <p className='text-xs text-tertiary-token'>Searching…</p>
        ) : null}
        {status === 'error' ? (
          <p className='text-xs text-secondary-token'>
            Search is unavailable. Try again, or create your profile below.
          </p>
        ) : null}
        {status === 'done' && results.length === 0 ? (
          <p className='text-xs text-secondary-token'>
            No artists found. You can create your profile below.
          </p>
        ) : null}
        {results.length > 0 ? (
          <ul
            className={`space-y-2 transition-opacity duration-subtle ${status === 'loading' ? 'opacity-60' : ''}`}
            data-testid='claim-artist-results'
          >
            {results.map(artist => (
              <ArtistRow key={artist.id} artist={artist} />
            ))}
          </ul>
        ) : null}
      </div>

      <Button asChild variant='secondary' size='lg' className='w-full'>
        <Link
          href={`${APP_ROUTES.CLAIM_START}?new=1`}
          prefetch={false}
          data-testid='claim-create-profile'
        >
          Not on Spotify? Create your profile
        </Link>
      </Button>
    </div>
  );
}
