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
          className='relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-2 transition-colors shrink-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 sm:h-10 sm:w-10 sm:rounded-full'
          aria-label='Select platform'
        >
          <div
            className='flex items-center justify-center h-7 w-7 rounded-lg sm:h-6 sm:w-6 sm:rounded-full'
            style={{
              backgroundColor: selectorIconBg,
              color: selectorIconColor,
            }}
          >
            <SocialIcon
              platform={currentPlatformIcon}
              className='h-4 w-4 sm:h-3.5 sm:w-3.5'
            />
          </div>
          <ChevronDown
            className='absolute right-0.5 top-0.5 h-3 w-3 text-tertiary-token sm:right-1 sm:top-1'
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
              className='flex min-h-[44px] items-center gap-2.5 cursor-pointer py-2 text-sm'
            >
              <div
                className='flex items-center justify-center h-7 w-7 rounded-lg sm:h-5 sm:w-5 sm:rounded'
                style={{
                  backgroundColor: hex,
                  color: darkBrand ? '#ffffff' : 'var(--background)',
                }}
              >
                <SocialIcon
                  platform={platform.icon}
                  className='h-4 w-4 sm:h-3 sm:w-3'
                />
              </div>
              <span>{platform.name}</span>
              <Search className='h-4 w-4 text-tertiary-token ml-auto sm:h-3 sm:w-3' />
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
              className='flex min-h-[44px] items-center gap-2.5 cursor-pointer py-2 text-sm'
            >
              <div
                className='flex items-center justify-center h-7 w-7 rounded-lg sm:h-5 sm:w-5 sm:rounded'
                style={{
                  backgroundColor: hex,
                  color: darkBrand ? '#ffffff' : 'var(--background)',
                }}
              >
                <SocialIcon
                  platform={platform.icon}
                  className='h-4 w-4 sm:h-3 sm:w-3'
                />
              </div>
              <span>{platform.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
