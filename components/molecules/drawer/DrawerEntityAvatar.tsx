'use client';

import { getInitials } from '@jovie/ui';
import { useState } from 'react';
import { DrawerMediaThumb } from './DrawerMediaThumb';

export interface DrawerEntityAvatarProps {
  readonly name: string;
  readonly src?: string | null;
  readonly testId?: string;
}

/**
 * Canonical identity image for compact entity rails.
 *
 * The 48px media thumb sits inside a 56px frame with a 4px optical gap.
 * Matching inner/outer radii keep the two outlines visibly concentric, while
 * the rail remains flat (no avatar shadow or nested card elevation).
 */
export function DrawerEntityAvatar({
  name,
  src,
  testId,
}: DrawerEntityAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = src && src !== failedSrc ? src : null;

  return (
    <div
      aria-hidden='true'
      className='size-14 shrink-0 rounded-[calc(var(--radius-lg)+var(--space-1))] bg-surface-0 p-1 ring-1 ring-inset ring-(--app-shell-frame-seam) shadow-none'
      data-entity-avatar
      data-testid={testId}
    >
      <DrawerMediaThumb
        src={resolvedSrc}
        alt=''
        fallback={
          <span className='text-sm font-semibold tracking-[-0.02em] text-secondary-token'>
            {getInitials(name)}
          </span>
        }
        dimension={48}
        sizes='48px'
        sizeClassName='size-12'
        className='rounded-lg bg-surface-2 outline-(--color-border-subtle) shadow-none'
        imageClassName='rounded-lg'
        onImageError={() => setFailedSrc(src ?? null)}
      />
    </div>
  );
}
