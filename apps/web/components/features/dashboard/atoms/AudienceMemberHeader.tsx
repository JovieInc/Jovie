'use client';

import { Avatar } from '@/components/molecules/Avatar';
import {
  DrawerSurfaceCard,
  EntityHeaderCard,
} from '@/components/molecules/drawer';

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
    <DrawerSurfaceCard variant='card' className='p-3'>
      <p className='mb-2 text-[10.5px] font-[510] leading-none text-tertiary-token'>
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
    </DrawerSurfaceCard>
  );
}
