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

const MODE_OPTIONS = [
  { value: 'single', label: 'Single Profile' },
  { value: 'batch', label: 'Batch URLs' },
  { value: 'queue', label: 'Queue Leads' },
] as const;

export function GrowthIntakeComposer({
  initialMode = 'single',
}: Readonly<GrowthIntakeComposerProps>) {
  const router = useRouter();
  const artistSearch = useArtistSearchQuery({ minQueryLength: 2, limit: 6 });
  const ingestProfileMutation = useIngestProfileMutation();
  const batchMutation = useBatchIngestMutation();
  const queueLeadUrlsMutation = useQueueLeadUrlsMutation();

  const [mode, setMode] = useState<GrowthIntakeMode>(initialMode);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const [singleNetwork, setSingleNetwork] =
    useState<IngestNetworkId>('instagram');
  const [singleInput, setSingleInput] = useState('');

  const [batchInput, setBatchInput] = useState('');
  const [batchSummary, setBatchSummary] = useState<string | null>(null);

  const [queueInput, setQueueInput] = useState('');
  const [queueSummary, setQueueSummary] = useState<string | null>(null);

  const normalizedSingleUrl = getNormalizedInputUrl(singleNetwork, singleInput);
  const parsedBatchUrls = parseBatchUrls(batchInput);
  const queuedUrls = queueInput
    .split('\n')
    .map(url => normalizeUrl(url.trim()))
    .filter(Boolean);

  useEffect(() => {
    if (singleNetwork !== 'spotify') {
      artistSearch.clear();
      return;
    }

    if (singleInput.trim().startsWith('http')) {
      artistSearch.clear();
      return;
    }

    artistSearch.search(singleInput);
  }, [artistSearch, singleInput, singleNetwork]);

  async function complete(message: string) {
    setBanner({ tone: 'success', message });
    router.refresh();
  }

  async function submitSingle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const trimmed = singleInput.trim();
    const isSpotifySearch =
      singleNetwork === 'spotify' &&
      !trimmed.startsWith('http') &&
      !/^[a-zA-Z0-9]{22}$/.test(trimmed);

    try {
      const url = isSpotifySearch
        ? getNormalizedInputUrl('spotify', artistSearch.results[0]?.url ?? '')
        : normalizedSingleUrl;

      if (!url) {
        throw new Error(
          singleNetwork === 'spotify'
            ? 'Select a Spotify artist or paste a Spotify artist URL.'
            : 'Enter a profile URL or handle.'
        );
      }

      const result = await ingestProfileMutation.mutateAsync({ url });
      const username = result.profile?.username;

      setSingleInput('');
      artistSearch.clear();

      await complete(
        username
          ? `Created creator profile @${username}.`
          : 'Created creator profile.'
      );
    } catch (error) {
      setBanner({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to ingest profile.',
      });
    }
  }

  async function submitBatch() {
    setBanner(null);

    if (parsedBatchUrls.length === 0) {
      setBanner({
        tone: 'error',
        message: 'Paste at least one valid URL to run a batch import.',
      });
      return;
    }

    try {
      const result = await batchMutation.mutateAsync({ urls: parsedBatchUrls });
      setBatchInput('');
      setBatchSummary(
        `${result.summary.success} created, ${result.summary.skipped} skipped, ${result.summary.error} errors.`
      );
      await complete(
        `Batch complete: ${result.summary.success} created, ${result.summary.skipped} skipped, ${result.summary.error} errors.`
      );
    } catch (error) {
      setBanner({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Batch ingest failed.',
      });
    }
  }

  async function submitQueue() {
    setBanner(null);

    if (queuedUrls.length === 0) {
      setBanner({
        tone: 'error',
        message: 'Paste at least one URL to start the lead queue.',
      });
      return;
    }

    try {
      const result = await queueLeadUrlsMutation.mutateAsync(queuedUrls);
      setQueueInput('');
      setQueueSummary(
        `Created ${result.summary.created}, skipped ${result.summary.duplicate} duplicates, rejected ${result.summary.invalid} invalid URLs.`
      );
      await complete(
        `Queued ${result.summary.created} URL${result.summary.created === 1 ? '' : 's'} for lead intake.`
      );
    } catch (error) {
      setBanner({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Lead queue submission failed.',
      });
    }
  }

  const isBusy =
    ingestProfileMutation.isPending ||
    batchMutation.isPending ||
    queueLeadUrlsMutation.isPending;

  return (
    <div className='space-y-3' data-testid='admin-growth-view-ingest'>
      <div className='space-y-1'>
        <h3 className='text-[13px] font-[510] text-primary-token'>
          Unified Intake
        </h3>
        <p className='text-xs text-secondary-token'>
          Add one profile, run a batch import, or feed fresh lead URLs from the
          same control.
        </p>
      </div>

      <SegmentControl
        value={mode}
        onValueChange={value => setMode(value as GrowthIntakeMode)}
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
        <form className='space-y-3' onSubmit={submitSingle}>
          <SegmentControl
            value={singleNetwork}
            onValueChange={value => setSingleNetwork(value as IngestNetworkId)}
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
            value={singleInput}
            onChange={event => setSingleInput(event.target.value)}
            placeholder={
              INGEST_NETWORKS.find(option => option.id === singleNetwork)
                ?.placeholder ?? 'Paste profile URL'
            }
            disabled={isBusy}
            autoComplete='off'
            className='text-xs'
          />
          {singleNetwork === 'spotify' && artistSearch.results.length > 0 ? (
            <div className='max-h-44 overflow-auto rounded-md border border-subtle bg-background-elevated p-1'>
              {artistSearch.results.map(artist => (
                <button
                  key={artist.id}
                  type='button'
                  className='flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent/15'
                  onClick={() => setSingleInput(artist.url)}
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
              disabled={isBusy || singleInput.trim().length === 0}
            >
              {ingestProfileMutation.isPending ? 'Creating…' : 'Create Profile'}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === 'batch' ? (
        <div className='space-y-3'>
          <Textarea
            rows={5}
            value={batchInput}
            onChange={event => setBatchInput(event.target.value)}
            placeholder='https://linktr.ee/artist
https://open.spotify.com/artist/...
https://instagram.com/artist'
            className='text-xs'
          />
          <div className='flex items-center justify-between gap-3 text-[11px] text-tertiary-token'>
            <span>
              {parsedBatchUrls.length} URL
              {parsedBatchUrls.length === 1 ? '' : 's'} parsed
            </span>
            <Button
              type='button'
              size='sm'
              onClick={() => {
                void submitBatch();
              }}
              disabled={isBusy || parsedBatchUrls.length === 0}
            >
              {batchMutation.isPending ? 'Importing…' : 'Run Batch Import'}
            </Button>
          </div>
          {batchSummary ? (
            <p className='rounded-[10px] border border-subtle bg-surface-0 px-3 py-2 text-xs text-secondary-token'>
              {batchSummary}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === 'queue' ? (
        <div className='space-y-3'>
          <Textarea
            rows={5}
            value={queueInput}
            onChange={event => setQueueInput(event.target.value)}
            placeholder='https://linktr.ee/artist
https://open.spotify.com/artist/...
https://instagram.com/artist'
            className='text-xs'
          />
          <div className='flex items-center justify-between gap-3 text-[11px] text-tertiary-token'>
            <span>
              {queuedUrls.length} URL{queuedUrls.length === 1 ? '' : 's'} ready
              for intake
            </span>
            <Button
              type='button'
              size='sm'
              onClick={() => {
                void submitQueue();
              }}
              disabled={isBusy || queuedUrls.length === 0}
            >
              {queueLeadUrlsMutation.isPending
                ? 'Queueing…'
                : 'Queue Lead URLs'}
            </Button>
          </div>
          {queueSummary ? (
            <p className='rounded-[10px] border border-subtle bg-surface-0 px-3 py-2 text-xs text-secondary-token'>
              {queueSummary}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
