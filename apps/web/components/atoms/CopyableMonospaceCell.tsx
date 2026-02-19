'use client';

import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

interface CopyableMonospaceCellProps {
  readonly value: string | null | undefined;
  readonly label: string;
  readonly maxWidth?: number;
  readonly className?: string;
  readonly copied?: boolean;
  readonly onCopy?: () => void;
}

export const CopyableMonospaceCell = memo(function CopyableMonospaceCell({
  value,
  label,
  maxWidth = 100,
  className,
  copied = false,
  onCopy,
}: CopyableMonospaceCellProps) {
  if (!value) {
    return <span className='text-tertiary-token'>—</span>;
  }

  return (
    <button
      type='button'
      onClick={onCopy}
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
