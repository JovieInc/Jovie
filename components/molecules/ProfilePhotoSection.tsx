'use client';

import * as React from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { AvatarUpload } from '@/components/organisms/AvatarUpload';

interface ProfilePhotoSectionProps {
  currentAvatarUrl?: string | null;
  artistName?: string;
  onUploadSuccess: (imageUrl: string) => void;
  className?: string;
}

export function ProfilePhotoSection({
  currentAvatarUrl,
  artistName,
  onUploadSuccess,
  className,
}: ProfilePhotoSectionProps) {
  return (
    <DashboardCard variant='settings' className={className}>
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-lg font-medium text-primary'>Profile Photo</h3>
      </div>

      <AvatarUpload
        currentAvatarUrl={currentAvatarUrl}
        artistName={artistName || 'Artist'}
        onUploadSuccess={onUploadSuccess}
      />
    </DashboardCard>
  );
}
