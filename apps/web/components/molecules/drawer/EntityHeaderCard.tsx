import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EntityHeaderCardProps {
  /** Image slot — Avatar, AvatarUploadable, artwork, etc. */
  readonly image?: ReactNode;
  /** Optional small label above the title */
  readonly eyebrow?: ReactNode;
  /** Primary display name / title */
  readonly title: string;
  /** Secondary line — username, artist name, etc. */
  readonly subtitle?: ReactNode;
  /** Optional tertiary metadata block rendered beneath subtitle */
  readonly meta?: ReactNode;
  /** Optional badge rendered inline after the title (e.g. verified icon) */
  readonly badge?: ReactNode;
  /** Optional top-right action slot */
  readonly actions?: ReactNode;
  /** Optional footer rendered below the meta block */
  readonly footer?: ReactNode;
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
  eyebrow,
  title,
  subtitle,
  meta,
  badge,
  actions,
  footer,
  className,
  bodyClassName,
  'data-testid': testId,
}: EntityHeaderCardProps) {
  return (
    <div
      className={cn('relative flex items-start gap-3', className)}
      data-testid={testId}
    >
      {actions ? <div className='absolute right-0 top-0'>{actions}</div> : null}
      {image ?? null}
      <div className={cn('min-w-0 flex-1 space-y-1', bodyClassName)}>
        {eyebrow ? (
          <div className='text-[10.5px] font-caption leading-none tracking-[0.03em] text-tertiary-token'>
            {eyebrow}
          </div>
        ) : null}
        <div className='flex items-center gap-1'>
          <span className='truncate text-sm font-semibold leading-[18px] tracking-[-0.015em] text-primary-token'>
            {title}
          </span>
          {badge}
        </div>
        {subtitle && (
          <div className='truncate text-xs leading-[16px] tracking-[-0.005em] text-secondary-token'>
            {subtitle}
          </div>
        )}
        {meta ? <div className='pt-0.5'>{meta}</div> : null}
        {footer ? <div className='pt-1'>{footer}</div> : null}
      </div>
    </div>
  );
}
