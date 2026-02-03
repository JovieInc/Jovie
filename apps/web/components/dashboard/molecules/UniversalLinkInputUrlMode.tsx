import { Input } from '@jovie/ui';
import { X } from 'lucide-react';
import React from 'react';

import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import { isBrandDark } from '@/lib/utils/color';
import { type DetectedLink } from '@/lib/utils/platform-detection';

import { UniversalLinkInputPlatformSelector } from './UniversalLinkInputPlatformSelector';
import {
  type ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from './universalLinkInput.constants';
import { type CursorPosition } from './useInputFocusController';

function getLinkDetectionStatus(
  detectedLink: DetectedLink | null,
  url: string
): string {
  if (!detectedLink) {
    return url ? 'No valid link detected. Please enter a valid URL.' : '';
  }
  if (detectedLink.isValid) {
    return `${detectedLink.platform.name} link detected. Title set automatically based on your profile and URL. You can now add this link.`;
  }
  return `Invalid ${detectedLink.platform.name} link. ${detectedLink.error || 'Please check the URL.'}`;
}

interface UniversalLinkInputUrlModeProps {
  readonly url: string;
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly detectedLink: DetectedLink | null;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly onUrlChange: (value: string) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  readonly onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  readonly onClear: () => void;
  readonly onPlatformSelect: (
    platform: (typeof PLATFORM_OPTIONS)[number]
  ) => void;
  readonly onArtistSearchSelect: (provider: ArtistSearchProvider) => void;
  readonly onRestoreFocus: (cursor?: CursorPosition) => void;
  readonly onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  readonly onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  /** When true, changes border radius to connect seamlessly with dropdown below */
  readonly isDropdownOpen?: boolean;
  readonly comboboxAria?: {
    role?: 'combobox';
    readonly ariaExpanded?: boolean;
    readonly ariaControls?: string;
    readonly ariaActivedescendant?: string;
    readonly ariaAutocomplete?: 'list';
  };
}

export function UniversalLinkInputUrlMode({
  url,
  placeholder,
  disabled,
  detectedLink,
  inputRef,
  onUrlChange,
  onKeyDown,
  onPaste,
  onClear,
  onPlatformSelect,
  onArtistSearchSelect,
  onRestoreFocus,
  onFocus,
  onBlur,
  isDropdownOpen = false,
  comboboxAria,
}: UniversalLinkInputUrlModeProps) {
  const currentPlatformIcon = detectedLink?.platform.icon || 'globe';
  const brandColor = detectedLink?.platform.color
    ? `#${detectedLink.platform.color}`
    : '#6b7280';

  const isDarkBrand = isBrandDark(brandColor);
  const iconColor = isDarkBrand ? '#ffffff' : brandColor;
  const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

  return (
    <div className='relative w-full'>
      <div
        className={cn(
          'relative flex w-full items-center gap-2 overflow-hidden bg-surface-1 px-2 py-1 shadow-xs transition-all',
          isDropdownOpen
            ? 'rounded-t-3xl border-2 border-b-0 border-accent'
            : 'rounded-full border border-default focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20',
          disabled && 'opacity-50'
        )}
      >
        <UniversalLinkInputPlatformSelector
          currentPlatformIcon={currentPlatformIcon}
          onPlatformSelect={onPlatformSelect}
          onArtistSearchSelect={onArtistSearchSelect}
          onRestoreFocus={onRestoreFocus}
          disabled={disabled}
        />

        <label htmlFor='link-url-input' className='sr-only'>
          Link URL
        </label>
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          id='link-url-input'
          type='url'
          inputSize='lg'
          placeholder={placeholder}
          value={url}
          onChange={event => onUrlChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={disabled}
          inputMode='url'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          className='border-0 bg-transparent px-0 pr-24 focus-visible:ring-0 focus-visible:ring-offset-0'
          aria-describedby={detectedLink ? 'link-detection-status' : undefined}
          role={comboboxAria?.role}
          aria-expanded={comboboxAria?.ariaExpanded}
          aria-controls={comboboxAria?.ariaControls}
          aria-activedescendant={comboboxAria?.ariaActivedescendant}
          aria-autocomplete={comboboxAria?.ariaAutocomplete}
        />

        {url && (
          <div className='absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1'>
            {detectedLink && (
              <div
                className='flex items-center justify-center h-8 w-8 rounded-lg sm:h-6 sm:w-6 sm:rounded-full'
                style={{
                  backgroundColor: iconBg,
                  color: iconColor,
                }}
                aria-hidden='true'
              >
                <SocialIcon
                  platform={detectedLink.platform.icon}
                  className='h-4 w-4 sm:h-3 sm:w-3'
                />
              </div>
            )}
            <button
              type='button'
              onClick={onClear}
              className='flex items-center justify-center h-11 w-11 rounded-xl text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 active:scale-95 sm:h-8 sm:w-8 sm:rounded-full'
              aria-label='Clear input'
            >
              <X className='h-5 w-5 sm:h-4 sm:w-4' />
            </button>
          </div>
        )}
      </div>

      <div id='link-detection-status' className='sr-only' aria-live='polite'>
        {getLinkDetectionStatus(detectedLink, url)}
      </div>

      {url && !detectedLink?.isValid && (
        // role="status" is correct for hint announcements; <output> is for form results
        <div // NOSONAR S6819
          className='hidden text-xs text-secondary-token'
          role='status'
        >
          💡 Paste links from Spotify, Instagram, TikTok, YouTube, and more for
          automatic detection
        </div>
      )}
    </div>
  );
}
