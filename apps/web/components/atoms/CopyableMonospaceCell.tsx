'use client';

import { memo, useCallback, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

interface CopyableMonospaceCellProps {
  /** The value to display and copy */
  readonly value: string | null | undefined;
  /** Label for the copy tooltip (e.g., "ISRC", "UPC") */
  readonly label: string;
  /** Maximum width for truncation (default: 100px) */
  readonly maxWidth?: number;
  /** Additional class name */
  readonly className?: string;
}

/**
 * CopyableMonospaceCell - Display a monospace value with copy functionality
 *
 * Used for technical identifiers like ISRC, UPC, IDs, etc.
 * Shows a copy icon on hover and provides visual feedback on copy.
 */
export const CopyableMonospaceCell = memo(function CopyableMonospaceCell({
  value,
  label,
  maxWidth = 100,
  className,
}: CopyableMonospaceCellProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  if (!value) {
    return (
      <span className='text-[11px] font-[450] text-(--linear-text-tertiary)'>
        —
      </span>
    );
  }

  return (
    <button
      type='button'
      onClick={handleCopy}
      className={cn(
        'group/copy -mx-1 inline-flex h-6 items-center gap-1 rounded-[7px] border border-transparent px-1 py-0.5 font-mono text-[11px] text-(--linear-text-secondary) transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
        className
      )}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      <span
        className='truncate'
        style={{ maxWidth: `${maxWidth}px` }}
        title={value}
      >
        {value}
      </span>
      <Icon
        name={copied ? 'Check' : 'Copy'}
        className={cn(
          'h-3 w-3 transition-opacity',
          copied
            ? 'text-success opacity-100'
            : 'opacity-0 group-hover/copy:opacity-70 group-focus-visible/copy:opacity-70'
        )}
      />
      <span className='sr-only' aria-live='polite'>
        {copied ? `${label} copied` : ''}
      </span>
    </button>
  );
});
