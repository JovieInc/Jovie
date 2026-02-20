'use client';

import { Avatar } from '@/components/molecules/Avatar';
import { EntityHeaderCard } from '@/components/molecules/drawer';

export interface ProfileContactHeaderProps {
  readonly displayName: string;
  readonly username: string;
  readonly avatarUrl: string | null;
}

export function ProfileContactHeader({
  displayName,
  username,
  avatarUrl,
}: ProfileContactHeaderProps) {
  return (
    <EntityHeaderCard
      image={
        <Avatar
          src={avatarUrl}
          alt={displayName ? `${displayName} avatar` : 'Profile avatar'}
          name={displayName}
          size='lg'
        />
      }
      title={displayName || 'Unnamed'}
      subtitle={`@${username}`}
    />
  );
}
