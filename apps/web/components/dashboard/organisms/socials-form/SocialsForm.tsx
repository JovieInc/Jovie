'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button, CommonDropdown, Input } from '@jovie/ui';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useMemo, useRef } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { PLATFORM_OPTIONS } from '@/components/dashboard/molecules/universalLinkInput.constants';
import { ALL_PLATFORMS, PLATFORM_METADATA_MAP } from '@/constants/platforms';
import { ensureContrast, hexToRgb, isBrandDark } from '@/lib/utils/color';
import { SocialLinkSuggestionRows } from './SocialLinkSuggestionRows';
import type { SocialsFormProps } from './types';
import { useSocialLinkSuggestions } from './useSocialLinkSuggestions';
import { useSocialsForm } from './useSocialsForm';

/** Alpha value for the hex suffix `15` used in chip backgrounds (0x15/255 ≈ 8.2%). */
const CHIP_BG_ALPHA = 0x15 / 255;

/**
 * Get icon color that meets WCAG 3:1 against the effective chip background.
 * Unlike getContrastSafeIconColor (which checks against the surface), this accounts
 * for the tinted chip background that shifts contrast for bright brands.
 */
function getChipSafeIconColor(brandHex: string, isDark: boolean): string {
  if (isDark && isBrandDark(brandHex)) return '#ffffff';

  const surfaceHex = isDark ? '#101012' : '#fcfcfc';
  const brand = hexToRgb(brandHex);
  const surface = hexToRgb(surfaceHex);
  const r = Math.round(
    brand.r * CHIP_BG_ALPHA + surface.r * (1 - CHIP_BG_ALPHA)
  );
  const g = Math.round(
    brand.g * CHIP_BG_ALPHA + surface.g * (1 - CHIP_BG_ALPHA)
  );
  const b = Math.round(
    brand.b * CHIP_BG_ALPHA + surface.b * (1 - CHIP_BG_ALPHA)
  );
  const effectiveBg = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

  return ensureContrast(brandHex, effectiveBg);
}

const SOCIALS_FORM_LOADING_KEYS = [
  'socials-form-loading-1',
  'socials-form-loading-2',
  'socials-form-loading-3',
];

const SUGGESTED_PLATFORM_IDS = [
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'facebook',
  'linkedin',
  'discord',
  'reddit',
  'website',
] as const;

const EXCLUDED_PLATFORM_IDS = new Set([
  'onlyfans',
  'twitter',
  // Professional links (only 'website' remains)
  'blog',
  'portfolio',
  'booking',
  'press_kit',
  'other',
  // Link aggregators
  'linktree',
  'beacons',
  'linkin_bio',
  'allmylinks',
  'linkfire',
  'toneden',
  'featurefm',
]);

/** Spotify and Apple Music keep their dedicated connection UI; other music DSPs get text inputs. */
const PRIMARY_DSP_IDS = new Set(['spotify', 'apple_music']);

const SOCIAL_LINK_PLATFORM_CANDIDATES = ALL_PLATFORMS.filter(
  platform =>
    (['social', 'creator', 'messaging', 'professional'].includes(
      platform.category
    ) ||
      (platform.category === 'music' && !PRIMARY_DSP_IDS.has(platform.id))) &&
    !EXCLUDED_PLATFORM_IDS.has(platform.id)
);

const SUGGESTED_PLATFORM_SET = new Set<string>(SUGGESTED_PLATFORM_IDS);

/** Platforms available in the social links selector, grouped for speed and discoverability. */
const SOCIAL_PLATFORM_GROUPS = [
  {
    label: 'Suggested',
    platforms: SOCIAL_LINK_PLATFORM_CANDIDATES.filter(platform =>
      SUGGESTED_PLATFORM_SET.has(platform.id)
    ),
  },
  {
    label: 'Music',
    platforms: SOCIAL_LINK_PLATFORM_CANDIDATES.filter(
      platform => platform.category === 'music'
    ),
  },
  {
    label: 'All supported platforms',
    platforms: SOCIAL_LINK_PLATFORM_CANDIDATES.filter(
      platform =>
        !SUGGESTED_PLATFORM_SET.has(platform.id) &&
        platform.category !== 'music'
    ),
  },
] as const;

/** Smart placeholder text per platform. */
const PLATFORM_PLACEHOLDERS = Object.fromEntries(
  PLATFORM_OPTIONS.map(option => [
    option.id,
    `${option.prefill}${option.hint === 'your URL' ? 'yourwebsite.com' : option.hint}`,
  ])
) as Record<string, string>;

PLATFORM_PLACEHOLDERS.x = 'https://x.com/yourhandle';
PLATFORM_PLACEHOLDERS.twitter = 'https://x.com/yourhandle';
PLATFORM_PLACEHOLDERS.website = 'https://yourwebsite.com';
PLATFORM_PLACEHOLDERS.blog = 'https://yourblog.com';
PLATFORM_PLACEHOLDERS.email = 'mailto:you@example.com';

// Music DSP placeholders (canonical underscore IDs from ALL_PLATFORMS)
PLATFORM_PLACEHOLDERS.youtube_music =
  'https://music.youtube.com/channel/UCxxxxx';
PLATFORM_PLACEHOLDERS.bandcamp = 'https://yourname.bandcamp.com';
PLATFORM_PLACEHOLDERS.tidal = 'https://tidal.com/browse/artist/12345';
PLATFORM_PLACEHOLDERS.deezer = 'https://deezer.com/artist/12345';
PLATFORM_PLACEHOLDERS.amazon_music = 'https://music.amazon.com/artists/B0xxxxx';
PLATFORM_PLACEHOLDERS.pandora = 'https://pandora.com/artist/yourname';
PLATFORM_PLACEHOLDERS.beatport = 'https://beatport.com/artist/yourname';

function getPlaceholder(platform: string): string {
  return PLATFORM_PLACEHOLDERS[platform] || 'https://...';
}

function getPlatformLabel(platform: string): string {
  if (platform === 'twitter') return 'X';
  return PLATFORM_METADATA_MAP[platform]?.name || platform;
}

/** Build dropdown items for the platform selector, grouped by category with search support. */
function buildPlatformItems(
  onSelect: (platformId: string) => void
): CommonDropdownItem[] {
  const items: CommonDropdownItem[] = [];

  SOCIAL_PLATFORM_GROUPS.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      items.push({ type: 'separator', id: `sep-${group.label}` });
    }
    items.push({
      type: 'label',
      id: `label-${group.label}`,
      label: group.label,
    });
    for (const p of group.platforms) {
      items.push({
        type: 'action',
        id: p.id,
        label: p.name,
        icon: <SocialIcon platform={p.id} className='h-4 w-4' aria-hidden />,
        onClick: () => onSelect(p.id),
      });
    }
  });

  return items;
}

export function SocialsForm({ artist }: Readonly<SocialsFormProps>) {
  const {
    loading,
    error,
    success,
    socialLinks,
    handleSubmit,
    removeSocialLink,
    updateSocialLink,
    scheduleNormalize,
    handleUrlBlur,
    addSocialLink,
  } = useSocialsForm({ artistId: artist.id });
  const {
    suggestions,
    isLoading: suggestionsLoading,
    actioningId,
    confirm: confirmSuggestion,
    dismiss: dismissSuggestion,
  } = useSocialLinkSuggestions(artist.id);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const urlInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const focusUrlField = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const input = urlInputRefs.current[index];
      if (!input) return;
      input.focus();
      input.select();
    });
  }, []);

  const handleAddSocialLink = useCallback(() => {
    const nextIndex = socialLinks.length;
    addSocialLink();
    focusUrlField(nextIndex);
  }, [addSocialLink, focusUrlField, socialLinks.length]);

  const handleUrlKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      const isLastRow = index === socialLinks.length - 1;
      if (isLastRow) {
        handleAddSocialLink();
        return;
      }
      focusUrlField(index + 1);
    },
    [focusUrlField, handleAddSocialLink, socialLinks.length]
  );

  /** Memoize platform dropdown items per-row so onClick closures stay stable. */
  const platformItemsByIndex = useMemo(
    () =>
      socialLinks.map((_, index) =>
        buildPlatformItems(platformId =>
          updateSocialLink(index, 'platform', platformId)
        )
      ),
    [socialLinks, updateSocialLink]
  );

  if (loading) {
    return (
      <div className='rounded-lg border border-subtle divide-y divide-subtle'>
        {SOCIALS_FORM_LOADING_KEYS.map(key => (
          <div key={key} className='flex items-center gap-3 px-4 py-3'>
            <div className='h-8 w-8 rounded-md bg-surface-2 animate-pulse motion-reduce:animate-none shrink-0' />
            <div className='h-4 w-24 rounded bg-surface-2 animate-pulse motion-reduce:animate-none shrink-0' />
            <div className='flex-1 h-9 rounded-lg bg-surface-2 animate-pulse motion-reduce:animate-none' />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-5' data-testid='socials-form'>
      {!suggestionsLoading && suggestions.length > 0 && (
        <SocialLinkSuggestionRows
          suggestions={suggestions}
          actioningId={actioningId}
          onConfirm={confirmSuggestion}
          onDismiss={dismissSuggestion}
        />
      )}

      {socialLinks.length === 0 ? (
        <div className='flex justify-center py-6'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={handleAddSocialLink}
            className='gap-1.5'
          >
            <Plus className='h-3.5 w-3.5' />
            Add Link
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className='space-y-0'>
          <div className='rounded-lg border border-subtle divide-y divide-subtle'>
            {socialLinks.map((link, index) => (
              <div
                key={link.id || `new-${index}`}
                className='flex items-center gap-3 px-4 py-3'
              >
                <div
                  className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
                  style={{
                    backgroundColor: PLATFORM_METADATA_MAP[link.platform]
                      ? `#${PLATFORM_METADATA_MAP[link.platform].color}15`
                      : undefined,
                    color: PLATFORM_METADATA_MAP[link.platform]
                      ? getChipSafeIconColor(
                          `#${PLATFORM_METADATA_MAP[link.platform].color}`,
                          isDark
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

                <CommonDropdown
                  variant='dropdown'
                  searchable
                  searchPlaceholder='Search platforms...'
                  emptyMessage='No platforms found'
                  items={platformItemsByIndex[index] ?? []}
                  align='start'
                  trigger={
                    <button
                      type='button'
                      className='flex h-9 w-[140px] shrink-0 items-center justify-between gap-1 rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:border-interactive'
                    >
                      <span className='truncate'>
                        {getPlatformLabel(link.platform)}
                      </span>
                      <ChevronDown className='h-3.5 w-3.5 shrink-0 opacity-50' />
                    </button>
                  }
                  aria-label={`Select platform for link ${index + 1}`}
                />

                <Input
                  ref={element => {
                    urlInputRefs.current[index] = element;
                  }}
                  type='url'
                  value={link.url}
                  onChange={e => {
                    const v = e.target.value;
                    updateSocialLink(index, 'url', v);
                    scheduleNormalize(index, v);
                  }}
                  onBlur={() => handleUrlBlur(index)}
                  onKeyDown={event => handleUrlKeyDown(index, event)}
                  placeholder={getPlaceholder(link.platform)}
                  inputMode='url'
                  autoCapitalize='none'
                  autoCorrect='off'
                  autoComplete='off'
                  className='flex-1 min-w-0'
                  aria-label={`${getPlatformLabel(link.platform)} URL`}
                />

                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => removeSocialLink(index)}
                  className='shrink-0 text-tertiary-token hover:text-error transition-colors'
                  aria-label={`Remove ${getPlatformLabel(link.platform)}`}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>

          <div className='flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleAddSocialLink}
              className='gap-1.5'
            >
              <Plus className='h-3.5 w-3.5' />
              Add Link
            </Button>
            <Button
              type='submit'
              variant='primary'
              className='w-full sm:w-auto'
            >
              Save Social Links
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div className='bg-error-subtle border border-error rounded-lg p-3'>
          <p className='text-sm text-error'>{error}</p>
        </div>
      )}

      {success && (
        <div className='bg-success-subtle border border-success rounded-lg p-3'>
          <p className='text-sm text-success'>
            Social links saved successfully!
          </p>
        </div>
      )}
    </div>
  );
}
