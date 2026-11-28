'use client';

// @coverage-via apps/web/tests/unit/dashboard/forms-validation-submit-state.test.tsx

import { Button } from '@jovie/ui';
import { Music, Plus } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { FormStatus } from '@/components/molecules/FormStatus';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette';
import type { Artist } from '@/types/db';
import { AdditionalLinkRow, PrimaryDspRow } from './ListenNowForm.parts';
import { DSP_PLACEHOLDERS } from './listen-now-placeholders';
import {
  type UseMusicLinksFormReturn,
  useMusicLinksForm,
} from './useMusicLinksForm';

interface ListenNowFormProps {
  readonly artist: Artist;
  readonly onUpdate: (artist: Artist) => void;
}

const LOADING_KEYS = ['dsp-skeleton-1', 'dsp-skeleton-2', 'dsp-skeleton-3'];

export function ListenNowForm({ artist, onUpdate }: ListenNowFormProps) {
  const form = useMusicLinksForm({ artist, onUpdate });
  const { resolvedTheme } = useTheme();
  return <ListenNowFormView {...form} isDarkTheme={resolvedTheme === 'dark'} />;
}

export interface ListenNowFormViewProps extends UseMusicLinksFormReturn {
  readonly isDarkTheme: boolean;
}

/** Presentational half: renders the music-link form from hook state. */
export function ListenNowFormView({
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
  isDarkTheme,
}: Readonly<ListenNowFormViewProps>) {
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
        updatePrimaryField('spotifyUrl', selected.url);
        schedulePrimaryNormalize('spotifyUrl', selected.url);
      } else {
        updatePrimaryField('appleMusicUrl', selected.url);
        schedulePrimaryNormalize('appleMusicUrl', selected.url);
      }
      if (selected.name) {
        toast.success(
          `Found ${selected.name} on ${searchPaletteProvider === 'spotify' ? 'Spotify' : 'Apple Music'}`
        );
      }
    },
    [searchPaletteProvider, updatePrimaryField, schedulePrimaryNormalize]
  );

  /** Set of platform IDs already used across additional links (for duplicate prevention). */
  const usedAdditionalPlatforms = useMemo(() => {
    const used = new Set<string>();
    for (const link of additionalLinks) {
      if (link.platform) used.add(link.platform);
    }
    return used;
  }, [additionalLinks]);

  const spotifyConnected = !!primaryFields.spotifyUrl;
  const appleMusicConnected = !!primaryFields.appleMusicUrl;

  if (initialLoading) {
    return (
      <div className='space-y-3'>
        {LOADING_KEYS.map(key => (
          <div key={key} className='h-12 rounded-md skeleton' />
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
        <h3 className='mb-3 text-sm font-medium text-primary-token'>
          Primary Streaming
        </h3>

        <ContentSurfaceCard className='divide-y divide-subtle overflow-hidden bg-surface-1 p-0'>
          <PrimaryDspRow
            platformId='spotify'
            icon='spotify'
            label='Spotify'
            value={primaryFields.spotifyUrl}
            placeholder={DSP_PLACEHOLDERS.spotify}
            connectedInfo={connectedDspInfo.spotify}
            onChange={v => {
              updatePrimaryField('spotifyUrl', v);
              schedulePrimaryNormalize('spotifyUrl', v);
            }}
            onBlur={() => handlePrimaryBlur('spotifyUrl')}
            onSearch={
              spotifyConnected ? undefined : () => openSearchPalette('spotify')
            }
          />
          <PrimaryDspRow
            platformId='apple_music'
            icon='applemusic'
            label='Apple Music'
            value={primaryFields.appleMusicUrl}
            placeholder={DSP_PLACEHOLDERS.apple_music}
            connectedInfo={connectedDspInfo.apple_music}
            onChange={v => {
              updatePrimaryField('appleMusicUrl', v);
              schedulePrimaryNormalize('appleMusicUrl', v);
            }}
            onBlur={() => handlePrimaryBlur('appleMusicUrl')}
            onSearch={
              appleMusicConnected
                ? undefined
                : () => openSearchPalette('apple_music')
            }
          />
        </ContentSurfaceCard>
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
        <h3 className='mb-3 text-sm font-medium text-primary-token'>Video</h3>

        <ContentSurfaceCard className='overflow-hidden p-0'>
          <PrimaryDspRow
            platformId='youtube'
            icon='youtube'
            label='YouTube'
            value={primaryFields.youtubeUrl}
            placeholder={DSP_PLACEHOLDERS.youtube}
            onChange={v => {
              updatePrimaryField('youtubeUrl', v);
              schedulePrimaryNormalize('youtubeUrl', v);
            }}
            onBlur={() => handlePrimaryBlur('youtubeUrl')}
          />
        </ContentSurfaceCard>
      </div>

      {/* ── Other Platforms ────────────────────────────────── */}
      <div>
        <h3 className='mb-3 text-sm font-medium text-primary-token'>
          Other Platforms
        </h3>

        {additionalLinks.length === 0 ? (
          <ContentSurfaceCard className='border-dashed bg-surface-1 py-6 text-center'>
            <Music
              className='mx-auto mb-2 h-5 w-5 text-tertiary-token'
              aria-hidden='true'
            />
            <p className='mb-3 text-app text-secondary-token'>
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
          </ContentSurfaceCard>
        ) : (
          <div className='space-y-0'>
            <ContentSurfaceCard className='divide-y divide-subtle overflow-hidden p-0'>
              {additionalLinks.map((link, index) => (
                <AdditionalLinkRow
                  key={link.id || `add-${index}`}
                  link={link}
                  dspInfo={connectedDspInfo[link.platform]}
                  isDarkTheme={isDarkTheme}
                  usedPlatforms={usedAdditionalPlatforms}
                  onPlatformChange={value =>
                    updateAdditionalLink(index, 'platform', value)
                  }
                  onUrlChange={v => {
                    updateAdditionalLink(index, 'url', v);
                    scheduleAdditionalNormalize(index, v);
                  }}
                  onBlur={() => handleAdditionalBlur(index)}
                  onRemove={() => removeAdditionalLink(index)}
                />
              ))}
            </ContentSurfaceCard>

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
      <div className='border-t border-subtle pt-2'>
        <Button
          type='submit'
          loading={loading}
          variant='primary'
          className='w-full sm:w-auto'
        >
          Save Music Links
        </Button>
      </div>

      <FormStatus
        error={error}
        success={success ? 'Music links saved' : undefined}
      />
    </form>
  );
}
