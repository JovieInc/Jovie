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
import { Music, Plus, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ALL_PLATFORMS, PLATFORM_METADATA_MAP } from '@/constants/platforms';
import { getContrastSafeIconColor } from '@/lib/utils/color';
import type { Artist } from '@/types/db';
import { useMusicLinksForm } from './useMusicLinksForm';

interface ListenNowFormProps {
  readonly artist: Artist;
  readonly onUpdate: (artist: Artist) => void;
}

/** Music DSPs available for the "additional" section (excluding primary 3). */
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

/**
 * Primary DSP card for Spotify or Apple Music.
 * Renders a branded, prominent input with platform icon and color.
 */
function PrimaryDSPCard({
  platform,
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  platform: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const meta = PLATFORM_METADATA_MAP[platform];
  const brandColor = meta ? `#${meta.color}` : '#6B7280';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className='rounded-lg border border-subtle bg-surface-1 p-4 transition-colors hover:border-primary/20'>
      <div className='flex items-center gap-3 mb-3'>
        <div
          className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'
          style={{
            backgroundColor: `${brandColor}15`,
            color: getContrastSafeIconColor(brandColor, isDark),
          }}
        >
          <SocialIcon platform={platform} className='h-5 w-5' aria-hidden />
        </div>
        <div>
          <h4 className='text-[14px] font-medium text-primary-token'>
            {label}
          </h4>
          <p className='text-[12px] text-tertiary-token'>
            {value ? 'Connected' : 'Not connected'}
          </p>
        </div>
      </div>
      <Input
        type='url'
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        inputMode='url'
        autoCapitalize='none'
        autoCorrect='off'
        autoComplete='off'
        aria-label={`${label} URL`}
      />
    </div>
  );
}

export function ListenNowForm({ artist, onUpdate }: ListenNowFormProps) {
  const {
    primaryFields,
    additionalLinks,
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

  if (initialLoading) {
    return (
      <div className='space-y-3'>
        {LOADING_KEYS.map(key => (
          <div
            key={key}
            className='h-[88px] bg-surface-2 rounded-lg animate-pulse motion-reduce:animate-none'
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
      {/* Primary DSPs: Spotify & Apple Music */}
      <div>
        <div className='mb-3'>
          <h3 className='text-[14px] font-medium text-primary-token'>
            Primary Streaming
          </h3>
          <p className='text-[13px] text-secondary mt-0.5'>
            Connect your main streaming profiles. These appear prominently on
            your page.
          </p>
        </div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <PrimaryDSPCard
            platform='spotify'
            label='Spotify'
            value={primaryFields.spotify_url}
            placeholder={DSP_PLACEHOLDERS.spotify!}
            onChange={v => {
              updatePrimaryField('spotify_url', v);
              schedulePrimaryNormalize('spotify_url', v);
            }}
            onBlur={() => handlePrimaryBlur('spotify_url')}
          />
          <PrimaryDSPCard
            platform='apple_music'
            label='Apple Music'
            value={primaryFields.apple_music_url}
            placeholder={DSP_PLACEHOLDERS.apple_music!}
            onChange={v => {
              updatePrimaryField('apple_music_url', v);
              schedulePrimaryNormalize('apple_music_url', v);
            }}
            onBlur={() => handlePrimaryBlur('apple_music_url')}
          />
        </div>
      </div>

      {/* YouTube */}
      <div>
        <div className='mb-3'>
          <h3 className='text-[14px] font-medium text-primary-token'>
            YouTube
          </h3>
          <p className='text-[13px] text-secondary mt-0.5'>
            Link your YouTube channel for music videos and content.
          </p>
        </div>
        <div className='rounded-lg border border-subtle bg-surface-1 p-3'>
          <div className='flex items-center gap-3'>
            <div
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
              style={{
                backgroundColor: '#FF000015',
                color: '#FF0000',
              }}
            >
              <SocialIcon platform='youtube' className='h-4 w-4' aria-hidden />
            </div>
            <Input
              type='url'
              value={primaryFields.youtube_url}
              onChange={e => {
                const v = e.target.value;
                updatePrimaryField('youtube_url', v);
                schedulePrimaryNormalize('youtube_url', v);
              }}
              onBlur={() => handlePrimaryBlur('youtube_url')}
              placeholder={DSP_PLACEHOLDERS.youtube!}
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoComplete='off'
              className='flex-1'
              aria-label='YouTube URL'
            />
          </div>
        </div>
      </div>

      {/* Additional Music DSPs */}
      <div>
        <div className='flex items-center justify-between mb-3'>
          <div>
            <h3 className='text-[14px] font-medium text-primary-token'>
              Additional Streaming Platforms
            </h3>
            <p className='text-[13px] text-secondary mt-0.5'>
              Add links to other platforms where fans can find your music.
            </p>
          </div>
        </div>

        {additionalLinks.length === 0 ? (
          <div className='rounded-lg border border-dashed border-subtle p-6 text-center'>
            <Music
              className='h-6 w-6 mx-auto mb-2 text-tertiary-token'
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
          <div className='space-y-3'>
            {additionalLinks.map((link, index) => (
              <div
                key={link.id || `add-${index}`}
                className='rounded-lg border border-subtle bg-surface-1 p-3 transition-colors hover:border-primary/20'
              >
                <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
                  {/* Platform selector with icon */}
                  <div className='flex items-center gap-2 sm:w-[200px] shrink-0'>
                    <div
                      className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
                      style={{
                        backgroundColor: PLATFORM_METADATA_MAP[link.platform]
                          ? `#${PLATFORM_METADATA_MAP[link.platform].color}15`
                          : undefined,
                        color: PLATFORM_METADATA_MAP[link.platform]
                          ? getContrastSafeIconColor(
                              `#${PLATFORM_METADATA_MAP[link.platform].color}`,
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
                      <SelectTrigger className='flex-1 sm:w-[160px]'>
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
                  </div>

                  {/* URL input + remove */}
                  <div className='flex flex-1 items-center gap-2'>
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
                      className='flex-1'
                      aria-label={`${PLATFORM_METADATA_MAP[link.platform]?.name || link.platform} URL`}
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => removeAdditionalLink(index)}
                      className='shrink-0 text-tertiary-token hover:text-error transition-colors'
                      aria-label={`Remove ${PLATFORM_METADATA_MAP[link.platform]?.name || link.platform}`}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

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
        )}
      </div>

      {/* Save button */}
      <Button
        type='submit'
        disabled={loading}
        variant='primary'
        className='w-full sm:w-auto'
      >
        {loading ? 'Saving...' : 'Save Music Links'}
      </Button>

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
