'use client';

import Link from 'next/link';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { Button } from '@/components/ui/Button';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { DashboardCard } from '../atoms/DashboardCard';

interface ProfileLinkCardProps {
  handle: string;
}

export function ProfileLinkCard({ handle }: ProfileLinkCardProps) {
  const profileUrl = `${getBaseUrl()}/${handle}`;

  return (
    <DashboardCard variant='default' data-testid='profile-link-card'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='font-medium'>Your Profile Link</h3>
          <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
            {profileUrl}
          </p>
        </div>
        <div className='flex space-x-2'>
          <CopyToClipboardButton
            relativePath={`/${handle}`}
            idleLabel='Copy'
            successLabel='Copied!'
            errorLabel='Failed to copy'
          />
          <Button
            as={Link}
            href={`/${handle}`}
            target='_blank'
            rel='noopener noreferrer'
            variant='primary'
            size='sm'
          >
            View Profile
          </Button>
        </div>
      </div>
    </DashboardCard>
  );
}
