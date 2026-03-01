'use client';

import { Avatar } from '@/components/molecules/Avatar';
import { cn } from '@/lib/utils';

export interface AudienceMemberHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly avatarName: string;
  readonly avatarSrc?: string | null;
  readonly className?: string;
}

export function AudienceMemberHeader({
  title,
  subtitle,
  avatarName,
  avatarSrc,
  className,
}: AudienceMemberHeaderProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Avatar
        src={avatarSrc}
        alt={title ? `${title} avatar` : 'Audience member avatar'}
        name={avatarName}
        size='lg'
      />
      <div className='min-w-0 flex-1'>
        <div className='truncate text-[15px] font-[510] leading-normal tracking-[-0.011em] text-primary-token'>
          {title}
        </div>
        <div className='truncate text-[13px] leading-normal text-tertiary-token'>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
