'use client';

import { XMarkIcon } from '@heroicons/react/20/solid';
import { Button } from '@jovie/ui';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Input } from '@/components/atoms/Input';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { isBrandDark } from '@/lib/utils/color';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

interface UniversalLinkInputProps {
  onAdd: (link: DetectedLink) => void;
  placeholder?: string;
  disabled?: boolean;
  existingPlatforms?: string[]; // Array of existing platform IDs to check for duplicates
  prefillUrl?: string; // optional prefill
  onPrefillConsumed?: () => void; // notify parent once we consume it
  creatorName?: string; // Creator's name for personalized link titles
  onQueryChange?: (value: string) => void; // mirror URL value for filtering/search
}

export interface UniversalLinkInputRef {
  getInputElement: () => HTMLInputElement | null;
}

export const UniversalLinkInput = forwardRef<
  UniversalLinkInputRef,
  UniversalLinkInputProps
>(
  (
    {
      onAdd,
      placeholder = 'Paste any link (Spotify, Instagram, TikTok, etc.)',
      disabled = false,
      existingPlatforms = [],
      prefillUrl,
      onPrefillConsumed,
      creatorName,
      onQueryChange,
    },
    forwardedRef
  ) => {
    const [url, setUrl] = useState('');
    const inputRef = useRef<HTMLDivElement>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);

    // If parent provides a prefill URL and we are empty, consume it once
    useEffect(() => {
      if (prefillUrl && !url) {
        setUrl(prefillUrl);
        onPrefillConsumed?.();
        onQueryChange?.(prefillUrl);
        // Focus input and position cursor at the end
        setTimeout(() => {
          const input = urlInputRef.current;
          if (input) {
            input.focus();
            // Position cursor at end of prefilled text
            const len = prefillUrl.length;
            input.setSelectionRange(len, len);
          }
        }, 0);
      }
      // Only react to changes of prefillUrl when url is empty to avoid overriding user typing
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillUrl]);

    // Real-time platform detection (uses creatorName for better SEO titles)
    const detectedLink = useMemo(() => {
      if (!url.trim()) return null;
      return detectPlatform(url.trim(), creatorName);
    }, [url, creatorName]);

    // Handle URL input changes (also used as combined search query)
    const handleUrlChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setUrl(value);
        onQueryChange?.(value);
      },
      [onQueryChange]
    );

    // Add link handler
    const handleAdd = useCallback(() => {
      if (!detectedLink || !detectedLink.isValid) return;

      const linkToAdd = {
        ...detectedLink,
      };

      onAdd(linkToAdd);

      // Reset form
      setUrl('');
      onQueryChange?.('');

      // Auto-focus the URL input after adding a link
      setTimeout(() => {
        inputRef.current?.querySelector('input')?.focus();
      }, 50);
    }, [detectedLink, onAdd, onQueryChange]);

    // Clear/cancel handler
    const handleClear = useCallback(() => {
      setUrl('');
      onQueryChange?.('');
      // Refocus input after clearing
      setTimeout(() => {
        urlInputRef.current?.focus();
      }, 0);
    }, [onQueryChange]);

    // Handle keyboard interactions
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && detectedLink?.isValid) {
          e.preventDefault();
          handleAdd();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleClear();
        }
      },
      [handleAdd, detectedLink, handleClear]
    );

    const brandColor = detectedLink?.platform.color
      ? `#${detectedLink.platform.color}`
      : '#6b7280'; // fallback gray-500

    // Use shared color utilities for brand icon styling
    const isDarkBrand = isBrandDark(brandColor);
    const iconColor = isDarkBrand ? '#ffffff' : brandColor;
    const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

    // Check if this platform already exists
    const isPlatformDuplicate = detectedLink
      ? existingPlatforms.includes(detectedLink.platform.id)
      : false;

    useImperativeHandle(forwardedRef, () => ({
      getInputElement: () => urlInputRef.current,
    }));

    return (
      <div className='relative w-full' ref={inputRef}>
        {/* URL Input */}
        <div className='relative'>
          <label htmlFor='link-url-input' className='sr-only'>
            Enter link URL
          </label>
          <Input
            ref={urlInputRef}
            id='link-url-input'
            type='url'
            placeholder={placeholder}
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            inputMode='url'
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            className='pr-24'
            aria-describedby={
              detectedLink ? 'link-detection-status' : undefined
            }
          />

          {/* Clear button and platform icon in input */}
          {url && (
            <div className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'>
              {/* Platform icon */}
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
              {/* Clear/cancel button */}
              <button
                type='button'
                onClick={handleClear}
                className='flex items-center justify-center w-5 h-5 rounded-full text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors'
                aria-label='Clear input'
              >
                <XMarkIcon className='w-4 h-4' />
              </button>
            </div>
          )}
        </div>

        {/* Screen reader status */}
        <div id='link-detection-status' className='sr-only' aria-live='polite'>
          {detectedLink
            ? detectedLink.isValid
              ? `${detectedLink.platform.name} link detected. Title set automatically based on your profile and URL. You can now add this link.`
              : `Invalid ${detectedLink.platform.name} link. ${detectedLink.error || 'Please check the URL.'}`
            : url
              ? 'No valid link detected. Please enter a valid URL.'
              : ''}
        </div>

        {/* Link preview */}
        {detectedLink && (
          <div
            className={`-mt-px p-3 rounded-b-lg border border-t-0 transition-all duration-200 ${
              isPlatformDuplicate
                ? 'border-red-200 bg-red-50 dark:border-red-500/70 dark:bg-zinc-900/80'
                : detectedLink.isValid
                  ? 'border-gray-200 bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900/80'
                  : 'border-red-200 bg-red-50/50 dark:border-red-500/70 dark:bg-zinc-900/80'
            }`}
            style={
              detectedLink.isValid && !isPlatformDuplicate
                ? { borderColor: `${brandColor}40` }
                : undefined
            }
            role='region'
            aria-label='Link preview'
          >
            <div className='flex items-start gap-3'>
              {/* Platform icon */}
              <div
                className='flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5'
                style={{
                  backgroundColor: iconBg,
                  color: iconColor,
                }}
                aria-hidden='true'
              >
                <SocialIcon
                  platform={detectedLink.platform.icon}
                  className='w-4 h-4'
                />
              </div>

              <div className='flex-1 min-w-0'>
                {/* Platform name - primary focus */}
                <div className='flex items-center gap-2'>
                  <span className='font-semibold text-base text-primary-token'>
                    {detectedLink.platform.name}
                  </span>
                  {detectedLink.isValid && !isPlatformDuplicate && (
                    <span className='text-green-500 text-xs'>
                      ✓ Ready to add
                    </span>
                  )}
                </div>

                {/* URL preview - secondary */}
                <div className='text-xs text-tertiary-token truncate mt-0.5'>
                  {detectedLink.normalizedUrl}
                </div>

                {/* Duplicate platform warning */}
                {isPlatformDuplicate && (
                  <div
                    className='text-xs text-amber-600 dark:text-amber-400 mt-2'
                    role='alert'
                  >
                    You already have a {detectedLink.platform.name} link. Adding
                    another may confuse visitors.
                  </div>
                )}

                {/* Validation error - friendly language */}
                {!detectedLink.isValid && detectedLink.error && (
                  <div
                    className='text-xs text-red-500 dark:text-red-400 mt-2'
                    role='alert'
                  >
                    {detectedLink.error}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className='flex items-center gap-2 shrink-0'>
                <button
                  type='button'
                  onClick={handleClear}
                  className='flex items-center justify-center w-8 h-8 rounded-lg text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors'
                  aria-label='Cancel'
                >
                  <XMarkIcon className='w-5 h-5' />
                </button>
                <Button
                  onClick={handleAdd}
                  disabled={
                    disabled || !detectedLink.isValid || isPlatformDuplicate
                  }
                  variant='primary'
                  size='sm'
                  aria-label={
                    isPlatformDuplicate
                      ? `Cannot add duplicate ${detectedLink.platform.name} link`
                      : `Add ${detectedLink.platform.name}`
                  }
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Validation hint */}
        {url && !detectedLink?.isValid && (
          <div className='text-xs text-secondary-token' role='status'>
            💡 Paste links from Spotify, Instagram, TikTok, YouTube, and more
            for automatic detection
          </div>
        )}
      </div>
    );
  }
);

UniversalLinkInput.displayName = 'UniversalLinkInput';
