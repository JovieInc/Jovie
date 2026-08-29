'use client';

import { AVATAR_PERSON_RADIUS_CLASSNAME } from '@jovie/ui';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AvatarUploadOverlayProps {
  readonly iconSize: number;
  readonly isDragOver?: boolean;
  readonly shapeClassName?: string;
}

export function AvatarUploadOverlay({
  iconSize,
  isDragOver = false,
  shapeClassName = AVATAR_PERSON_RADIUS_CLASSNAME,
}: AvatarUploadOverlayProps) {
  if (isDragOver) {
    return (
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center',
          shapeClassName,
          'bg-(--color-accent)/90 text-(--color-accent-foreground)',
          'border-2 border-(--color-accent) shadow-md transition-transform duration-subtle'
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
        shapeClassName,
        'bg-surface-3/80 text-primary-token ring-1 ring-(--color-border-subtle) backdrop-blur',
        'opacity-0 transition-opacity duration-subtle group-hover/avatar:opacity-100'
      )}
      aria-hidden='true'
      data-testid='avatar-uploadable-hover-overlay'
    >
      <Upload size={iconSize} />
    </div>
  );
}
