import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { ChevronDown, Search } from 'lucide-react';

import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { isBrandDark } from '@/lib/utils/color';

import {
  ARTIST_SEARCH_PLATFORMS,
  type ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from './universalLinkInput.constants';
import { type CursorPosition } from './useInputFocusController';

interface PlatformSelectorProps {
  readonly currentPlatformIcon: string;
  readonly onPlatformSelect: (
    platform: (typeof PLATFORM_OPTIONS)[number]
  ) => void;
  readonly onArtistSearchSelect: (provider: ArtistSearchProvider) => void;
  readonly onRestoreFocus: (cursor?: CursorPosition) => void;
  readonly disabled?: boolean;
}

export function UniversalLinkInputPlatformSelector({
  currentPlatformIcon,
  onPlatformSelect,
  onArtistSearchSelect,
  onRestoreFocus,
  disabled = false,
}: PlatformSelectorProps) {
  const currentIconMeta = getPlatformIconMetadata(currentPlatformIcon);
  const currentIconHex = currentIconMeta?.hex
    ? `#${currentIconMeta.hex}`
    : '#6b7280';
  const isDarkBrand = isBrandDark(currentIconHex);
  const selectorIconBg = currentIconHex;
  const selectorIconColor = isDarkBrand ? '#ffffff' : '#0f172a';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          disabled={disabled}
          className='relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2 transition-colors shrink-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-60'
          aria-label='Select platform'
        >
          <div
            className='flex items-center justify-center w-6 h-6 rounded-full'
            style={{
              backgroundColor: selectorIconBg,
              color: selectorIconColor,
            }}
          >
            <SocialIcon
              platform={currentPlatformIcon}
              className='w-3.5 h-3.5'
            />
          </div>
          <ChevronDown
            className='absolute right-1 top-1 h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='max-h-80 overflow-y-auto'
        onCloseAutoFocus={event => {
          event.preventDefault();
          onRestoreFocus('end');
        }}
      >
        {ARTIST_SEARCH_PLATFORMS.map(platform => {
          const meta = getPlatformIconMetadata(platform.icon);
          const hex = meta?.hex ? `#${meta.hex}` : '#6b7280';
          const darkBrand = isBrandDark(hex);

          return (
            <DropdownMenuItem
              key={platform.id}
              onSelect={() => onArtistSearchSelect(platform.provider)}
              className='flex items-center gap-2 cursor-pointer py-1.5 text-[13px]'
            >
              <div
                className='flex items-center justify-center w-5 h-5 rounded'
                style={{
                  backgroundColor: hex,
                  color: darkBrand ? '#ffffff' : 'var(--background)',
                }}
              >
                <SocialIcon platform={platform.icon} className='w-3 h-3' />
              </div>
              <span>{platform.name}</span>
              <Search className='w-3 h-3 text-tertiary-token ml-auto' />
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        {PLATFORM_OPTIONS.map(platform => {
          const meta = getPlatformIconMetadata(platform.icon);
          const hex = meta?.hex ? `#${meta.hex}` : '#6b7280';
          const darkBrand = isBrandDark(hex);
          return (
            <DropdownMenuItem
              key={platform.id}
              onSelect={() => onPlatformSelect(platform)}
              className='flex items-center gap-2 cursor-pointer py-1.5 text-[13px]'
            >
              <div
                className='flex items-center justify-center w-5 h-5 rounded'
                style={{
                  backgroundColor: hex,
                  color: darkBrand ? '#ffffff' : 'var(--background)',
                }}
              >
                <SocialIcon platform={platform.icon} className='w-3 h-3' />
              </div>
              <span>{platform.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
