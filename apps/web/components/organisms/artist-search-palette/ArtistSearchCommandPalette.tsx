'use client';

import { Dialog, DialogContent } from '@jovie/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { AppleMusicArtistResult } from '@/lib/queries/useAppleMusicArtistSearchQuery';
import { useAppleMusicArtistSearchQuery } from '@/lib/queries/useAppleMusicArtistSearchQuery';
import type { SpotifyArtistResult } from '@/lib/queries/useArtistSearchQuery';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { cn } from '@/lib/utils';

type DspProvider = 'spotify' | 'apple_music';
type ArtistResult = SpotifyArtistResult | AppleMusicArtistResult;

const PROVIDER_CONFIG = {
  spotify: {
    accent: '#1DB954',
    label: 'Spotify',
    platform: 'spotify' as const,
    placeholder: 'Search Spotify artists...',
    manualPlaceholder: 'https://open.spotify.com/artist/...',
    urlPattern: /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/,
  },
  apple_music: {
    accent: '#FA243C',
    label: 'Apple Music',
    platform: 'apple_music' as const,
    placeholder: 'Search Apple Music artists...',
    manualPlaceholder: 'https://music.apple.com/artist/...',
    urlPattern: /music\.apple\.com\/[a-z]{2}\/artist\/[^/]+\/(\d+)/,
  },
} as const;

function formatFollowers(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M followers`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K followers`;
  }
  return `${count} followers`;
}

function getArtistMeta(artist: ArtistResult): string {
  const parts: string[] = [];
  if ('followers' in artist && artist.followers) {
    parts.push(formatFollowers(artist.followers));
  }
  if ('genres' in artist && artist.genres && artist.genres.length > 0) {
    parts.push(artist.genres.slice(0, 2).join(', '));
  }
  return parts.join(' · ');
}

interface ArtistSearchCommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly provider: DspProvider;
  readonly onArtistSelect: (artist: ArtistResult) => void;
  readonly title?: string;
  readonly description?: string;
}

export function ArtistSearchCommandPalette({
  open,
  onOpenChange,
  provider,
  onArtistSelect,
  title,
  description,
}: ArtistSearchCommandPaletteProps) {
  const config = PROVIDER_CONFIG[provider];
  const [manualUrl, setManualUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Use the appropriate search hook based on provider
  const spotifySearch = useArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });
  const appleMusicSearch = useAppleMusicArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });

  const search = provider === 'spotify' ? spotifySearch : appleMusicSearch;

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      search.clear();
      setManualUrl('');
      // Focus the input after dialog animation
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only reset on open change

  const handleSelect = useCallback(
    (artist: ArtistResult) => {
      onArtistSelect(artist);
      onOpenChange(false);
    },
    [onArtistSelect, onOpenChange]
  );

  const handleManualSubmit = useCallback(() => {
    const url = manualUrl.trim();
    if (!url) return;

    const match = url.match(config.urlPattern);
    if (match?.[1]) {
      // Create a synthetic artist result from the URL
      const syntheticArtist: ArtistResult =
        provider === 'spotify'
          ? ({
              id: match[1],
              name: '',
              url,
              popularity: 0,
            } as SpotifyArtistResult)
          : ({
              id: match[1],
              name: '',
              url,
            } as AppleMusicArtistResult);
      onArtistSelect(syntheticArtist);
      onOpenChange(false);
    }
  }, [manualUrl, config.urlPattern, provider, onArtistSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='overflow-hidden p-0 sm:max-w-[480px]' hideClose>
        <DialogPrimitive.Title className='sr-only'>
          {title || `Connect ${config.label}`}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className='sr-only'>
          {description || `Search for your artist profile on ${config.label}`}
        </DialogPrimitive.Description>

        <Command
          className='flex flex-col'
          label={`Search ${config.label} artists`}
        >
          {/* Search input */}
          <div
            className='flex items-center gap-3 border-b border-subtle px-4 py-3'
            style={{ borderBottomColor: `${config.accent}20` }}
          >
            <div
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg'
              style={{
                backgroundColor: `${config.accent}15`,
                color: config.accent,
              }}
            >
              <SocialIcon platform={config.platform} className='h-4 w-4' />
            </div>
            <Command.Input
              ref={inputRef}
              placeholder={config.placeholder}
              className='flex-1 bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token'
              onValueChange={value => search.search(value)}
            />
            {search.state === 'loading' && (
              <Icon
                name='Loader2'
                className='h-4 w-4 animate-spin text-tertiary-token shrink-0'
              />
            )}
          </div>

          {/* Results */}
          <Command.List className='max-h-[300px] overflow-y-auto'>
            {search.state === 'loading' && search.results.length === 0 && (
              <div className='p-3 space-y-2'>
                {Array.from({ length: 3 }, (_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className='flex items-center gap-3 animate-pulse'
                  >
                    <div className='w-10 h-10 rounded-full bg-surface-3' />
                    <div className='flex-1 space-y-1'>
                      <div className='h-4 w-32 bg-surface-3 rounded' />
                      <div className='h-3 w-20 bg-surface-3 rounded' />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Command.Empty className='py-8 text-center'>
              {search.state === 'error' && (
                <p className='text-sm text-error'>
                  {search.error || 'Search failed'}
                </p>
              )}
              {search.state === 'empty' && (
                <div>
                  <Icon
                    name='Search'
                    className='mx-auto h-8 w-8 text-tertiary-token/50 mb-2'
                  />
                  <p className='text-sm text-secondary-token'>
                    No artists found
                  </p>
                  <p className='text-xs text-tertiary-token mt-1'>
                    Try a different name or paste a link below
                  </p>
                </div>
              )}
            </Command.Empty>

            {search.results.length > 0 && (
              <Command.Group>
                {search.results.map(artist => (
                  <Command.Item
                    key={artist.id}
                    value={`${artist.name} ${artist.id}`}
                    onSelect={() => handleSelect(artist)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                      'data-[selected=true]:bg-surface-2 hover:bg-surface-2/50'
                    )}
                  >
                    <div className='w-10 h-10 rounded-full bg-surface-3 overflow-hidden shrink-0 relative'>
                      {artist.imageUrl ? (
                        <Image
                          src={artist.imageUrl}
                          alt={artist.name}
                          fill
                          sizes='40px'
                          className='object-cover'
                          unoptimized
                        />
                      ) : (
                        <div className='w-full h-full flex items-center justify-center'>
                          <SocialIcon
                            platform={config.platform}
                            className='w-5 h-5 text-tertiary-token'
                          />
                        </div>
                      )}
                    </div>

                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-sm text-primary-token truncate'>
                        {artist.name}
                      </div>
                      <div className='text-xs text-tertiary-token'>
                        {getArtistMeta(artist)}
                      </div>
                    </div>

                    {'verified' in artist && artist.verified && (
                      <div
                        className='shrink-0'
                        style={{ color: config.accent }}
                      >
                        <Icon name='BadgeCheck' className='w-4 h-4' />
                      </div>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Manual URL input */}
          <div className='border-t border-subtle px-4 py-3'>
            <div className='flex items-center gap-2 text-xs text-tertiary-token mb-2'>
              <div className='flex-1 h-px bg-subtle' />
              <span>Or paste a link</span>
              <div className='flex-1 h-px bg-subtle' />
            </div>
            <div className='flex items-center gap-2'>
              <input
                type='url'
                value={manualUrl}
                onChange={e => setManualUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                }}
                placeholder={config.manualPlaceholder}
                className='flex-1 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-xs text-primary-token outline-none placeholder:text-tertiary-token focus:border-primary/30 transition-colors'
              />
              <button
                type='button'
                onClick={handleManualSubmit}
                disabled={!manualUrl.trim()}
                className='rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50'
                style={{ backgroundColor: config.accent }}
              >
                Connect
              </button>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
