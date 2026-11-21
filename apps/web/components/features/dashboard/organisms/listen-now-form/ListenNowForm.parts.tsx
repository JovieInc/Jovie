'use client';

import {
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { CheckCircle2, ExternalLink, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ALL_PLATFORMS, PLATFORM_METADATA_MAP } from '@/constants/platforms';
import { NEUTRAL_BRAND_FALLBACK_HEX } from '@/constants/platforms/brand-colors';
import { getContrastSafeIconColor } from '@/lib/utils/color';
import { getPlaceholder } from './listen-now-placeholders';
import type { AdditionalDSPLink, ConnectedDspInfo } from './useMusicLinksForm';

/** Music DSPs available for the "additional" section (excluding primary 2). */
export const ADDITIONAL_DSP_OPTIONS = ALL_PLATFORMS.filter(
  p => p.category === 'music' && !['spotify', 'apple_music'].includes(p.id)
);

/** Brand colour (bare hex) from the platform registry, neutral when unknown. */
function brandHexFor(platformId: string): string {
  return PLATFORM_METADATA_MAP[platformId]?.color || NEUTRAL_BRAND_FALLBACK_HEX;
}

/** Renders connected artist info (photo + name) for a primary DSP row. */
export function ConnectedArtistBadge({
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
      <span className='max-w-35 truncate text-xs text-secondary-token'>
        {info.artistName}
      </span>
      <CheckCircle2
        className='h-3.5 w-3.5 shrink-0 text-secondary-token'
        aria-hidden='true'
      />
      {info.externalUrl ? (
        <IconButton
          asChild
          size='xs'
          variant='inline'
          fade='visible'
          aria-label='Open Profile'
        >
          <a href={info.externalUrl} target='_blank' rel='noopener noreferrer'>
            {/* xs owns 12px [&_svg]; color inherits inline hover. */}
            <ExternalLink />
          </a>
        </IconButton>
      ) : null}
    </div>
  );
}

export interface PrimaryDspRowProps {
  readonly platformId: 'spotify' | 'apple_music' | 'youtube';
  readonly icon: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly connectedInfo?: ConnectedDspInfo;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  /** Present only while the platform is unconnected and searchable. */
  readonly onSearch?: () => void;
}

/** One primary streaming or video row: brand tile, label, URL field. */
export function PrimaryDspRow({
  platformId,
  icon,
  label,
  value,
  placeholder,
  connectedInfo,
  onChange,
  onBlur,
  onSearch,
}: Readonly<PrimaryDspRowProps>) {
  const hex = `#${brandHexFor(platformId)}`;
  return (
    <div className='flex items-center gap-3 px-4 py-3'>
      <div
        className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
        style={{ backgroundColor: `${hex}12`, color: hex }}
      >
        <SocialIcon platform={icon} className='h-4 w-4' aria-hidden />
      </div>
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <span className='w-25 shrink-0 text-app font-medium text-primary-token'>
          {label}
        </span>
        {connectedInfo ? (
          <div className='flex min-w-0 flex-1 items-center justify-between gap-2'>
            <ConnectedArtistBadge info={connectedInfo} showImage />
          </div>
        ) : null}
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
          className='min-w-0 flex-1'
          aria-label={`${label} URL`}
        />
      </div>
      {onSearch ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={onSearch}
          className='shrink-0'
        >
          Search
        </Button>
      ) : null}
    </div>
  );
}

export interface AdditionalLinkRowProps {
  readonly link: AdditionalDSPLink;
  readonly dspInfo?: ConnectedDspInfo;
  readonly isDarkTheme: boolean;
  readonly usedPlatforms: ReadonlySet<string>;
  readonly onPlatformChange: (platform: string) => void;
  readonly onUrlChange: (url: string) => void;
  readonly onBlur: () => void;
  readonly onRemove: () => void;
}

/** One "other platform" row: platform select, URL field, remove button. */
export function AdditionalLinkRow({
  link,
  dspInfo,
  isDarkTheme,
  usedPlatforms,
  onPlatformChange,
  onUrlChange,
  onBlur,
  onRemove,
}: Readonly<AdditionalLinkRowProps>) {
  const meta = PLATFORM_METADATA_MAP[link.platform];
  const name = meta?.name || link.platform;
  return (
    <div className='flex items-center gap-3 px-4 py-3'>
      <div
        className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md'
        style={{
          backgroundColor: meta ? `#${meta.color}12` : undefined,
          color: meta
            ? getContrastSafeIconColor(`#${meta.color}`, isDarkTheme)
            : undefined,
        }}
      >
        <SocialIcon platform={link.platform} className='h-4 w-4' aria-hidden />
      </div>

      <Select value={link.platform} onValueChange={onPlatformChange}>
        <SelectTrigger
          className='w-35 shrink-0'
          aria-label={`${name} platform`}
        >
          <SelectValue placeholder='Platform' />
        </SelectTrigger>
        <SelectContent>
          {ADDITIONAL_DSP_OPTIONS.map(p => {
            const alreadyUsed =
              usedPlatforms.has(p.id) && p.id !== link.platform;
            return (
              <SelectItem key={p.id} value={p.id} disabled={alreadyUsed}>
                {p.name}
                {alreadyUsed ? ' (already added)' : ''}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {dspInfo && (
        <span className='max-w-30 shrink-0 truncate text-xs text-secondary-token'>
          {dspInfo.artistName}
        </span>
      )}

      <Input
        type='url'
        value={link.url}
        onChange={e => onUrlChange(e.target.value)}
        onBlur={onBlur}
        placeholder={getPlaceholder(link.platform)}
        inputMode='url'
        autoCapitalize='none'
        autoCorrect='off'
        autoComplete='off'
        className='min-w-0 flex-1'
        aria-label={`${name} URL`}
      />

      <IconButton
        // Pre-migration Trash2 was h-4 (16px); md owns [&_svg] 16px.
        size='md'
        variant='inline'
        fade='visible'
        destructive
        onClick={onRemove}
        className='shrink-0'
        aria-label={`Remove ${name}`}
      >
        <Trash2 />
      </IconButton>
    </div>
  );
}
