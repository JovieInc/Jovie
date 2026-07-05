'use client';

/**
 * CopyLinkInput - A read-only input field with copy functionality
 *
 * Features:
 * - Displays URL in input-style container
 * - Copy icon button on the right
 * - Click to select all text
 * - Visual feedback on copy
 */

import { Button } from '@jovie/ui';
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
  /** Optional display value shown in the input (copies `url` to clipboard) */
  readonly displayValue?: string;
  /** Size variant */
  readonly size?: 'sm' | 'md';
  /** Additional CSS classes */
  readonly className?: string;
  /** Additional CSS classes for the input element */
  readonly inputClassName?: string;
  /** Additional CSS classes for the copy button */
  readonly buttonClassName?: string;
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
  displayValue,
  size = 'md',
  className,
  inputClassName,
  buttonClassName,
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
        value={displayValue ?? url}
        onClick={handleInputClick}
        aria-label='URL To Copy'
        data-copied={isCopied ? 'true' : undefined}
        className={cn(
          'system-b-copy-link-input w-full rounded-full border px-2.5 py-1.5 pr-9',
          'truncate font-mono text-app',
          'cursor-text focus-visible:outline-none',
          size === 'sm' && 'h-7',
          size === 'md' && 'h-9',
          inputClassName
        )}
      />
      <Button
        type='button'
        variant='ghost'
        size='icon'
        onClick={handleCopy}
        aria-label={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
        title={isCopied ? 'Copied!' : 'Copy to clipboard'}
        data-copied={isCopied ? 'true' : undefined}
        className={cn(
          'absolute inset-y-0 right-1.5 my-auto h-6 w-6 rounded-full border p-1',
          isCopied
            ? 'border-success/20 bg-success-subtle text-success'
            : 'border-transparent text-tertiary-token hover:border-subtle hover:bg-surface-1 hover:text-primary-token',
          buttonClassName
        )}
      >
        <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
          <Icon
            name='Copy'
            className='system-b-copy-link-icon absolute h-3.5 w-3.5'
            data-visible={isCopied ? 'false' : 'true'}
            aria-hidden='true'
          />
          <Icon
            name='Check'
            className='system-b-copy-link-icon absolute h-3.5 w-3.5'
            data-visible={isCopied ? 'true' : 'false'}
            aria-hidden='true'
          />
        </span>
        <span className='sr-only'>{isCopied ? 'Copied' : 'Copy'}</span>
      </Button>
    </div>
  );
}
