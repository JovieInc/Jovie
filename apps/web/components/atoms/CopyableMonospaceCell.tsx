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
    return <span className='text-tertiary-token'>—</span>;
  }

  return (
    <button
      type='button'
      onClick={handleCopy}
      className={cn(
        'group/copy inline-flex items-center gap-1 font-mono text-xs text-secondary-token hover:text-primary-token',
        className
      )}
      title={`Copy ${label}`}
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
            : 'opacity-0 group-hover/copy:opacity-60'
        )}
      />
    </button>
  );
});
