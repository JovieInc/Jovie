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

interface UniversalLinkInputUrlModeProps {
  url: string;
  placeholder: string;
  disabled?: boolean;
  detectedLink: DetectedLink | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUrlChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onPlatformSelect: (platform: (typeof PLATFORM_OPTIONS)[number]) => void;
  onArtistSearchSelect: (provider: ArtistSearchProvider) => void;
  onRestoreFocus: (cursor?: CursorPosition) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  comboboxAria?: {
    role?: 'combobox';
    ariaExpanded?: boolean;
    ariaControls?: string;
    ariaActivedescendant?: string;
    ariaAutocomplete?: 'list';
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
  onClear,
  onPlatformSelect,
  onArtistSearchSelect,
  onRestoreFocus,
  onFocus,
  onBlur,
  comboboxAria,
}: UniversalLinkInputUrlModeProps) {
  const currentPlatformIcon = detectedLink?.platform.icon || 'globe';
  const brandColor = detectedLink?.platform.color
    ? `#${detectedLink.platform.color}`
    : '#6b7280';

  const isDarkBrand = isBrandDark(brandColor.toString());
  const iconColor = isDarkBrand ? '#ffffff' : brandColor;
  const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

  return (
    <div className='relative w-full'>
      <div
        className={cn(
          'relative flex w-full items-center gap-2 rounded-full border border-default bg-surface-1 px-2 py-1 shadow-xs transition-colors',
          'focus-within:ring-2 focus-within:ring-accent',
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
          <div className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'>
            {detectedLink && (
              <div
                className='flex items-center justify-center w-6 h-6 rounded-full'
                style={{
                  backgroundColor: iconBg,
                  color: iconColor,
                }}
                aria-hidden='true'
              >
                <SocialIcon
                  platform={detectedLink.platform.icon}
                  className='w-3 h-3'
                />
              </div>
            )}
            <button
              type='button'
              onClick={onClear}
              className='flex items-center justify-center w-5 h-5 rounded-full text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
              aria-label='Clear input'
            >
              <X className='w-4 h-4' />
            </button>
          </div>
        )}
      </div>

      <div id='link-detection-status' className='sr-only' aria-live='polite'>
        {detectedLink
          ? detectedLink.isValid
            ? `${detectedLink.platform.name} link detected. Title set automatically based on your profile and URL. You can now add this link.`
            : `Invalid ${detectedLink.platform.name} link. ${detectedLink.error || 'Please check the URL.'}`
          : url
            ? 'No valid link detected. Please enter a valid URL.'
            : ''}
      </div>

      {url && !detectedLink?.isValid && (
        // biome-ignore lint/a11y/useSemanticElements: status role needed for accessible hint announcement
        <div className='hidden text-xs text-secondary-token' role='status'>
          💡 Paste links from Spotify, Instagram, TikTok, YouTube, and more for
          automatic detection
        </div>
      )}
    </div>
  );
}
