'use client';

import { Button, HostDrawnInput } from '@jovie/ui';
import { AlertCircle, AtSign, Loader2, Search } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useState } from 'react';
import { NONE_OF_THESE_CTA_LABEL } from '@/lib/chat/onboarding-script/widget-events';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import {
  assessArtistPickerMatch,
  formatArtistPickerDifferentiator,
} from '@/lib/onboarding/artist-picker-match';
import {
  getDisplaySpotifyFollowers,
  normalizeArtistMetrics,
} from '@/lib/onboarding/canonical-metrics';
import { formatCompactCount } from '@/lib/onboarding/tool-artifact-format';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { cn } from '@/lib/utils';
import { OnboardingToolField } from './OnboardingToolField';
import { StatusShell } from './OnboardingToolStatusCards';
import {
  getArtistSearchFailureCopy,
  selectionFromSpotifyResult,
} from './onboardingToolArtifactHelpers';
import {
  type ArtistPickerOutput,
  isFailed,
  isRunning,
  type OnboardingArtistSelection,
  type ToolArtifactProps,
} from './onboardingToolArtifactTypes';

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

function OnboardingArtistProposal({
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
      className='min-h-40 w-full max-w-md py-1'
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

function ArtistResultRow({
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

export function OnboardingSpotifyArtistPickerCard({
  state,
  output,
  inputQuery,
  disabled = false,
  onSelectArtist,
  onNoneOfThese,
}: ToolArtifactProps & {
  readonly output?: ArtistPickerOutput | null;
  readonly inputQuery?: string | null;
  readonly disabled?: boolean;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
  readonly onNoneOfThese?: () => void;
}) {
  const initialQuery = output?.query ?? inputQuery ?? '';
  const fieldId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Pen R6As7U: the agent proposes its top match with one confirm; the full
  // list and search sit behind "Not Me". Low-confidence / lookalike tops skip
  // proposal and open the 3–5 candidate list (JOV-7823 / JOV-8051).
  const [browsing, setBrowsing] = useState(false);
  const [rejectedIds, setRejectedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const artistSearch = useArtistSearchQuery({
    debounceMs: 250,
    limit: 5,
    minQueryLength: 1,
  });
  const { search, searchImmediate, clear } = artistSearch;

  // Keep the field prefilled when the tool re-opens with a new query from chat.
  useEffect(() => {
    if (initialQuery && !query) {
      setQuery(initialQuery);
    }
  }, [initialQuery, query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      clear();
      return;
    }
    search(trimmed);
  }, [clear, query, search]);

  if (isFailed(state)) {
    return (
      <StatusShell
        icon={<AlertCircle className='h-3.5 w-3.5' />}
        title='Spotify search did not load'
        body='Type the artist name or Spotify URL in chat and I can keep going.'
        tone='error'
      />
    );
  }

  if (isRunning(state) && !output) {
    return (
      <StatusShell
        icon={
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        }
        title='Looking for the right Spotify artist'
        body={initialQuery ? `Searching "${initialQuery}".` : undefined}
      />
    );
  }

  if (selectedId !== null) return null;

  const results = artistSearch.results;
  const hasQuery = query.trim().length > 0;
  const isSearching =
    selectedId === null &&
    (artistSearch.state === 'loading' || artistSearch.isPending);
  const selectArtist = (artist: SpotifyArtistResult) => {
    setSelectedId(artist.id);
    onSelectArtist(selectionFromSpotifyResult(artist));
  };
  const matchAssessment = assessArtistPickerMatch({
    query,
    results,
    rejectedIds,
  });
  const proposal =
    matchAssessment.decision === 'propose' ? matchAssessment.proposal : null;
  const forceDisambiguate =
    !isSearching &&
    hasQuery &&
    !artistSearch.error &&
    results.length > 0 &&
    matchAssessment.decision === 'disambiguate';
  // Hold the proposal frame while the prefilled query resolves so the card
  // does not swap layouts under the reader. Never propose a weak / lookalike
  // top hit — that path mints a full draft too easily (live walk + Boardy).
  const proposing =
    !browsing &&
    !forceDisambiguate &&
    hasQuery &&
    !artistSearch.error &&
    (isSearching || proposal !== null);

  if (proposing) {
    return (
      <OnboardingArtistProposal
        artist={isSearching ? null : proposal}
        disabled={disabled}
        onConfirm={selectArtist}
        onNotMe={() => {
          if (proposal) {
            setRejectedIds(prev => new Set([...prev, proposal.id]));
          }
          setBrowsing(true);
        }}
      />
    );
  }

  return (
    <div
      className='min-h-40 w-full max-w-md px-1 py-1'
      data-testid='onboarding-artist-picker'
      data-mode='disambiguate'
      data-match-reason={forceDisambiguate ? matchAssessment.reason : undefined}
    >
      <div className='min-w-0 px-0.5'>
        <p className='text-sm font-semibold leading-5 tracking-tight text-primary-token'>
          Pick the exact Spotify artist
        </p>
        {forceDisambiguate ? (
          <p className='mt-1 text-xs leading-5 text-secondary-token'>
            Several close matches — use followers to tell them apart, or None of
            These.
          </p>
        ) : null}
      </div>

      <OnboardingToolField density='picker' htmlFor={fieldId}>
        <Search className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        <span className='sr-only'>Search Spotify artists</span>
        <HostDrawnInput
          id={fieldId}
          value={query}
          onChange={event => {
            // Typing is browsing: the proposal swap is for the agent's
            // prefilled query only, never for keystrokes in this field.
            setBrowsing(true);
            setQuery(event.target.value);
          }}
          placeholder='Search Spotify artists'
          className='min-w-0 flex-1'
          disabled={disabled}
        />
      </OnboardingToolField>

      <div className='mt-2 space-y-1'>
        {isSearching ? (
          <div className='flex items-center gap-2 px-2 py-3 text-xs text-secondary-token'>
            <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
            Searching Spotify
          </div>
        ) : null}

        {!isSearching && artistSearch.error ? (
          <div
            className='flex items-start gap-2 rounded-lg bg-surface-0 px-2.5 py-2.5 text-xs leading-5 text-secondary-token'
            role='alert'
          >
            <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-warning' />
            <span className='min-w-0 flex-1'>
              <span className='block font-medium text-primary-token'>
                {getArtistSearchFailureCopy(artistSearch.error).title}
              </span>
              <span className='mt-0.5 block'>
                {getArtistSearchFailureCopy(artistSearch.error).body}
              </span>
            </span>
            {hasQuery ? (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => searchImmediate(query.trim())}
                disabled={disabled}
                className='shrink-0'
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}

        {!isSearching && !artistSearch.error && results.length === 0 ? (
          <div className='px-2 py-3 text-xs leading-5 text-secondary-token'>
            {hasQuery
              ? 'No exact match yet. Try the artist name from Spotify.'
              : 'Start with the artist name as it appears on Spotify.'}
          </div>
        ) : null}

        {results.map(artist => (
          <ArtistResultRow
            key={artist.id}
            artist={artist}
            query={query}
            disabled={disabled || selectedId !== null}
            selected={selectedId === artist.id}
            onSelect={() => selectArtist(artist)}
          />
        ))}

        {!isSearching && results.length > 0 && onNoneOfThese ? (
          <Button
            type='button'
            variant='ghost'
            onClick={() => {
              if (disabled) return;
              onNoneOfThese();
            }}
            disabled={disabled || selectedId !== null}
            className='w-full'
            data-testid='onboarding-artist-none-of-these'
          >
            {NONE_OF_THESE_CTA_LABEL}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
