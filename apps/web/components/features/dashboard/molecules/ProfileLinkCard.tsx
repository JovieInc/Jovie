'use client';

import { Button } from '@jovie/ui';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { BASE_URL } from '@/constants/domains';
import { CopyToClipboardButton } from '@/features/dashboard/molecules/CopyToClipboardButton';

interface ProfileLinkCardProps {
  readonly handle: string;
}

export function ProfileLinkCard({ handle }: ProfileLinkCardProps) {
  const profileUrl = `${BASE_URL}/${handle}`;

  return (
    <ContentSurfaceCard
      data-testid='profile-link-card'
      className='flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5'
    >
      <div className='min-w-0 flex-1'>
        <div>
          <h3 className='text-[13px] font-caption text-primary-token'>
            Your profile link
          </h3>
          <p className='mt-1 truncate text-[13px] text-secondary-token'>
            {profileUrl}
          </p>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
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
    </ContentSurfaceCard>
  );
}
