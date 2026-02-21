'use client';

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentControl,
} from '@jovie/ui';
import { useMemo, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { INGEST_NETWORKS } from './ingest-network-options';
import type { IngestProfileDropdownProps } from './types';
import { useIngestProfile } from './useIngestProfile';

export function IngestProfileDropdown({
  onIngestPending,
}: Readonly<IngestProfileDropdownProps>) {
  const {
    open,
    setOpen,
    network,
    setNetwork,
    inputValue,
    setInputValue,
    inputPlaceholder,
    isLoading,
    isSuccess,
    detectedPlatform,
    spotifyResults,
    spotifyState,
    spotifyError,
    selectSpotifyArtist,
    handleSubmit,
  } = useIngestProfile({ onIngestPending });
  const inputRef = useRef<HTMLInputElement>(null);

  const networkOptions = useMemo(
    () =>
      INGEST_NETWORKS.map(option => ({
        value: option.id,
        label: option.label,
      })),
    []
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' size='sm' variant='ghost'>
          <Icon name='Plus' className='h-3.5 w-3.5' />
          Ingest Profile
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-[420px] p-3'
        onOpenAutoFocus={e => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='space-y-1'>
            <div className='flex items-center gap-2'>
              <Icon
                name='UserPlus'
                className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                aria-hidden='true'
              />
              <span className='text-xs font-medium text-primary-token'>
                Ingest social profile
              </span>
            </div>
            <p className='text-[11px] text-tertiary-token'>
              Paste a URL or handle. We’ll normalize it and match the platform
              automatically.
            </p>
          </div>

          <SegmentControl
            value={network}
            onValueChange={value =>
              setNetwork(value as (typeof INGEST_NETWORKS)[number]['id'])
            }
            options={networkOptions}
            size='sm'
            aria-label='Select social network for ingestion'
          />

          {isSuccess && (
            <div className='rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs text-success'>
              Profile created — refreshing table…
            </div>
          )}

          <Input
            ref={inputRef}
            type='text'
            inputSize='sm'
            placeholder={inputPlaceholder}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            disabled={isLoading}
            autoComplete='off'
            className='text-xs'
          />

          {network === 'spotify' &&
            spotifyState === 'success' &&
            spotifyResults.length > 0 && (
              <div className='max-h-44 overflow-auto rounded-md border border-subtle bg-background-elevated p-1'>
                {spotifyResults.map(artist => (
                  <button
                    key={artist.id}
                    type='button'
                    className='flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent/15'
                    onClick={() => selectSpotifyArtist(artist)}
                  >
                    <span>{artist.name}</span>
                    <span className='text-tertiary-token'>Use</span>
                  </button>
                ))}
              </div>
            )}

          {network === 'spotify' && spotifyState === 'error' && (
            <p className='text-xs text-destructive'>
              {spotifyError ?? 'Spotify search failed'}
            </p>
          )}

          {detectedPlatform && (
            <div className='flex items-center gap-2 text-xs text-secondary-token'>
              <span
                className='h-2 w-2 shrink-0 rounded-full bg-secondary'
                style={
                  detectedPlatform.color
                    ? { backgroundColor: `#${detectedPlatform.color}` }
                    : undefined
                }
                aria-hidden='true'
              />
              <span>Detected: {detectedPlatform.name}</span>
            </div>
          )}

          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className='text-xs'
            >
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              size='sm'
              disabled={isLoading || !inputValue.trim()}
              className='text-xs'
            >
              {isLoading ? 'Ingesting…' : 'Ingest'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
