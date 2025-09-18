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

        {/* Add button when URL is detected */}
        {showAddButton && (
          <div className='absolute right-1 flex items-center'>
            <Button
              onClick={handleAddLink}
              size='sm'
              disabled={isProcessing}
              className='h-10 px-4 bg-primary hover:bg-primary/90'
            >
              <PlusIcon className='h-4 w-4 mr-1.5' />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Helper text for detected link */}
      {detectedLink && (
        <div
          className={cn(
            'mt-2 text-sm',
            detectedLink.isValid
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          )}
        >
          {detectedLink.isValid ? (
            <span className='flex items-center gap-2'>
              <span className='font-medium'>{detectedLink.platform.name}</span>
              <span className='text-gray-500'>
                detected - press Enter or click Add
              </span>
            </span>
          ) : (
            <span>{detectedLink.error}</span>
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
