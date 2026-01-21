'use client';

import { Button } from '@jovie/ui';
import { Copy, ExternalLink } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/atoms/Avatar/Avatar';

export interface ProfileContactHeaderProps {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  profilePath: string;
}

export function ProfileContactHeader({
  displayName,
  username,
  avatarUrl,
  profilePath,
}: ProfileContactHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyUrl = useCallback(async () => {
    try {
      const url = `${window.location.origin}${profilePath}`;
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      toast.success('Profile URL copied');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [profilePath]);

  const handleOpenProfile = useCallback(() => {
    window.open(profilePath, '_blank', 'noopener,noreferrer');
  }, [profilePath]);

  return (
    <div className='space-y-3'>
      {/* Avatar and Name Row */}
      <div className='flex items-center gap-3'>
        <Avatar
          src={avatarUrl}
          alt={displayName ? `${displayName} avatar` : 'Profile avatar'}
          name={displayName}
          size='lg'
        />
        <div className='min-w-0 flex-1'>
          <div className='truncate text-sm font-semibold text-primary-token'>
            {displayName || 'Unnamed'}
          </div>
          <div className='truncate text-xs text-secondary-token'>
            @{username}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant='secondary'
          onClick={handleCopyUrl}
          className='flex-1 whitespace-nowrap border border-subtle bg-surface-1/40 ring-1 ring-inset ring-white/5 transition-colors hover:bg-surface-2/40 dark:ring-white/10'
        >
          <Copy className='h-3.5 w-3.5 mr-1.5' />
          {isCopied ? 'Copied!' : 'Copy URL'}
        </Button>
        <Button
          size='sm'
          variant='secondary'
          onClick={handleOpenProfile}
          className='flex-1 whitespace-nowrap border border-subtle bg-surface-1/40 ring-1 ring-inset ring-white/5 transition-colors hover:bg-surface-2/40 dark:ring-white/10'
        >
          <ExternalLink className='h-3.5 w-3.5 mr-1.5' />
          Open
        </Button>
      </div>
    </div>
  );
}
