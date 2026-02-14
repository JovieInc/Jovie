'use client';

import { Button } from '@jovie/ui';
import { CopyToClipboardButton } from '@/components/dashboard/molecules/CopyToClipboardButton';
import { BASE_URL } from '@/constants/domains';
import { DashboardCard } from '../atoms/DashboardCard';

interface ProfileLinkCardProps {
  readonly handle: string;
}

export function ProfileLinkCard({ handle }: ProfileLinkCardProps) {
  const profileUrl = `${BASE_URL}/${handle}`;

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
            <a href={profileUrl} target='_blank' rel='noopener noreferrer'>
              View Profile
            </a>
          </Button>
        </div>
      </div>
    </DashboardCard>
  );
}
