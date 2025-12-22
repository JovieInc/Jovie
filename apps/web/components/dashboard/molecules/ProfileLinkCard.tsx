'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
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
          <h3 className='font-medium text-primary-token'>Your Profile Link</h3>
          <p className='mt-1 text-sm text-secondary-token'>{profileUrl}</p>
        </div>
        <div className='flex space-x-2'>
          <CopyToClipboardButton
            relativePath={`/${handle}`}
            idleLabel='Copy'
            successLabel='Copied!'
            errorLabel='Failed to copy'
          />
          <Button asChild variant='primary' size='sm'>
            <Link href={`/${handle}`} target='_blank' rel='noopener noreferrer'>
              View Profile
            </Link>
          </Button>
        </div>
      </div>
    </DashboardCard>
  );
}
