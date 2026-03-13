'use client';

import { Input } from '@jovie/ui';
import { toast } from 'sonner';
import { SettingsStatusPill } from '@/components/dashboard/molecules/SettingsStatusPill';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { BASE_URL } from '@/constants/app';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import type { SettingsProfileSectionProps } from './types';
import { useSettingsProfile } from './useSettingsProfile';

const PROFILE_INPUT_CLASS =
  'block w-full rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 py-2 text-[13px] text-(--linear-text-primary) placeholder:text-(--linear-text-tertiary) transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-(--linear-border-focus) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20';

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
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='Profile identity'
        subtitle='Control the display name, username, and public profile image fans see.'
        className='min-h-0 px-4 py-3'
        actions={<SettingsStatusPill status={profileSaveStatus} />}
        actionsClassName='w-auto shrink-0'
      />
      <div className='space-y-3 px-4 py-3'>
        <ContentSurfaceCard className='flex items-center justify-between gap-4 bg-(--linear-bg-surface-0) px-4 py-3.5'>
          <span className='text-[13px] text-(--linear-text-primary)'>
            Profile picture
          </span>
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
        </ContentSurfaceCard>

        <ContentSurfaceCard className='flex flex-col gap-3 bg-(--linear-bg-surface-0) px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'>
          <label
            htmlFor='displayName'
            className='shrink-0 text-[13px] text-(--linear-text-primary)'
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
            className={`w-full sm:max-w-[280px] ${PROFILE_INPUT_CLASS}`}
          />
        </ContentSurfaceCard>

        <ContentSurfaceCard className='flex flex-col gap-3 bg-(--linear-bg-surface-0) px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'>
          <div className='shrink-0'>
            <label
              htmlFor='username'
              className='text-[13px] text-(--linear-text-primary)'
            >
              Username
            </label>
            <p className='mt-0.5 text-[13px] text-(--linear-text-secondary)'>
              Used in your profile URL
            </p>
          </div>
          <div className='flex w-full rounded-[8px] sm:max-w-[280px]'>
            <span className='inline-flex select-none items-center rounded-l-[8px] border border-r-0 border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 text-[13px] text-(--linear-text-secondary)'>
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
              className={`min-w-0 flex-1 rounded-none rounded-r-[8px] border-l-0 ${PROFILE_INPUT_CLASS}`}
            />
          </div>
        </ContentSurfaceCard>
      </div>
    </ContentSurfaceCard>
  );
}
