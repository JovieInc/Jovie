'use client';

import { Avatar } from '@/components/atoms/Avatar/Avatar';

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
    <div className='flex items-center gap-3'>
      <Avatar
        src={avatarUrl}
        alt={displayName ? `${displayName} avatar` : 'Profile avatar'}
        name={displayName}
        size='lg'
      />
      <div className='min-w-0 flex-1'>
        <div className='truncate text-sm font-medium'>
          {displayName || 'Unnamed'}
        </div>
        <div className='truncate text-xs text-sidebar-muted'>@{username}</div>
      </div>
    </div>
  );
}
