import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EntityHeaderCardProps {
  /** Image slot — Avatar, AvatarUploadable, artwork, etc. */
  readonly image: ReactNode;
  /** Primary display name / title */
  readonly title: string;
  /** Secondary line — username, artist name, etc. */
  readonly subtitle?: string | null;
  /** Optional badge rendered inline after the title (e.g. verified icon) */
  readonly badge?: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * Shared entity header card used across right-drawer sidebars.
 *
 * Provides the standard layout for entity identification sections
 * (contact avatar, release artwork, profile header) so all entity
 * sidebars look consistent.
 */
export function EntityHeaderCard({
  image,
  title,
  subtitle,
  badge,
  className,
  'data-testid': testId,
}: EntityHeaderCardProps) {
  return (
    <div
      className={cn('flex items-center gap-3', className)}
      data-testid={testId}
    >
      {image}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1'>
          <span className='truncate text-sm font-medium'>{title}</span>
          {badge}
        </div>
        {subtitle && (
          <div className='truncate text-xs text-sidebar-muted'>{subtitle}</div>
        )}
      </div>
    </div>
  );
}
