'use client';

import { Input } from '@jovie/ui';
import { toast } from 'sonner';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsStatusPill } from '@/components/dashboard/molecules/SettingsStatusPill';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { BASE_URL } from '@/constants/app';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import type { SettingsProfileSectionProps } from './types';
import { useSettingsProfile } from './useSettingsProfile';

type StatusPillState = 'saving' | 'saved' | null;

function getStatusPillState(
  saving: boolean,
  success: boolean | null
): StatusPillState {
  if (saving) return 'saving';
  if (success) return 'saved';
  return null;
}

export function SettingsProfileSection({
  artist,
  onArtistUpdate,
  onRefresh,
}: SettingsProfileSectionProps) {
  const profileDomain = BASE_URL.replace(/^https?:\/\//, '');

  const {
    formData,
    setFormData,
    profileSaveStatus,
    setProfileSaveStatus,
    handleAvatarUpload,
    handleAvatarUpdate,
    saveProfile,
    flushSave,
  } = useSettingsProfile({
    artist,
    onArtistUpdate,
    onRefresh,
  });

  const statusPillState = getStatusPillState(
    profileSaveStatus.saving,
    profileSaveStatus.success
  );

  /** Handle field changes with debounced save */
  const handleFieldChange = (
    field: 'username' | 'displayName',
    value: string
  ) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      setProfileSaveStatus(s => ({ ...s, success: null, error: null }));
      saveProfile({ displayName: next.displayName, username: next.username });
      return next;
    });
  };

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='relative divide-y divide-subtle'
    >
      {statusPillState && (
        <SettingsStatusPill
          state={statusPillState}
          className='absolute right-5 top-4'
        />
      )}

      {/* Profile picture row */}
      <div className='flex items-center justify-between px-5 py-4'>
        <span className='text-sm text-primary-token'>Profile picture</span>
        <AvatarUploadable
          src={artist.image_url}
          alt={artist.name || 'Profile photo'}
          name={artist.name || artist.handle}
          size='sm'
          uploadable
          showHoverOverlay
          onUpload={handleAvatarUpload}
          onSuccess={handleAvatarUpdate}
          onError={message => toast.error(message)}
          maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
          acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
        />
      </div>

      {/* Display Name row */}
      <div className='flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between'>
        <label
          htmlFor='displayName'
          className='text-sm text-primary-token shrink-0'
        >
          Display name
        </label>
        <Input
          type='text'
          name='displayName'
          id='displayName'
          value={formData.displayName}
          onChange={e => handleFieldChange('displayName', e.target.value)}
          onBlur={() => flushSave()}
          placeholder='The name your fans will see'
          className='block w-full sm:max-w-[260px] px-3 py-1.5 border border-subtle rounded-md bg-surface-1 text-primary text-sm placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent transition-colors'
        />
      </div>

      {/* Username row */}
      <div className='flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='shrink-0'>
          <label htmlFor='username' className='text-sm text-primary-token'>
            Username
          </label>
          <p className='text-[13px] text-secondary-token mt-0.5'>
            Used in your profile URL
          </p>
        </div>
        <div className='flex rounded-md shadow-sm w-full sm:max-w-[260px]'>
          <span className='inline-flex items-center px-3 rounded-l-md border border-r-0 border-subtle bg-surface-2 text-secondary-token text-sm select-none'>
            {profileDomain}/
          </span>
          <Input
            type='text'
            name='username'
            id='username'
            data-1p-ignore
            autoComplete='off'
            value={formData.username}
            onChange={e => handleFieldChange('username', e.target.value)}
            onBlur={() => flushSave()}
            placeholder='yourname'
            className='flex-1 min-w-0 block w-full px-3 py-1.5 rounded-none rounded-r-md border border-subtle bg-surface-1 text-primary text-sm placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent transition-colors'
          />
        </div>
      </div>
    </DashboardCard>
  );
}
