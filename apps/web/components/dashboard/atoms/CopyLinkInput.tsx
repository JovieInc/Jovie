'use client';

/**
 * CopyLinkInput - A read-only input field with copy functionality
 *
 * Features:
 * - Displays URL in input-style container
 * - Copy icon button on the right
 * - Click to select all text
 * - Visual feedback on copy (green highlight)
 */

import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface CopyLinkInputProps {
  /** The URL to display and copy */
  url: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
  /** Callback when copy succeeds */
  onCopy?: () => void;
  /** Test ID for the component */
  testId?: string;
}

export function CopyLinkInput({
  url,
  size = 'md',
  className,
  onCopy,
  testId,
}: CopyLinkInputProps) {
  const [isCopied, setIsCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [url, onCopy]);

  const handleInputClick = () => {
    inputRef.current?.select();
  };

  return (
    <div className={cn('relative', className)} data-testid={testId}>
      <input
        ref={inputRef}
        type='text'
        readOnly
        value={url}
        onClick={handleInputClick}
        aria-label='URL to copy'
        className={cn(
          'w-full bg-surface-1 border border-subtle rounded-md pl-2 pr-8 py-1',
          'text-xs font-mono text-secondary-token truncate',
          'cursor-text focus:outline-none focus:ring-1 focus:ring-ring',
          'transition-colors',
          size === 'sm' && 'h-7',
          size === 'md' && 'h-8',
          isCopied &&
            'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700'
        )}
      />
      <button
        type='button'
        onClick={handleCopy}
        title={isCopied ? 'Copied!' : 'Copy to clipboard'}
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded',
          'text-tertiary-token hover:text-primary-token hover:bg-surface-2',
          'transition-colors',
          isCopied && 'text-green-600 dark:text-green-400'
        )}
      >
        <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
          <Icon
            name='Copy'
            className={cn(
              'absolute h-3.5 w-3.5 transition-all duration-150',
              isCopied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
            )}
            aria-hidden='true'
          />
          <Icon
            name='Check'
            className={cn(
              'absolute h-3.5 w-3.5 transition-all duration-150',
              isCopied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            )}
            aria-hidden='true'
          />
        </span>
        <span className='sr-only'>{isCopied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}
