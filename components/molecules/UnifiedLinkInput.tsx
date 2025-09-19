'use client';

import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

interface UnifiedLinkInputProps {
  onSearch: (query: string) => void;
  onAddLink: (url: string, detectedInfo: DetectedLink) => void;
  existingLinkCount: number;
  className?: string;
  autoFocus?: boolean;
}

export function UnifiedLinkInput({
  onSearch,
  onAddLink,
  existingLinkCount,
  className,
  autoFocus = false,
}: UnifiedLinkInputProps) {
  const [value, setValue] = React.useState('');
  const [detectedLink, setDetectedLink] = React.useState<DetectedLink | null>(
    null
  );
  const [isProcessing, setIsProcessing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Detect if input is a URL or search query
  React.useEffect(() => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      setDetectedLink(null);
      onSearch('');
      return;
    }

    // Check if it looks like a URL (contains a dot or common protocol)
    const looksLikeUrl =
      trimmedValue.includes('.') ||
      trimmedValue.startsWith('http') ||
      trimmedValue.startsWith('@'); // Twitter/Instagram handles

    if (looksLikeUrl) {
      // Detect platform from URL
      const detected = detectPlatform(trimmedValue);
      setDetectedLink(detected);

      // Still search existing links to check for duplicates
      onSearch(trimmedValue);
    } else {
      // Regular search
      setDetectedLink(null);
      onSearch(trimmedValue);
    }
  }, [value, onSearch]);

  const handleAddLink = React.useCallback(() => {
    if (!detectedLink || !detectedLink.isValid) return;

    setIsProcessing(true);
    onAddLink(detectedLink.normalizedUrl, detectedLink);

    // Clear input and reset state
    setTimeout(() => {
      setValue('');
      setDetectedLink(null);
      setIsProcessing(false);
      inputRef.current?.focus();
    }, 100);
  }, [detectedLink, onAddLink]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && detectedLink?.isValid) {
      e.preventDefault();
      handleAddLink();
    }
  };

  const placeholder =
    existingLinkCount === 0
      ? 'Paste any link - Instagram, Spotify, YouTube, TikTok...'
      : 'Search links or paste a new URL...';

  const showAddButton = detectedLink?.isValid;
  const showSearchIcon = !detectedLink && value.length > 0;

  return (
    <div className={cn('relative w-full', className)}>
      <div className='relative flex items-center'>
        {/* Icon indicator */}
        <div className='absolute left-3 flex items-center pointer-events-none'>
          {detectedLink ? (
            <SocialIcon
              platform={detectedLink.platform.id}
              className='h-5 w-5 text-gray-400'
            />
          ) : showSearchIcon ? (
            <MagnifyingGlassIcon className='h-5 w-5 text-gray-400' />
          ) : (
            <div className='h-5 w-5 text-gray-400'>
              <svg
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                className='w-full h-full'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={1.5}
                  d='M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244'
                />
              </svg>
            </div>
          )}
        </div>

        {/* Main input */}
        <Input
          ref={inputRef}
          type='text'
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'pl-10 pr-3 h-12 text-base',
            'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700',
            'focus:bg-white dark:focus:bg-gray-800',
            'transition-colors',
            showAddButton && 'pr-24'
          )}
          autoFocus={autoFocus}
          disabled={isProcessing}
        />

        {/* Enhanced Add button when URL is detected */}
        {showAddButton && (
          <div className='absolute right-1 flex items-center'>
            <Button
              onClick={handleAddLink}
              size='sm'
              disabled={isProcessing}
              className={cn(
                'h-10 px-4 transition-all duration-200',
                isProcessing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 dark:shadow-green-900/30'
              )}
            >
              {isProcessing ? (
                <>
                  <svg
                    className='h-4 w-4 mr-1.5 animate-spin'
                    fill='none'
                    viewBox='0 0 24 24'
                  >
                    <circle
                      className='opacity-25'
                      cx='12'
                      cy='12'
                      r='10'
                      stroke='currentColor'
                      strokeWidth='4'
                    />
                    <path
                      className='opacity-75'
                      fill='currentColor'
                      d='m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                    />
                  </svg>
                  Adding...
                </>
              ) : (
                <>
                  <PlusIcon className='h-4 w-4 mr-1.5' />
                  Add Link
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Enhanced helper text for detected link */}
      {detectedLink && (
        <div
          className={cn(
            'mt-3 p-3 rounded-lg border transition-all duration-200',
            detectedLink.isValid
              ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
              : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
          )}
        >
          {detectedLink.isValid ? (
            <div className='flex items-center gap-3'>
              <div className='flex-shrink-0'>
                <div className='w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center'>
                  <svg
                    className='w-4 h-4 text-green-600 dark:text-green-400'
                    fill='currentColor'
                    viewBox='0 0 20 20'
                  >
                    <path
                      fillRule='evenodd'
                      d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                      clipRule='evenodd'
                    />
                  </svg>
                </div>
              </div>
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-medium text-green-800 dark:text-green-200'>
                  {detectedLink.platform.name} detected!
                </p>
                <p className='text-xs text-green-600 dark:text-green-400 mt-0.5'>
                  Press Enter or click Add to continue
                </p>
              </div>
            </div>
          ) : (
            <div className='flex items-start gap-3'>
              <div className='flex-shrink-0'>
                <div className='w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center'>
                  <svg
                    className='w-4 h-4 text-red-600 dark:text-red-400'
                    fill='currentColor'
                    viewBox='0 0 20 20'
                  >
                    <path
                      fillRule='evenodd'
                      d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z'
                      clipRule='evenodd'
                    />
                  </svg>
                </div>
              </div>
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-medium text-red-800 dark:text-red-200'>
                  Invalid link format
                </p>
                <p className='text-xs text-red-600 dark:text-red-400 mt-0.5'>
                  {detectedLink.error}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state helper */}
      {existingLinkCount === 0 && !value && (
        <div className='mt-3 text-sm text-gray-500 dark:text-gray-400 text-center'>
          💡 Just paste any social media or music platform link above
        </div>
      )}
    </div>
  );
}
