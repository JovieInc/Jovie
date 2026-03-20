import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EntityHeaderCardProps {
  /** Image slot — Avatar, AvatarUploadable, artwork, etc. */
  readonly image?: ReactNode;
  /** Primary display name / title */
  readonly title: string;
  /** Secondary line — username, artist name, etc. */
  readonly subtitle?: ReactNode;
  /** Optional tertiary metadata block rendered beneath subtitle */
  readonly meta?: ReactNode;
  /** Optional badge rendered inline after the title (e.g. verified icon) */
  readonly badge?: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
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
  meta,
  badge,
  className,
  bodyClassName,
  'data-testid': testId,
}: EntityHeaderCardProps) {
  return (
    <div
      className={cn('flex items-start gap-3', className)}
      data-testid={testId}
    >
      {image ?? null}
      <div className={cn('min-w-0 flex-1 space-y-1', bodyClassName)}>
        <div className='flex items-center gap-1.5'>
          <span className='truncate text-[14px] font-[590] leading-[17px] tracking-[-0.01em] text-primary-token'>
            {title}
          </span>
          {badge}
        </div>
        {subtitle && (
          <div className='truncate text-[12px] leading-[15px] tracking-[-0.005em] text-secondary-token'>
            {subtitle}
          </div>
        )}
        {meta ? <div>{meta}</div> : null}
      </div>
    </div>
  );
}
