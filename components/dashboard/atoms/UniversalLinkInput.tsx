'use client';

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
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Input } from '@/components/ui/Input';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

interface UniversalLinkInputProps {
  onAdd: (link: DetectedLink) => void;
  placeholder?: string;
  disabled?: boolean;
  existingPlatforms?: string[]; // Array of existing platform IDs to check for duplicates
  // Quota indicators (optional)
  socialVisibleCount?: number;
  socialVisibleLimit?: number; // default 6
  prefillUrl?: string; // optional prefill
  onPrefillConsumed?: () => void; // notify parent once we consume it
  creatorName?: string; // Creator's name for personalized link titles
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
      socialVisibleCount = 0,
      socialVisibleLimit = 6,
      prefillUrl,
      onPrefillConsumed,
    },
    forwardedRef
  ) => {
    const [url, setUrl] = useState('');
    const [customTitle, setCustomTitle] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLDivElement>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);

    // If parent provides a prefill URL and we are empty, consume it once
    useEffect(() => {
      if (prefillUrl && !url) {
        setUrl(prefillUrl);
        onPrefillConsumed?.();
        // focus input so user can hit Enter quickly
        setTimeout(() => inputRef.current?.querySelector('input')?.focus(), 0);
      }
      // Only react to changes of prefillUrl when url is empty to avoid overriding user typing
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillUrl]);

    // Real-time platform detection
    const detectedLink = useMemo(() => {
      if (!url.trim()) return null;
      return detectPlatform(url.trim());
    }, [url]);

    // Handle URL input changes
    const handleUrlChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(e.target.value);
        // Reset custom title when URL changes
        if (customTitle && !isEditing) {
          setCustomTitle('');
        }
      },
      [customTitle, isEditing]
    );

    // Handle title editing
    const handleTitleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomTitle(e.target.value);
        setIsEditing(true);
      },
      []
    );

    // Add link handler
    const handleAdd = useCallback(() => {
      if (!detectedLink || !detectedLink.isValid) return;

      const linkToAdd = {
        ...detectedLink,
        suggestedTitle: customTitle || detectedLink.suggestedTitle,
      };

      onAdd(linkToAdd);

      // Reset form
      setUrl('');
      setCustomTitle('');
      setIsEditing(false);

      // Auto-focus the URL input after adding a link
      setTimeout(() => {
        inputRef.current?.querySelector('input')?.focus();
      }, 50);
    }, [detectedLink, customTitle, onAdd]);

    // Handle keyboard interactions
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && detectedLink?.isValid) {
          e.preventDefault();
          handleAdd();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Clear the input and reset state
          setUrl('');
          setCustomTitle('');
          setIsEditing(false);
        }
      },
      [handleAdd, detectedLink, setUrl, setCustomTitle, setIsEditing]
    );

    const displayTitle = customTitle || detectedLink?.suggestedTitle || '';
    const brandColor = detectedLink?.platform.color
      ? `#${detectedLink.platform.color}`
      : '#6b7280'; // fallback gray-500

    // Utilities for color contrast handling
    const hexToRgb = (hex: string) => {
      const h = hex.replace('#', '');
      const bigint = parseInt(h, 16);
      return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
      };
    };
    const relativeLuminance = (hex: string) => {
      const { r, g, b } = hexToRgb(hex);
      const [R, G, B] = [r, g, b].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    const isDarkBrand = relativeLuminance(brandColor) < 0.35; // Treat very dark brands (e.g., TikTok black) specially
    const readableTextIsWhite = relativeLuminance(brandColor) < 0.6; // heuristic for button text
    const iconColor = isDarkBrand ? '#ffffff' : brandColor;
    const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

    // Check if this platform already exists
    const isPlatformDuplicate = detectedLink
      ? existingPlatforms.includes(detectedLink.platform.id)
      : false;
    const effectiveBrandColor = isPlatformDuplicate
      ? 'rgb(var(--text-accent))'
      : brandColor;

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

          {/* Platform icon in input */}
          {detectedLink && (
            <div
              className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'
              aria-hidden='true'
            >
              <div
                className='flex items-center justify-center w-6 h-6 rounded-full'
                style={{
                  backgroundColor: iconBg,
                  color: iconColor,
                }}
              >
                <SocialIcon
                  platform={detectedLink.platform.icon}
                  className='w-3 h-3'
                />
              </div>
            </div>
          )}
        </div>

        {/* Screen reader status */}
        <div id='link-detection-status' className='sr-only' aria-live='polite'>
          {detectedLink
            ? detectedLink.isValid
              ? `${detectedLink.platform.name} link detected. You can now add a title and add this link.`
              : `Invalid ${detectedLink.platform.name} link. ${detectedLink.error || 'Please check the URL.'}`
            : url
              ? 'No valid link detected. Please enter a valid URL.'
              : ''}
        </div>

        {/* Link preview & title editing */}
        {detectedLink && (
          <div
            className={`p-3 rounded-lg border transition-all duration-200 ${
              isPlatformDuplicate
                ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                : detectedLink.isValid
                  ? 'border-surface-2 bg-surface-1'
                  : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/10'
            }`}
            style={
              detectedLink.isValid && !isPlatformDuplicate
                ? {
                    borderColor: `${brandColor}30`,
                    backgroundColor: `${brandColor}08`,
                  }
                : {}
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
                {/* Platform name and category */}
                <div className='flex items-center gap-2 mb-2'>
                  <span className='font-medium text-sm text-primary-token'>
                    {detectedLink.platform.name}
                  </span>
                  <span
                    className='text-xs px-2 py-0.5 rounded-full'
                    style={{
                      backgroundColor: `${effectiveBrandColor}20`,
                      color: effectiveBrandColor,
                    }}
                  >
                    {detectedLink.platform.category === 'dsp'
                      ? 'Music Service'
                      : detectedLink.platform.category === 'social'
                        ? 'Social'
                        : 'Custom'}
                  </span>
                </div>

                {/* Title input */}
                <label htmlFor='link-title-input' className='sr-only'>
                  Link title
                </label>
                <Input
                  id='link-title-input'
                  type='text'
                  placeholder='Link title'
                  value={displayTitle}
                  onChange={handleTitleChange}
                  onKeyDown={handleKeyDown}
                  disabled={disabled}
                  inputMode='text'
                  autoCapitalize='words'
                  autoCorrect='on'
                  autoComplete='off'
                  className='text-sm mb-2'
                  aria-required='true'
                  aria-invalid={!displayTitle.trim() ? 'true' : 'false'}
                />

                {/* URL preview */}
                <div className='text-xs text-secondary-token truncate'>
                  {detectedLink.normalizedUrl}
                </div>

                {/* Duplicate platform warning */}
                {isPlatformDuplicate && (
                  <div
                    className='text-xs text-red-600 dark:text-red-400 mt-1 p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800'
                    role='alert'
                  >
                    <div className='font-medium mb-1'>
                      ⚠️ Duplicate Platform Detected
                    </div>
                    <div>
                      You already have a {detectedLink.platform.name} link.
                      Having multiple links to the same platform creates
                      decision paralysis for visitors, leading to lower
                      engagement and fewer conversions. Consider replacing your
                      existing {detectedLink.platform.name} link instead.
                    </div>
                  </div>
                )}

                {/* Validation error */}
                {!detectedLink.isValid && detectedLink.error && (
                  <div
                    className='text-xs text-red-600 dark:text-red-400 mt-1'
                    role='alert'
                  >
                    {detectedLink.error}
                  </div>
                )}
              </div>

              {/* Add button + quota */}
              <div className='flex flex-col items-end gap-1'>
                <Button
                  onClick={handleAdd}
                  disabled={
                    disabled ||
                    !detectedLink.isValid ||
                    !displayTitle.trim() ||
                    isPlatformDuplicate
                  }
                  size='sm'
                  style={{
                    backgroundColor:
                      detectedLink.isValid && !isPlatformDuplicate
                        ? brandColor
                        : undefined,
                  }}
                  className={`${
                    !detectedLink.isValid || isPlatformDuplicate
                      ? 'opacity-50'
                      : ''
                  } ${readableTextIsWhite ? 'text-white dark:text-white' : 'text-black dark:text-black'}`}
                  aria-label={
                    isPlatformDuplicate
                      ? `Cannot add duplicate ${detectedLink.platform.name} link`
                      : `Add ${detectedLink.platform.name}`
                  }
                >
                  {`Add ${detectedLink.platform.name}`}
                </Button>

                {/* Quota badge (muted) */}
                <div className='text-[11px] text-secondary-token'>
                  {detectedLink.platform.category === 'social' ? (
                    <span>
                      {Math.min(socialVisibleCount, socialVisibleLimit)}/
                      {socialVisibleLimit} visible
                    </span>
                  ) : (
                    <span>No limit</span>
                  )}
                </div>
                {/* Cap reached helper */}
                {detectedLink.platform.category === 'social' &&
                  socialVisibleCount >= socialVisibleLimit && (
                    <div className='text-[11px] text-secondary-token max-w-[220px] text-right'>
                      Limit reached: new social links will be hidden until you
                      unhide or hide another.
                    </div>
                  )}
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

export default UniversalLinkInput;
