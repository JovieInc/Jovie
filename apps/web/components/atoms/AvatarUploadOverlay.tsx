'use client';

import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROUNDED_MAP = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const;

export interface AvatarUploadOverlayProps {
  /** Size of the upload icon relative to avatar */
  readonly iconSize: number;
  /** Whether this is a drag-over state (more prominent) */
  readonly isDragOver?: boolean;
  /** Border radius style — should match the Avatar's rounded prop */
  readonly rounded?: keyof typeof ROUNDED_MAP;
}

export function AvatarUploadOverlay({
  iconSize,
  isDragOver = false,
  rounded = 'full',
}: AvatarUploadOverlayProps) {
  const roundedClass = ROUNDED_MAP[rounded];

  if (isDragOver) {
    return (
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center',
          roundedClass,
          'bg-[color:var(--color-accent)]/90 text-[color:var(--color-accent-foreground)]',
          'border-2 border-[color:var(--color-accent)] shadow-md transition-transform duration-200'
        )}
        aria-hidden='true'
        data-testid='avatar-uploadable-drag-overlay'
      >
        <Upload size={iconSize * 1.33} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center',
        roundedClass,
        'bg-surface-3/80 text-primary-token ring-1 ring-[color:var(--color-border-subtle)] backdrop-blur',
        'opacity-0 transition-opacity duration-200 group-hover/avatar:opacity-100'
      )}
      aria-hidden='true'
      data-testid='avatar-uploadable-hover-overlay'
    >
      <Upload size={iconSize} />
    </div>
  );
}
