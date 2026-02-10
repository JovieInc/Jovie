'use client';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { CheckCircle2, ExternalLink, Music, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette';
import { ALL_PLATFORMS, PLATFORM_METADATA_MAP } from '@/constants/platforms';
import { getContrastSafeIconColor } from '@/lib/utils/color';
import type { Artist } from '@/types/db';
import type { ConnectedDspInfo } from './useMusicLinksForm';
import { useMusicLinksForm } from './useMusicLinksForm';

interface ListenNowFormProps {
  readonly artist: Artist;
  readonly onUpdate: (artist: Artist) => void;
}

/** Music DSPs available for the "additional" section (excluding primary 2). */
const ADDITIONAL_DSP_OPTIONS = ALL_PLATFORMS.filter(
  p => p.category === 'music' && !['spotify', 'apple_music'].includes(p.id)
);

/** Placeholder URLs for music platforms. */
const DSP_PLACEHOLDERS: Record<string, string> = {
  spotify: 'https://open.spotify.com/artist/...',
  apple_music: 'https://music.apple.com/artist/...',
  youtube: 'https://youtube.com/@yourchannel',
  youtube_music: 'https://music.youtube.com/channel/...',
  soundcloud: 'https://soundcloud.com/yourprofile',
  bandcamp: 'https://yourname.bandcamp.com',
  tidal: 'https://tidal.com/artist/...',
  deezer: 'https://deezer.com/artist/...',
  amazon_music: 'https://music.amazon.com/artists/...',
  pandora: 'https://pandora.com/artist/...',
  beatport: 'https://beatport.com/artist/...',
};

function getPlaceholder(platform: string): string {
  return DSP_PLACEHOLDERS[platform] || 'https://...';
}

const LOADING_KEYS = ['dsp-skeleton-1', 'dsp-skeleton-2', 'dsp-skeleton-3'];

/** Platform icon + color config for primary DSPs. */
const PRIMARY_DSP_CONFIG = {
  spotify: { icon: 'spotify', color: '#1DB954', label: 'Spotify' },
  apple_music: {
    icon: 'applemusic',
    color: '#FA243C',
    label: 'Apple Music',
  },
  youtube: { icon: 'youtube', color: '#FF0000', label: 'YouTube' },
} as const;

/** Renders connected artist info (photo + name) for a primary DSP row. */
function ConnectedArtistBadge({
  info,
  showImage,
}: Readonly<{
  info: ConnectedDspInfo;
  showImage?: boolean;
}>) {
  return (
    <div className='flex items-center gap-2'>
      {showImage && info.artistImageUrl && (
        <Image
          src={info.artistImageUrl}
          alt={info.artistName}
          width={20}
          height={20}
          className='rounded-full object-cover'
        />
      )}
      <span className='text-xs text-secondary truncate max-w-[140px]'>
        {info.artistName}
      </span>
      <CheckCircle2 className='h-3.5 w-3.5 text-green-500 shrink-0' />
      {info.externalUrl && (
        <a
          href={info.externalUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='text-tertiary-token hover:text-primary-token transition-colors'
          aria-label='Open profile'
        >
          <ExternalLink className='h-3 w-3' />
        </a>
      )}
    </div>
  );
}

export function ListenNowForm({ artist, onUpdate }: ListenNowFormProps) {
  const {
    primaryFields,
    additionalLinks,
    connectedDspInfo,
    updatePrimaryField,
    schedulePrimaryNormalize,
    handlePrimaryBlur,
    addAdditionalLink,
    removeAdditionalLink,
    updateAdditionalLink,
    scheduleAdditionalNormalize,
    handleAdditionalBlur,
    handleSubmit,
    loading,
    initialLoading,
    error,
    success,
  } = useMusicLinksForm({ artist, onUpdate });
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';

  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  const [searchPaletteProvider, setSearchPaletteProvider] = useState<
    'spotify' | 'apple_music'
  >('spotify');

  const openSearchPalette = useCallback(
    (provider: 'spotify' | 'apple_music') => {
      setSearchPaletteProvider(provider);
      setSearchPaletteOpen(true);
    },
    []
  );

  const handlePaletteArtistSelect = useCallback(
    (selected: { url: string; name: string }) => {
      if (searchPaletteProvider === 'spotify') {
        updatePrimaryField('spotify_url', selected.url);
        schedulePrimaryNormalize('spotify_url', selected.url);
      } else {
        updatePrimaryField('apple_music_url', selected.url);
        schedulePrimaryNormalize('apple_music_url', selected.url);
      }
      if (selected.name) {
        toast.success(
          `Found ${selected.name} on ${searchPaletteProvider === 'spotify' ? 'Spotify' : 'Apple Music'}`
        );
      }
    },
    [searchPaletteProvider, updatePrimaryField, schedulePrimaryNormalize]
  );

  const spotifyConnected = !!primaryFields.spotify_url;
  const appleMusicConnected = !!primaryFields.apple_music_url;

  if (initialLoading) {
    return (
      <div className='space-y-3'>
        {LOADING_KEYS.map(key => (
          <div
            key={key}
            className='h-12 bg-surface-2 rounded-md animate-pulse motion-reduce:animate-none'
          />
        ))}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-6'
      data-testid='listen-now-form'
    >
      {/* ── Primary Streaming ─────────────────────────────── */}
      <div>
        <h3 className='text-[11px] font-medium uppercase tracking-wider text-tertiary-token mb-3'>
          Primary Streaming
        </h3>
        <p className='text-[13px] text-secondary mb-4'>
          Connect your main streaming profiles. These appear prominently on your
          page.
        </p>

        <div className='rounded-lg border border-subtle divide-y divide-subtle'>
          {/* Spotify row */}
          <div className='flex items-center gap-3 px-4 py-3'>
            <div
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
              style={{
                backgroundColor: `${PRIMARY_DSP_CONFIG.spotify.color}12`,
                color: PRIMARY_DSP_CONFIG.spotify.color,
              }}
            >
              <SocialIcon
                platform={PRIMARY_DSP_CONFIG.spotify.icon}
                className='h-4 w-4'
                aria-hidden
              />
            </div>
            <div className='flex flex-1 items-center gap-3 min-w-0'>
              <span className='text-[13px] font-medium text-primary-token shrink-0 w-[100px]'>
                Spotify
              </span>
              {connectedDspInfo.spotify ? (
                <div className='flex flex-1 items-center justify-between gap-2 min-w-0'>
                  <ConnectedArtistBadge
                    info={connectedDspInfo.spotify}
                    showImage
                  />
                </div>
              ) : null}
              <Input
                type='url'
                value={primaryFields.spotify_url}
                onChange={e => {
                  const v = e.target.value;
                  updatePrimaryField('spotify_url', v);
                  schedulePrimaryNormalize('spotify_url', v);
                }}
                onBlur={() => handlePrimaryBlur('spotify_url')}
                placeholder={DSP_PLACEHOLDERS.spotify}
                inputMode='url'
                autoCapitalize='none'
                autoCorrect='off'
                autoComplete='off'
                className='flex-1 min-w-0'
                aria-label='Spotify URL'
              />
            </div>
            {!spotifyConnected && (
              <button
                type='button'
                onClick={() => openSearchPalette('spotify')}
                className='shrink-0 text-xs font-medium text-secondary hover:text-primary-token transition-colors px-2 py-1 rounded-md hover:bg-surface-2'
              >
                Search
              </button>
            )}
          </div>

          {/* Apple Music row */}
          <div className='flex items-center gap-3 px-4 py-3'>
            <div
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
              style={{
                backgroundColor: `${PRIMARY_DSP_CONFIG.apple_music.color}12`,
                color: PRIMARY_DSP_CONFIG.apple_music.color,
              }}
            >
              <SocialIcon
                platform={PRIMARY_DSP_CONFIG.apple_music.icon}
                className='h-4 w-4'
                aria-hidden
              />
            </div>
            <div className='flex flex-1 items-center gap-3 min-w-0'>
              <span className='text-[13px] font-medium text-primary-token shrink-0 w-[100px]'>
                Apple Music
              </span>
              {connectedDspInfo.apple_music ? (
                <div className='flex flex-1 items-center justify-between gap-2 min-w-0'>
                  <ConnectedArtistBadge
                    info={connectedDspInfo.apple_music}
                    showImage
                  />
                </div>
              ) : null}
              <Input
                type='url'
                value={primaryFields.apple_music_url}
                onChange={e => {
                  const v = e.target.value;
                  updatePrimaryField('apple_music_url', v);
                  schedulePrimaryNormalize('apple_music_url', v);
                }}
                onBlur={() => handlePrimaryBlur('apple_music_url')}
                placeholder={DSP_PLACEHOLDERS.apple_music}
                inputMode='url'
                autoCapitalize='none'
                autoCorrect='off'
                autoComplete='off'
                className='flex-1 min-w-0'
                aria-label='Apple Music URL'
              />
            </div>
            {!appleMusicConnected && (
              <button
                type='button'
                onClick={() => openSearchPalette('apple_music')}
                className='shrink-0 text-xs font-medium text-secondary hover:text-primary-token transition-colors px-2 py-1 rounded-md hover:bg-surface-2'
              >
                Search
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Artist search command palette for Spotify/Apple Music */}
      <ArtistSearchCommandPalette
        open={searchPaletteOpen}
        onOpenChange={setSearchPaletteOpen}
        provider={searchPaletteProvider}
        onArtistSelect={handlePaletteArtistSelect}
      />

      {/* ── Video ─────────────────────────────────────────── */}
      <div>
        <h3 className='text-[11px] font-medium uppercase tracking-wider text-tertiary-token mb-3'>
          Video
        </h3>
        <p className='text-[13px] text-secondary mb-4'>
          Link your YouTube channel for music videos and content.
        </p>

        <div className='rounded-lg border border-subtle'>
          <div className='flex items-center gap-3 px-4 py-3'>
            <div
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
              style={{
                backgroundColor: `${PRIMARY_DSP_CONFIG.youtube.color}12`,
                color: PRIMARY_DSP_CONFIG.youtube.color,
              }}
            >
              <SocialIcon
                platform={PRIMARY_DSP_CONFIG.youtube.icon}
                className='h-4 w-4'
                aria-hidden
              />
            </div>
            <span className='text-[13px] font-medium text-primary-token shrink-0 w-[100px]'>
              YouTube
            </span>
            <Input
              type='url'
              value={primaryFields.youtube_url}
              onChange={e => {
                const v = e.target.value;
                updatePrimaryField('youtube_url', v);
                schedulePrimaryNormalize('youtube_url', v);
              }}
              onBlur={() => handlePrimaryBlur('youtube_url')}
              placeholder={DSP_PLACEHOLDERS.youtube}
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoComplete='off'
              className='flex-1 min-w-0'
              aria-label='YouTube URL'
            />
          </div>
        </div>
      </div>

      {/* ── Other Platforms ────────────────────────────────── */}
      <div>
        <h3 className='text-[11px] font-medium uppercase tracking-wider text-tertiary-token mb-3'>
          Other Platforms
        </h3>
        <p className='text-[13px] text-secondary mb-4'>
          Add links to other platforms where fans can find your music.
        </p>

        {additionalLinks.length === 0 ? (
          <div className='rounded-lg border border-dashed border-subtle py-6 text-center'>
            <Music
              className='h-5 w-5 mx-auto mb-2 text-tertiary-token'
              aria-hidden='true'
            />
            <p className='text-[13px] text-secondary mb-3'>
              SoundCloud, Bandcamp, Tidal, and more
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => addAdditionalLink()}
              className='gap-1.5'
            >
              <Plus className='h-3.5 w-3.5' />
              Add Platform
            </Button>
          </div>
        ) : (
          <div className='space-y-0'>
            <div className='rounded-lg border border-subtle divide-y divide-subtle'>
              {additionalLinks.map((link, index) => {
                const meta = PLATFORM_METADATA_MAP[link.platform];
                const dspInfo = connectedDspInfo[link.platform];
                return (
                  <div
                    key={link.id || `add-${index}`}
                    className='flex items-center gap-3 px-4 py-3'
                  >
                    <div
                      className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
                      style={{
                        backgroundColor: meta ? `#${meta.color}12` : undefined,
                        color: meta
                          ? getContrastSafeIconColor(
                              `#${meta.color}`,
                              isDarkTheme
                            )
                          : undefined,
                      }}
                    >
                      <SocialIcon
                        platform={link.platform}
                        className='h-4 w-4'
                        aria-hidden
                      />
                    </div>

                    <Select
                      value={link.platform}
                      onValueChange={value =>
                        updateAdditionalLink(index, 'platform', value)
                      }
                    >
                      <SelectTrigger className='w-[140px] shrink-0'>
                        <SelectValue placeholder='Platform' />
                      </SelectTrigger>
                      <SelectContent>
                        {ADDITIONAL_DSP_OPTIONS.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {dspInfo && (
                      <span className='text-xs text-secondary truncate max-w-[120px] shrink-0'>
                        {dspInfo.artistName}
                      </span>
                    )}

                    <Input
                      type='url'
                      value={link.url}
                      onChange={e => {
                        const v = e.target.value;
                        updateAdditionalLink(index, 'url', v);
                        scheduleAdditionalNormalize(index, v);
                      }}
                      onBlur={() => handleAdditionalBlur(index)}
                      placeholder={getPlaceholder(link.platform)}
                      inputMode='url'
                      autoCapitalize='none'
                      autoCorrect='off'
                      autoComplete='off'
                      className='flex-1 min-w-0'
                      aria-label={`${meta?.name || link.platform} URL`}
                    />

                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => removeAdditionalLink(index)}
                      className='shrink-0 text-tertiary-token hover:text-error transition-colors'
                      aria-label={`Remove ${meta?.name || link.platform}`}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className='pt-3'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => addAdditionalLink()}
                className='gap-1.5'
              >
                <Plus className='h-3.5 w-3.5' />
                Add Platform
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Save ──────────────────────────────────────────── */}
      <div className='pt-2 border-t border-subtle'>
        <Button
          type='submit'
          disabled={loading}
          variant='primary'
          className='w-full sm:w-auto'
        >
          {loading ? 'Saving...' : 'Save Music Links'}
        </Button>
      </div>

      {/* Feedback */}
      {error && (
        <div className='bg-error-subtle border border-error rounded-lg p-3'>
          <p className='text-sm text-error'>{error}</p>
        </div>
      )}

      {success && (
        <div className='bg-success-subtle border border-success rounded-lg p-3'>
          <p className='text-sm text-success'>
            Music links saved successfully!
          </p>
        </div>
      )}
    </form>
  );
}
