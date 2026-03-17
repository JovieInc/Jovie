import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Plus, Search } from 'lucide-react';

import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { getContrastTextOnBrand } from '@/lib/utils/color';

import {
  ARTIST_SEARCH_PLATFORMS,
  type ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from './universalLinkInput.constants';
import { type CursorPosition } from './useInputFocusController';

interface PlatformSelectorProps {
  readonly onPlatformSelect: (
    platform: (typeof PLATFORM_OPTIONS)[number]
  ) => void;
  readonly onArtistSearchSelect: (provider: ArtistSearchProvider) => void;
  readonly onRestoreFocus: (cursor?: CursorPosition) => void;
  readonly disabled?: boolean;
}

export function UniversalLinkInputPlatformSelector({
  onPlatformSelect,
  onArtistSearchSelect,
  onRestoreFocus,
  disabled = false,
}: PlatformSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          disabled={disabled}
          className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-2 text-secondary-token transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95'
          aria-label='Add link from platform'
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
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
                  color: getContrastTextOnBrand(hex),
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
                  color: getContrastTextOnBrand(hex),
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
