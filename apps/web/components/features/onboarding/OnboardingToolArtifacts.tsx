'use client';

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
import { useEffect, useMemo, useState } from 'react';
import {
  ATTACH_ACCOUNT_CTA_LABEL,
  CONFIRM_HANDLE_CTA_LABEL,
  NONE_OF_THESE_CTA_LABEL,
} from '@/lib/chat/onboarding-script/widget-events';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
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

export function formatCompactCount(
  count: number | null | undefined
): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString('en-US');
}

export function formatExactCount(
  count: number | null | undefined
): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return count.toLocaleString('en-US');
}

export function formatGenreLabel(genre: string): string {
  return genre
    .trim()
    .replaceAll(/\s+/g, ' ')
    .split(' ')
    .map(word =>
      word
        .split('-')
        .map(part =>
          part
            ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
            : part
        )
        .join('-')
    )
    .join(' ');
}

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

function formatFollowers(count: number | null | undefined): string | null {
  const compact = formatCompactCount(count);
  return compact ? `${compact} followers` : null;
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

function hostnameFor(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function getSafeSpotifyArtistUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'open.spotify.com') return null;
    if (!parsed.pathname.startsWith('/artist/')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
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
            tone === 'error' && 'text-red-400',
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
  const [query, setQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  return (
    <div
      className='h-42 w-full max-w-110 px-1 py-1'
      data-testid='onboarding-artist-picker'
    >
      <div className='min-w-0 px-0.5'>
        <p className='text-sm font-semibold leading-5 tracking-[-0.01em] text-primary-token'>
          Pick the exact Spotify artist
        </p>
      </div>

      <label className='mt-3 flex items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-3 py-2 focus-within:border-white/[0.16] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'>
        <Search className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        <span className='sr-only'>Search Spotify artists</span>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder='Search Spotify artists'
          className='min-w-0 flex-1 bg-transparent text-sm leading-6 text-primary-token placeholder:text-quaternary-token focus:outline-none'
          disabled={disabled}
        />
      </label>

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
              <button
                type='button'
                onClick={() => searchImmediate(query.trim())}
                disabled={disabled}
                className='mt-0.5 shrink-0 rounded-full border border-subtle px-2 py-0.5 text-2xs font-medium text-secondary-token transition-colors duration-fast hover:border-white/15 hover:text-primary-token focus-visible:outline-none disabled:opacity-50'
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!isSearching &&
        !artistSearch.error &&
        hasQuery &&
        results.length === 0 ? (
          <div className='px-2 py-3 text-xs leading-5 text-secondary-token'>
            No exact match yet. Try the artist name from Spotify.
          </div>
        ) : null}

        {!isSearching && !hasQuery ? (
          <div className='px-2 py-3 text-xs leading-5 text-secondary-token'>
            Start with the artist name fans see on Spotify.
          </div>
        ) : null}

        {results.map(artist => (
          <ArtistResultRow
            key={artist.id}
            artist={artist}
            disabled={disabled || selectedId !== null}
            selected={selectedId === artist.id}
            onSelect={() => {
              setSelectedId(artist.id);
              onSelectArtist(selectionFromSpotifyResult(artist));
            }}
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

function ArtistResultRow({
  artist,
  disabled,
  selected,
  onSelect,
}: {
  readonly artist: SpotifyArtistResult;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const metrics = normalizeArtistMetrics(
    { followers: artist.followers },
    { source: 'spotify_search' }
  );
  const followers = formatFollowers(getDisplaySpotifyFollowers(metrics));
  const meta = [
    followers,
    artist.popularity ? `Pop ${artist.popularity}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
  const [draftHandle, setDraftHandle] = useState(handle ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const normalizedDraft = draftHandle.replace(/^@/, '').trim().toLowerCase();
  const availabilityQuery = useHandleAvailabilityQuery({
    handle: normalizedDraft || null,
    enabled: Boolean(normalizedDraft) && !isRunning(state) && !isFailed(state),
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
  const profilePath = normalizedDraft ? `jov.ie/${normalizedDraft}` : null;
  const canConfirm =
    Boolean(normalizedDraft) &&
    available === true &&
    !loading &&
    !disabled &&
    !confirmed;

  return (
    <div
      className={cn(
        'w-full max-w-110 px-1 py-2 text-primary-token',
        available === false && 'text-error'
      )}
      data-testid='onboarding-handle-check'
      role={available === false ? 'alert' : 'status'}
    >
      <div className='flex items-start gap-3'>
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-secondary-token',
            available && 'text-green-500',
            available === false && 'text-red-400'
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
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm leading-5 tracking-[-0.01em]'>
            <strong className='font-semibold text-primary-token'>
              @{normalizedDraft || handle}
            </strong>
            <span className='text-secondary-token'>
              {loading || available === undefined
                ? 'is being checked'
                : available
                  ? 'is available'
                  : 'is not available'}
            </span>
          </div>
          <label className='mt-2 flex h-9 items-center rounded-lg border border-subtle bg-surface-0 px-2.5 focus-within:border-white/[0.16] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'>
            <span className='text-app text-tertiary-token' aria-hidden>
              @
            </span>
            <span className='sr-only'>Edit Proposed Handle</span>
            <input
              aria-label='Edit Proposed Handle'
              value={draftHandle}
              onChange={event => setDraftHandle(event.target.value)}
              className='min-w-0 flex-1 bg-transparent px-0.5 text-app leading-5 text-primary-token placeholder:text-quaternary-token focus:outline-none'
              placeholder='Handle'
              inputMode='text'
              autoCapitalize='none'
              spellCheck={false}
              disabled={disabled || confirmed}
            />
          </label>
          <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
            {error ??
              (available === false
                ? availability.suggestedAlternatives &&
                  availability.suggestedAlternatives.length > 0
                  ? `${SUGGESTED_AVAILABLE_HANDLE_LABEL}: @${availability.suggestedAlternatives[0]}`
                  : 'Try a sharper variant.'
                : (profilePath ?? 'Edit the handle before it is claimed.'))}
          </p>
          {onConfirmHandle ? (
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
                'mt-3 h-9 rounded-full px-3.5 text-app font-semibold',
                canConfirm
                  ? 'bg-white text-black hover:bg-white/90 dark:bg-white dark:text-black'
                  : 'cursor-not-allowed border border-subtle bg-surface-0 text-tertiary-token'
              )}
            >
              {confirmed ? 'Handle Confirmed' : CONFIRM_HANDLE_CTA_LABEL}
            </Button>
          ) : null}
        </div>
      </div>
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
          <label className='mt-2 flex h-9 items-center rounded-lg border border-subtle bg-surface-0 px-2.5 focus-within:border-white/[0.16] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'>
            <span className='sr-only'>Social Profile URL</span>
            <input
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
          </label>
          <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
            {parseHint ?? host ?? 'Paste the full URL fans already use.'}
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
