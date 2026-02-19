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

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface CopyLinkInputProps {
  /** The URL to display and copy */
  readonly url: string;
  /** Size variant */
  readonly size?: 'sm' | 'md';
  /** Additional CSS classes */
  readonly className?: string;
  /**
   * Prevent click bubbling to parents (e.g. table row navigation).
   * Defaults to false.
   */
  readonly stopPropagation?: boolean;
  /** Callback when copy succeeds (does not need to write to clipboard) */
  readonly onCopy?: () => void;
  /** Test ID for the component */
  readonly testId?: string;
}

export function CopyLinkInput({
  url,
  size = 'md',
  className,
  stopPropagation = false,
  onCopy,
  testId,
}: CopyLinkInputProps) {
  const [isCopied, setIsCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(
    async (e?: MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        e?.stopPropagation();
      }

      try {
        await navigator.clipboard.writeText(url);
        setIsCopied(true);
        onCopy?.();

        // Clear any existing timeout before setting a new one
        if (copyResetTimeoutRef.current) {
          clearTimeout(copyResetTimeoutRef.current);
        }
        copyResetTimeoutRef.current = setTimeout(
          () => setIsCopied(false),
          2000
        );
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    },
    [url, onCopy, stopPropagation]
  );

  const handleInputClick = (e: MouseEvent<HTMLInputElement>) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
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
          'cursor-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
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
          isCopied && 'text-success'
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
