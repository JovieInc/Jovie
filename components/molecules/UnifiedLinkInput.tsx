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
import {
  getAutoCorrection,
  getSmartURLSuggestions,
  type URLSuggestion,
} from '@/lib/utils/smart-url-correction';

interface UnifiedLinkInputProps {
  onSearch: (query: string) => void;
  onAddLink: (url: string, detectedInfo: DetectedLink) => void;
  existingLinkCount: number;
  className?: string;
  autoFocus?: boolean;
}

export const UnifiedLinkInput = React.forwardRef<
  HTMLInputElement,
  UnifiedLinkInputProps
>(function UnifiedLinkInput(
  { onSearch, onAddLink, existingLinkCount, className, autoFocus = false },
  ref
) {
  const [value, setValue] = React.useState('');
  const [detectedLink, setDetectedLink] = React.useState<DetectedLink | null>(
    null
  );
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [validationState, setValidationState] = React.useState<
    'idle' | 'validating' | 'valid' | 'invalid'
  >('idle');
  const [suggestions, setSuggestions] = React.useState<URLSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [autoCorrection, setAutoCorrection] =
    React.useState<URLSuggestion | null>(null);
  const internalRef = React.useRef<HTMLInputElement>(null);
  const inputRef = ref || internalRef;
  const validationTimeoutRef = React.useRef<NodeJS.Timeout>();
  const suggestionsTimeoutRef = React.useRef<NodeJS.Timeout>();

  // Detect if input is a URL or search query with debounced validation
  React.useEffect(() => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      setDetectedLink(null);
      setValidationState('idle');
      setSuggestions([]);
      setShowSuggestions(false);
      setAutoCorrection(null);
      onSearch('');
      return;
    }

    // Clear previous timeouts
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    if (suggestionsTimeoutRef.current) {
      clearTimeout(suggestionsTimeoutRef.current);
    }

    // Check if it looks like a URL (contains a dot or common protocol)
    const looksLikeUrl =
      trimmedValue.includes('.') ||
      trimmedValue.includes('@') || // Social handles
      trimmedValue.toLowerCase().includes('http') ||
      trimmedValue.includes('/'); // Paths

    if (looksLikeUrl) {
      setValidationState('validating');

      // Debounced validation (300ms)
      validationTimeoutRef.current = setTimeout(() => {
        // Get smart suggestions first
        const smartSuggestions = getSmartURLSuggestions(trimmedValue);
        const autoCorrect = getAutoCorrection(trimmedValue);

        setSuggestions(smartSuggestions);
        setAutoCorrection(autoCorrect);

        // If we have a high-confidence auto-correction, use it
        const urlToDetect = autoCorrect?.suggested || trimmedValue;

        // Detect platform from URL (potentially corrected)
        const detected = detectPlatform(urlToDetect);
        setDetectedLink(detected);
        setValidationState(detected.isValid ? 'valid' : 'invalid');

        // Show suggestions if URL is invalid but we have suggestions
        if (!detected.isValid && smartSuggestions.length > 0) {
          setShowSuggestions(true);
        } else {
          setShowSuggestions(false);
        }

        // Still search existing links to check for duplicates
        onSearch(trimmedValue);
      }, 300);

      // Show suggestions after a longer delay if still typing
      suggestionsTimeoutRef.current = setTimeout(() => {
        const smartSuggestions = getSmartURLSuggestions(trimmedValue);
        if (smartSuggestions.length > 0) {
          setSuggestions(smartSuggestions);
          setShowSuggestions(true);
        }
      }, 800);
    } else {
      // Regular search
      setDetectedLink(null);
      setValidationState('idle');
      setSuggestions([]);
      setShowSuggestions(false);
      setAutoCorrection(null);
      onSearch(trimmedValue);
    }

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
      if (suggestionsTimeoutRef.current) {
        clearTimeout(suggestionsTimeoutRef.current);
      }
    };
  }, [value, onSearch]);

  // Handle suggestion selection
  const handleSuggestionSelect = React.useCallback(
    (suggestion: URLSuggestion) => {
      setValue(suggestion.suggested);
      setShowSuggestions(false);
      setSuggestions([]);
      setAutoCorrection(null);

      // Focus input for immediate validation
      setTimeout(() => {
        if (inputRef && 'current' in inputRef) {
          inputRef.current?.focus();
        }
      }, 50);
    },
    [inputRef]
  );

  const handleAddLink = React.useCallback(() => {
    if (!detectedLink || !detectedLink.isValid) return;

    setIsProcessing(true);
    onAddLink(detectedLink.normalizedUrl, detectedLink);

    // Clear input and reset state
    setTimeout(() => {
      setValue('');
      setDetectedLink(null);
      setSuggestions([]);
      setShowSuggestions(false);
      setAutoCorrection(null);
      setIsProcessing(false);
      if (inputRef && 'current' in inputRef) {
        inputRef.current?.focus();
      }
    }, 100);
  }, [detectedLink, onAddLink, inputRef]);

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
        {/* Icon indicator with validation state */}
        <div className='absolute left-3 flex items-center pointer-events-none'>
          {validationState === 'validating' ? (
            <div className='h-5 w-5'>
              <svg
                className='animate-spin h-5 w-5 text-gray-400'
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
            </div>
          ) : validationState === 'valid' && detectedLink ? (
            <div className='relative'>
              <SocialIcon
                platform={detectedLink.platform.id}
                className='h-5 w-5'
              />
              <div className='absolute -right-1 -bottom-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center'>
                <svg
                  className='w-2 h-2 text-white'
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
          ) : validationState === 'invalid' ? (
            <div className='h-5 w-5 text-red-500'>
              <svg fill='currentColor' viewBox='0 0 20 20'>
                <path
                  fillRule='evenodd'
                  d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z'
                  clipRule='evenodd'
                />
              </svg>
            </div>
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

        {/* Main input with validation border */}
        <Input
          ref={inputRef}
          type='text'
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'pl-10 pr-3 h-12 text-base transition-all duration-200',
            'bg-gray-50 dark:bg-gray-900',
            'focus:bg-white dark:focus:bg-gray-800',
            validationState === 'valid' &&
              'border-green-400 focus:border-green-500',
            validationState === 'invalid' &&
              'border-red-400 focus:border-red-500',
            validationState === 'idle' &&
              'border-gray-200 dark:border-gray-700',
            validationState === 'validating' && 'border-blue-300',
            showAddButton && 'pr-24'
          )}
          autoFocus={autoFocus}
          disabled={isProcessing}
        />

        {/* Real-time validation indicator */}
        {validationState === 'valid' && !showAddButton && (
          <div className='absolute right-3 text-green-500'>
            <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 20 20'>
              <path
                fillRule='evenodd'
                d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                clipRule='evenodd'
              />
            </svg>
          </div>
        )}

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

      {/* Smart Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className='mt-3'>
          <div className='text-xs font-medium text-gray-700 dark:text-gray-300 mb-2'>
            {autoCorrection ? 'Did you mean?' : 'Suggestions:'}
          </div>
          <div className='space-y-2'>
            {suggestions.slice(0, 4).map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionSelect(suggestion)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700',
                  'hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600',
                  'transition-all duration-200 group',
                  suggestion.confidence === 'high' &&
                    'ring-1 ring-blue-200 dark:ring-blue-800 bg-blue-50/50 dark:bg-blue-950/20'
                )}
              >
                <div className='flex items-center justify-between'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2'>
                      {suggestion.platform && (
                        <SocialIcon
                          platform={suggestion.platform}
                          className='h-4 w-4 flex-shrink-0'
                        />
                      )}
                      {suggestion.type === 'typo-fix' && (
                        <div className='w-4 h-4 flex-shrink-0 text-orange-500'>
                          <svg fill='currentColor' viewBox='0 0 20 20'>
                            <path
                              fillRule='evenodd'
                              d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z'
                              clipRule='evenodd'
                            />
                          </svg>
                        </div>
                      )}
                      {suggestion.type === 'format-fix' && (
                        <div className='w-4 h-4 flex-shrink-0 text-blue-500'>
                          <svg fill='currentColor' viewBox='0 0 20 20'>
                            <path
                              fillRule='evenodd'
                              d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                              clipRule='evenodd'
                            />
                          </svg>
                        </div>
                      )}
                      <div className='min-w-0 flex-1'>
                        <div className='font-medium text-sm text-gray-900 dark:text-gray-100 truncate'>
                          {suggestion.suggested}
                        </div>
                        <div className='text-xs text-gray-500 dark:text-gray-400'>
                          {suggestion.reason}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className='flex items-center gap-2 ml-3'>
                    {suggestion.confidence === 'high' && (
                      <span className='text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full dark:bg-green-900/30 dark:text-green-300'>
                        Recommended
                      </span>
                    )}
                    <div className='opacity-0 group-hover:opacity-100 transition-opacity'>
                      <svg
                        className='w-4 h-4 text-gray-400'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z'
                          clipRule='evenodd'
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {autoCorrection && (
            <div className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
              💡 We&apos;ll automatically use the recommended suggestion if you
              continue
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
});
