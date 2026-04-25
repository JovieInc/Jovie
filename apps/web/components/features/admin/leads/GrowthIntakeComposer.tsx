'use client';

import { Button, Input, SegmentControl, Textarea } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { parseBatchUrls } from '@/features/admin/batch-url-utils';
import { getNormalizedInputUrl } from '@/features/admin/ingest-profile-dropdown/useIngestProfile';
import {
  useArtistSearchQuery,
  useBatchIngestMutation,
  useIngestProfileMutation,
  useQueueLeadUrlsMutation,
} from '@/lib/queries';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import {
  INGEST_NETWORKS,
  type IngestNetworkId,
} from '../ingest-profile-dropdown/ingest-network-options';

type GrowthIntakeMode = 'single' | 'batch' | 'queue';

interface GrowthIntakeComposerProps {
  readonly initialMode?: GrowthIntakeMode;
}

interface BannerState {
  readonly tone: 'success' | 'error';
  readonly message: string;
}

interface ModeCallbacks {
  readonly onStart: () => void;
  readonly onComplete: (message: string) => void;
  readonly onError: (message: string) => void;
}

const MODE_OPTIONS = [
  { value: 'single', label: 'Single Profile' },
  { value: 'batch', label: 'Batch URLs' },
  { value: 'queue', label: 'Queue Leads' },
] as const;

function SingleModeForm({
  onStart,
  onComplete,
  onError,
}: Readonly<ModeCallbacks>) {
  const ingestProfileMutation = useIngestProfileMutation();
  const {
    results,
    search,
    clear,
    state: searchState,
  } = useArtistSearchQuery({
    minQueryLength: 2,
    limit: 6,
  });

  const [network, setNetwork] = useState<IngestNetworkId>('instagram');
  const [inputValue, setInputValue] = useState('');
  const normalizedUrl = getNormalizedInputUrl(network, inputValue);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStart();

    const trimmed = inputValue.trim();
    const isSpotifySearch =
      network === 'spotify' &&
      !trimmed.startsWith('http') &&
      !/^[a-zA-Z0-9]{22}$/.test(trimmed);

    if (isSpotifySearch && searchState !== 'success') {
      onError('Wait for Spotify search results before creating the profile.');
      return;
    }

    try {
      const url = isSpotifySearch
        ? getNormalizedInputUrl('spotify', results[0]?.url ?? '')
        : normalizedUrl;

      if (!url) {
        throw new Error(
          network === 'spotify'
            ? 'Select a Spotify artist or paste a Spotify artist URL.'
            : 'Enter a profile URL or handle.'
        );
      }

      const result = await ingestProfileMutation.mutateAsync({ url });
      const username = result.profile?.username;

      setInputValue('');
      clear();
      onComplete(
        username
          ? `Created creator profile @${username}.`
          : 'Created creator profile.'
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Failed to ingest profile.'
      );
    }
  }

  return (
    <form className='space-y-3' onSubmit={handleSubmit}>
      <SegmentControl
        value={network}
        onValueChange={value => setNetwork(value as IngestNetworkId)}
        options={INGEST_NETWORKS.map(option => ({
          value: option.id,
          label: option.label,
        }))}
        size='sm'
        aria-label='Select single profile network'
      />
      <Input
        type='text'
        inputSize='sm'
        value={inputValue}
        onChange={event => {
          const value = event.target.value;
          setInputValue(value);

          if (network !== 'spotify') {
            clear();
            return;
          }

          if (value.trim().startsWith('http')) {
            clear();
            return;
          }

          search(value);
        }}
        placeholder={
          INGEST_NETWORKS.find(option => option.id === network)?.placeholder ??
          'Paste profile URL'
        }
        disabled={ingestProfileMutation.isPending}
        autoComplete='off'
        className='text-xs'
        aria-label='Single profile input'
      />
      {network === 'spotify' && results.length > 0 ? (
        <div className='max-h-44 overflow-auto rounded-md border border-subtle bg-background-elevated p-1'>
          {results.map(artist => (
            <button
              key={artist.id}
              type='button'
              className='flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent/15'
              onClick={() => setInputValue(artist.url)}
            >
              <span>{artist.name}</span>
              <span className='text-tertiary-token'>Use</span>
            </button>
          ))}
        </div>
      ) : (
        <p className='text-xs text-tertiary-token'>
          Paste a URL or handle and it will be normalized before import.
        </p>
      )}
      <div className='flex justify-end'>
        <Button
          type='submit'
          size='sm'
          disabled={
            ingestProfileMutation.isPending || inputValue.trim().length === 0
          }
        >
          {ingestProfileMutation.isPending ? 'Creating…' : 'Create Profile'}
        </Button>
      </div>
    </form>
  );
}

function BatchModeForm({
  onStart,
  onComplete,
  onError,
}: Readonly<ModeCallbacks>) {
  const batchMutation = useBatchIngestMutation();
  const [inputValue, setInputValue] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const parsedUrls = parseBatchUrls(inputValue);

  async function handleSubmit() {
    onStart();

    if (parsedUrls.length === 0) {
      onError('Paste at least one valid URL to run a batch import.');
      return;
    }

    try {
      const result = await batchMutation.mutateAsync({ urls: parsedUrls });
      setInputValue('');
      setSummary(
        `${result.summary.success} created, ${result.summary.skipped} skipped, ${result.summary.error} errors.`
      );
      onComplete(
        `Batch complete: ${result.summary.success} created, ${result.summary.skipped} skipped, ${result.summary.error} errors.`
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Batch ingest failed.');
    }
  }

  return (
    <div className='space-y-3'>
      <Textarea
        rows={5}
        value={inputValue}
        onChange={event => setInputValue(event.target.value)}
        placeholder='https://linktr.ee/artist
https://open.spotify.com/artist/...
https://instagram.com/artist'
        className='text-xs'
        aria-label='Batch URLs input'
      />
      <div className='flex items-center justify-between gap-3 text-2xs text-tertiary-token'>
        <span>
          {parsedUrls.length} URL{parsedUrls.length === 1 ? '' : 's'} parsed
        </span>
        <Button
          type='button'
          size='sm'
          onClick={() => {
            void handleSubmit();
          }}
          disabled={batchMutation.isPending || parsedUrls.length === 0}
        >
          {batchMutation.isPending ? 'Importing…' : 'Run Batch Import'}
        </Button>
      </div>
      {summary ? (
        <p className='rounded-[10px] border border-subtle bg-surface-0 px-3 py-2 text-xs text-secondary-token'>
          {summary}
        </p>
      ) : null}
    </div>
  );
}

function QueueModeForm({
  onStart,
  onComplete,
  onError,
}: Readonly<ModeCallbacks>) {
  const queueLeadUrlsMutation = useQueueLeadUrlsMutation();
  const [inputValue, setInputValue] = useState('');
  const [summary, setSummary] = useState<string | null>(null);

  const queuedUrls = inputValue
    .split('\n')
    .map(url => url.trim())
    .filter(Boolean)
    .map(url => normalizeUrl(url));

  async function handleSubmit() {
    onStart();

    if (queuedUrls.length === 0) {
      onError('Paste at least one URL to start the lead queue.');
      return;
    }

    try {
      const result = await queueLeadUrlsMutation.mutateAsync(queuedUrls);
      setInputValue('');
      setSummary(
        `Created ${result.summary.created}, skipped ${result.summary.duplicate} duplicates, rejected ${result.summary.invalid} invalid URLs.`
      );
      onComplete(
        `Queued ${result.summary.created} URL${result.summary.created === 1 ? '' : 's'} for lead intake.`
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Lead queue submission failed.'
      );
    }
  }

  return (
    <div className='space-y-3'>
      <Textarea
        rows={5}
        value={inputValue}
        onChange={event => setInputValue(event.target.value)}
        placeholder='https://linktr.ee/artist
https://open.spotify.com/artist/...
https://instagram.com/artist'
        className='text-xs'
        aria-label='Queue URLs input'
      />
      <div className='flex items-center justify-between gap-3 text-2xs text-tertiary-token'>
        <span>
          {queuedUrls.length} URL{queuedUrls.length === 1 ? '' : 's'} ready for
          intake
        </span>
        <Button
          type='button'
          size='sm'
          onClick={() => {
            void handleSubmit();
          }}
          disabled={queueLeadUrlsMutation.isPending || queuedUrls.length === 0}
        >
          {queueLeadUrlsMutation.isPending ? 'Queueing…' : 'Queue Lead URLs'}
        </Button>
      </div>
      {summary ? (
        <p className='rounded-[10px] border border-subtle bg-surface-0 px-3 py-2 text-xs text-secondary-token'>
          {summary}
        </p>
      ) : null}
    </div>
  );
}

export function GrowthIntakeComposer({
  initialMode = 'single',
}: GrowthIntakeComposerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<GrowthIntakeMode>(initialMode);
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  function clearBanner() {
    setBanner(null);
  }

  function handleComplete(message: string) {
    setBanner({ tone: 'success', message });
    router.refresh();
  }

  function handleError(message: string) {
    setBanner({ tone: 'error', message });
  }

  return (
    <div className='space-y-3' data-testid='admin-growth-view-ingest'>
      <div className='space-y-1'>
        <h3 className='text-app font-medium text-primary-token'>
          Unified Intake
        </h3>
        <p className='text-xs text-secondary-token'>
          Add one profile, run a batch import, or feed fresh lead URLs from the
          same control.
        </p>
      </div>

      <SegmentControl
        value={mode}
        onValueChange={value => {
          clearBanner();
          setMode(value as GrowthIntakeMode);
        }}
        options={MODE_OPTIONS.map(option => ({
          value: option.value,
          label: option.label,
        }))}
        size='sm'
        aria-label='Select intake mode'
      />

      {banner ? (
        <div
          className={
            banner.tone === 'success'
              ? 'rounded-[10px] border border-success/20 bg-success/10 px-3 py-2 text-xs text-success'
              : 'rounded-[10px] border border-error/20 bg-error/10 px-3 py-2 text-xs text-error'
          }
        >
          {banner.message}
        </div>
      ) : null}

      {mode === 'single' ? (
        <SingleModeForm
          onStart={clearBanner}
          onComplete={handleComplete}
          onError={handleError}
        />
      ) : null}

      {mode === 'batch' ? (
        <BatchModeForm
          onStart={clearBanner}
          onComplete={handleComplete}
          onError={handleError}
        />
      ) : null}

      {mode === 'queue' ? (
        <QueueModeForm
          onStart={clearBanner}
          onComplete={handleComplete}
          onError={handleError}
        />
      ) : null}
    </div>
  );
}
