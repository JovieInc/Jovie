'use client';

import { Avatar } from '@/components/molecules/Avatar';
import {
  DrawerSurfaceCard,
  EntityHeaderCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
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
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
      testId='audience-header-card'
    >
      <div className='relative p-2.5'>
        <p className='mb-1 truncate font-mono text-[10.5px] font-[510] leading-none tracking-[0.025em] text-tertiary-token'>
          Audience member
        </p>
        <EntityHeaderCard
          image={
            <Avatar
              src={avatarSrc}
              alt={title ? `${title} avatar` : 'Audience member avatar'}
              name={avatarName}
              size='lg'
            />
          }
          title={title}
          subtitle={subtitle}
          className={className}
        />
      </div>
    </DrawerSurfaceCard>
  );
}
