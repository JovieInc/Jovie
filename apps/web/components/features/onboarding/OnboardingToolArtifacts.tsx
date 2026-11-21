'use client';
// @coverage-via apps/web/tests/unit/onboarding/OnboardingToolArtifacts.test.tsx

import { Button } from '@jovie/ui';
import {
  AlertCircle,
  AtSign,
  Check,
  Link2,
  Loader2,
  Search,
} from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ATTACH_ACCOUNT_CTA_LABEL,
  HANDLE_ACCEPT_COPY,
  NONE_OF_THESE_CTA_LABEL,
} from '@/lib/chat/onboarding-script/widget-events';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import {
  assessArtistPickerMatch,
  formatArtistPickerDifferentiator,
} from '@/lib/onboarding/artist-picker-match';
import {
  type CanonicalArtistMetrics,
  getDisplaySpotifyFollowers,
  normalizeArtistMetrics,
} from '@/lib/onboarding/canonical-metrics';
import {
  SUGGESTED_AVAILABLE_HANDLE_LABEL,
  toHandleAvailabilityResult,
} from '@/lib/onboarding/handle-availability';
import { parseSocialLinkInput } from '@/lib/onboarding/social-link-parse';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { useHandleAvailabilityQuery } from '@/lib/queries/useHandleAvailabilityQuery';
import { cn } from '@/lib/utils';
import { OnboardingToolField } from './OnboardingToolField';

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'output-denied'
  | 'approval-requested'
  | 'approval-responded'
  | (string & {})
  | undefined;

interface ToolArtifactProps {
  readonly state?: ToolState;
}

export interface ArtistPickerOutput {
  readonly action?: 'open_artist_picker';
  readonly query?: string | null;
}

export interface ArtistConfirmedOutput {
  readonly action?: 'spotify_artist_confirmed';
  readonly spotifyArtistId?: string;
  readonly metrics?: CanonicalArtistMetrics | null;
  readonly artist?: {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly imageUrl?: string | null;
    readonly followers?: number | null;
    readonly metrics?: CanonicalArtistMetrics | null;
    readonly popularity?: number | null;
    readonly genres?: readonly string[];
    readonly dspMatches?: readonly OnboardingDspMatch[];
  } | null;
}

export interface HandleCheckOutput {
  readonly action?: 'check_handle' | 'handle_confirmed';
  readonly handle?: string;
}

export interface SocialLinkOutput {
  readonly action?: 'propose_social_link' | 'social_attached';
  readonly url?: string | null;
}

export interface OnboardingArtistSelection {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl?: string;
  readonly followers?: number;
  readonly metrics?: CanonicalArtistMetrics;
  readonly popularity?: number;
}

export interface OnboardingDspMatch {
  readonly id: string;
  readonly label: string;
  readonly platform: string;
  readonly url?: string | null;
}

function isRunning(state: ToolState): boolean {
  return state === 'input-streaming' || state === 'input-available';
}

function isFailed(state: ToolState): boolean {
  return state === 'output-error' || state === 'output-denied';
}

import {
  formatCompactCount,
  formatExactCount,
  formatGenreLabel,
  getSafeSpotifyArtistUrl,
  hostnameFor,
} from '@/lib/onboarding/tool-artifact-format';

export {
  formatCompactCount,
  formatExactCount,
  formatGenreLabel,
  getSafeSpotifyArtistUrl,
  hostnameFor,
};

function selectionFromSpotifyResult(
  artist: SpotifyArtistResult
): OnboardingArtistSelection {
  const metrics = normalizeArtistMetrics(
    { followers: artist.followers },
    { source: 'spotify_search' }
  );
  return {
    id: artist.id,
    name: artist.name,
    url: artist.url,
    imageUrl: artist.imageUrl ?? undefined,
    followers: getDisplaySpotifyFollowers(metrics) ?? undefined,
    metrics,
    popularity: artist.popularity ?? undefined,
  };
}

function getArtistSearchFailureCopy(error: string | null): {
  title: string;
  body: string;
} {
  const normalizedError = error?.toLowerCase() ?? '';

  if (normalizedError.includes('too many')) {
    return {
      title: 'Too many Spotify searches',
      body: 'Give it a moment, then try again.',
    };
  }

  if (
    normalizedError.includes('unavailable') ||
    normalizedError.includes('temporary') ||
    normalizedError.includes('server')
  ) {
    return {
      title: 'Spotify search is having trouble',
      body: 'Try again, or paste the Spotify artist link in chat.',
    };
  }

  return {
    title: 'Spotify search did not finish',
    body: 'Check the artist name and try again.',
  };
}

function StatusShell({
  icon,
  title,
  body,
  tone = 'neutral',
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body?: string;
  readonly tone?: 'neutral' | 'success' | 'error';
}) {
  return (
    <div
      className={cn(
        'w-full max-w-110 px-1 py-2 text-primary-token',
        tone === 'error' && 'text-error'
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div className='flex items-start gap-3'>
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-secondary-token',
            tone === 'error' && 'text-error',
            tone === 'success' && 'text-green-500'
          )}
        >
          {icon}
        </span>
        <div className='min-w-0'>
          <p className='text-sm font-semibold leading-5 tracking-[-0.01em]'>
            {title}
          </p>
          {body ? (
            <p className='mt-1 text-xs leading-5 text-secondary-token'>
              {body}
            </p>
          ) : null}
        </div>
      </div>
    </div>
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
      className='min-h-42 w-full max-w-110 px-1 py-1'
      data-testid='onboarding-artist-picker'
      data-mode='disambiguate'
      data-match-reason={forceDisambiguate ? matchAssessment.reason : undefined}
    >
      <div className='min-w-0 px-0.5'>
        <p className='text-sm font-semibold leading-5 tracking-[-0.01em] text-primary-token'>
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
        <input
          id={fieldId}
          value={query}
          onChange={event => {
            // Typing is browsing: the proposal swap is for the agent's
            // prefilled query only, never for keystrokes in this field.
            setBrowsing(true);
            setQuery(event.target.value);
          }}
          placeholder='Search Spotify artists'
          className='min-w-0 flex-1 bg-transparent text-sm leading-6 text-primary-token placeholder:text-quaternary-token focus:outline-none'
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
            className='flex h-auto w-full items-center justify-center rounded-lg px-2.5 py-2 text-xs font-medium text-secondary-token hover:bg-white/[0.045] hover:text-primary-token'
            data-testid='onboarding-artist-none-of-these'
          >
            {NONE_OF_THESE_CTA_LABEL}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

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
          'relative shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-surface-0',
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
      className='min-h-42 w-full max-w-110 py-1'
      data-testid='onboarding-artist-picker'
      data-mode='proposal'
    >
      <p className='text-sm font-semibold leading-5 tracking-[-0.01em] text-primary-token'>
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
          className='mt-3 flex h-10.5 items-center gap-2 text-xs text-secondary-token'
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
    <button
      type='button'
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-fast',
        selected
          ? 'bg-white/[0.07]'
          : 'hover:bg-white/[0.045] focus-visible:bg-white/[0.06]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
        disabled && !selected && 'opacity-60'
      )}
    >
      <ArtistAvatar imageUrl={artist.imageUrl} name={artist.name} size='sm' />
      <span className='min-w-0 flex-1'>
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
            ? 'border-green-500/20 text-green-500'
            : 'border-subtle text-secondary-token'
        )}
      >
        {selected ? 'Selected' : 'Use'}
      </span>
    </button>
  );
}

export function OnboardingArtistConfirmedCard({
  state,
  output,
}: ToolArtifactProps & {
  readonly output?: ArtistConfirmedOutput | null;
}) {
  if (isFailed(state)) {
    return (
      <StatusShell
        icon={<AlertCircle className='h-3.5 w-3.5' />}
        title='Artist profile could not be loaded'
        body='Send the Spotify artist URL and I will keep going from there.'
        tone='error'
      />
    );
  }

  if (isRunning(state) && !output?.artist) {
    return (
      <StatusShell
        icon={
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        }
        title='Pulling the Spotify profile'
        body='I am checking the profile data before making the next call.'
      />
    );
  }

  return null;
}

export function OnboardingHandleCheckCard({
  onHandleCandidateChange,
  onConfirmHandle,
  state,
  output,
  disabled = false,
}: ToolArtifactProps & {
  readonly onHandleCandidateChange?: (handle: string | null) => void;
  readonly onConfirmHandle?: (handle: string) => void;
  readonly output?: HandleCheckOutput | null;
  readonly disabled?: boolean;
}) {
  const handle = output?.handle?.replace(/^@/, '').toLowerCase() ?? null;
  const fieldId = useId();
  const [draftHandle, setDraftHandle] = useState(handle ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const handleInputRef = useRef<HTMLInputElement>(null);
  // Change Handle moves focus into the field it just opened.
  useEffect(() => {
    if (editing) handleInputRef.current?.focus();
  }, [editing]);
  const outputConfirmed = output?.action === 'handle_confirmed';
  const normalizedDraft = draftHandle.replace(/^@/, '').trim().toLowerCase();
  const availabilityQuery = useHandleAvailabilityQuery({
    handle: normalizedDraft || null,
    enabled:
      Boolean(normalizedDraft) &&
      !isRunning(state) &&
      !isFailed(state) &&
      !outputConfirmed,
  });

  useEffect(() => {
    setDraftHandle(handle ?? '');
  }, [handle]);

  useEffect(() => {
    onHandleCandidateChange?.(normalizedDraft);
  }, [normalizedDraft, onHandleCandidateChange]);

  if (isFailed(state)) {
    return (
      <StatusShell
        icon={<AlertCircle className='h-3.5 w-3.5' />}
        title='Handle check failed'
        body='Send another handle and I will check it.'
        tone='error'
      />
    );
  }

  if (isRunning(state) || !handle) {
    return (
      <StatusShell
        icon={
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        }
        title='Checking the handle'
        body={handle ? `@${handle}` : undefined}
      />
    );
  }

  if (outputConfirmed) {
    return (
      <StatusShell
        icon={<Check className='h-3.5 w-3.5' />}
        title='Handle confirmed'
        body={`@${handle}`}
        tone='success'
      />
    );
  }

  const loading = availabilityQuery.isLoading || availabilityQuery.isFetching;
  const availability = toHandleAvailabilityResult({
    handle: normalizedDraft || handle || '',
    available: loading ? null : (availabilityQuery.data?.available ?? null),
    error: availabilityQuery.data?.error,
    suggestedAlternatives: availabilityQuery.data?.suggestedAlternatives,
    checking: loading,
  });
  const available =
    availability.reason === 'checking' || availability.reason === 'unknown'
      ? undefined
      : availability.available;
  const error = availability.error;
  const profilePath = `jov.ie/${normalizedDraft || handle}`;
  const canConfirm =
    Boolean(normalizedDraft) &&
    available === true &&
    !loading &&
    !disabled &&
    !confirmed;
  // Pen R6As7U: one line and one action. Editing stays reachable but
  // secondary, behind an explicit Change Handle.
  const showEditor = editing;
  const isTaken = available === false;
  const statusLabel =
    loading || available === undefined
      ? 'is being checked'
      : available
        ? 'is available'
        : 'is not available';
  const helper =
    error ??
    (available === false
      ? availability.suggestedAlternatives &&
        availability.suggestedAlternatives.length > 0
        ? `${SUGGESTED_AVAILABLE_HANDLE_LABEL}: @${availability.suggestedAlternatives[0]}`
        : 'Try a sharper variant.'
      : null);

  return (
    <div
      className={cn(
        'w-full max-w-110 py-1 text-primary-token',
        available === false && 'text-error'
      )}
      data-testid='onboarding-handle-check'
      data-editing={showEditor ? 'true' : 'false'}
      role={available === false ? 'alert' : 'status'}
    >
      <div
        className='flex items-center gap-1.5 text-sm leading-5 tracking-[-0.01em]'
        data-testid='onboarding-handle-status'
      >
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center text-secondary-token',
            available && 'text-green-500',
            available === false && 'text-error'
          )}
          aria-hidden
        >
          {loading ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
          ) : available ? (
            <Check className='h-3.5 w-3.5' />
          ) : (
            <AlertCircle className='h-3.5 w-3.5' />
          )}
        </span>
        <strong className='font-semibold text-primary-token'>
          {profilePath}
        </strong>
        <span className='text-secondary-token'>{statusLabel}</span>
      </div>
      {helper && !showEditor ? (
        <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
          {helper}
        </p>
      ) : null}
      {showEditor ? (
        <>
          <OnboardingToolField density='compact' htmlFor={fieldId}>
            <span className='text-app text-tertiary-token' aria-hidden>
              jov.ie/
            </span>
            <span className='sr-only'>Edit Proposed Handle</span>
            <input
              id={fieldId}
              aria-label='Edit Proposed Handle'
              value={draftHandle}
              onChange={event => setDraftHandle(event.target.value)}
              className='min-w-0 flex-1 bg-transparent px-0.5 text-app leading-5 text-primary-token placeholder:text-quaternary-token focus:outline-none'
              placeholder='Handle'
              inputMode='text'
              autoCapitalize='none'
              spellCheck={false}
              disabled={disabled || confirmed}
              ref={handleInputRef}
            />
          </OnboardingToolField>
          {helper ? (
            <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
              {helper}
            </p>
          ) : null}
        </>
      ) : null}
      {onConfirmHandle || !(showEditor || confirmed) ? (
        <div className='mt-3 flex items-center gap-2'>
          {isTaken || !onConfirmHandle ? null : (
            <Button
              type='button'
              data-testid='onboarding-confirm-handle'
              disabled={!canConfirm}
              onClick={() => {
                if (!canConfirm || !normalizedDraft) return;
                setConfirmed(true);
                onConfirmHandle(normalizedDraft);
              }}
              className={cn(
                'h-9 rounded-full px-3.5 text-app font-semibold',
                canConfirm
                  ? 'bg-white text-black hover:bg-white/90 dark:bg-white dark:text-black'
                  : 'cursor-not-allowed border border-subtle bg-surface-0 text-tertiary-token'
              )}
            >
              {confirmed ? 'Kept' : HANDLE_ACCEPT_COPY}
            </Button>
          )}
          {showEditor || confirmed ? null : (
            <Button
              type='button'
              variant={isTaken ? 'primary' : 'ghost'}
              size='sm'
              data-testid='onboarding-edit-handle'
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              Change Handle
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function OnboardingSocialLinkCard({
  state,
  output,
  onAttachAccount,
  disabled = false,
}: ToolArtifactProps & {
  readonly output?: SocialLinkOutput | null;
  readonly onAttachAccount?: (url: string) => void;
  readonly disabled?: boolean;
}) {
  const initialUrl = output?.url ?? '';
  const fieldId = useId();
  const [draftUrl, setDraftUrl] = useState(initialUrl);
  const [attached, setAttached] = useState(false);

  useEffect(() => {
    if (initialUrl) setDraftUrl(initialUrl);
  }, [initialUrl]);

  if (isFailed(state)) {
    return (
      <StatusShell
        icon={<AlertCircle className='h-3.5 w-3.5' />}
        title='Link could not be prepared'
        body='Send the full URL again and I will retry it.'
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
        title='Reading the link'
      />
    );
  }

  if (output?.action === 'social_attached') {
    return (
      <StatusShell
        icon={<Check className='h-3.5 w-3.5' />}
        title='Social account attached'
        body={hostnameFor(output.url ?? undefined) ?? undefined}
        tone='success'
      />
    );
  }

  const trimmed = draftUrl.trim();
  const parsed = parseSocialLinkInput(trimmed);
  const attachableUrl = parsed.ok ? parsed.url : null;
  const host = attachableUrl
    ? hostnameFor(attachableUrl)
    : hostnameFor(trimmed || undefined);
  const parseHint =
    !trimmed || parsed.ok
      ? null
      : parsed.reason === 'missing_account_path'
        ? 'Add the account path (e.g. instagram.com/yourname).'
        : 'Paste a full profile URL with the account path.';
  const canAttach =
    Boolean(attachableUrl) &&
    !disabled &&
    !attached &&
    Boolean(onAttachAccount);

  return (
    <div
      className='w-full max-w-110 px-1 py-2 text-primary-token'
      data-testid='onboarding-social-link'
      role='status'
    >
      <div className='flex items-start gap-3'>
        <span
          className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-secondary-token'
          aria-hidden
        >
          <Link2 className='h-3.5 w-3.5' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-semibold leading-5 tracking-[-0.01em] text-primary-token'>
            {attachableUrl
              ? 'Link ready to attach'
              : 'Attach a public social account'}
          </p>
          <OnboardingToolField density='compact' htmlFor={fieldId}>
            <span className='sr-only'>Social Profile URL</span>
            <input
              id={fieldId}
              aria-label='Social Profile URL'
              value={draftUrl}
              onChange={event => setDraftUrl(event.target.value)}
              className='min-w-0 flex-1 bg-transparent text-app leading-5 text-primary-token placeholder:text-quaternary-token focus:outline-none'
              placeholder='https://instagram.com/yourname'
              inputMode='url'
              autoCapitalize='none'
              spellCheck={false}
              disabled={disabled || attached}
            />
          </OnboardingToolField>
          <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
            {parseHint ??
              host ??
              'Paste the full profile URL, like instagram.com/yourname.'}
          </p>
          {onAttachAccount ? (
            <Button
              type='button'
              data-testid='onboarding-attach-account'
              disabled={!canAttach}
              onClick={() => {
                if (!canAttach || !attachableUrl) return;
                setAttached(true);
                onAttachAccount(attachableUrl);
              }}
              className={cn(
                'mt-3 h-9 rounded-full px-3.5 text-app font-semibold',
                canAttach
                  ? 'bg-white text-black hover:bg-white/90 dark:bg-white dark:text-black'
                  : 'cursor-not-allowed border border-subtle bg-surface-0 text-tertiary-token'
              )}
            >
              {attached ? 'Account Attached' : ATTACH_ACCOUNT_CTA_LABEL}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact confirmation text for an artist pick.
 * Prefer a short system-style label over a fake conversational user bubble.
 * Spotify id travels in message metadata; this string is display-only.
 */
export function useArtistSelectionMessage() {
  return useMemo(
    () => (artist: OnboardingArtistSelection) => `Selected: ${artist.name}`,
    []
  );
}
