'use client';

import { Input } from '@jovie/ui';
import { toast } from 'sonner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { BASE_URL } from '@/constants/app';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import type { SettingsProfileSectionProps } from './types';
import { useSettingsProfile } from './useSettingsProfile';

const PROFILE_INPUT_CLASS =
  'block w-full rounded-[8px] border border-subtle bg-surface-1 px-3 py-2 text-[13px] text-primary-token placeholder:text-tertiary-token transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-(--linear-border-focus) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20';

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
    field: 'username' | 'displayName' | 'location' | 'hometown',
    value: string
  ) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      setProfileSaveStatus(s => ({ ...s, success: null, error: null }));
      saveProfile({
        displayName: next.displayName,
        username: next.username,
        location: next.location,
        hometown: next.hometown,
      });
      return next;
    });
  };

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='Profile identity'
        subtitle='Control the display name, username, image, and place details fans see.'
        className='min-h-0 px-4 py-3'
        actions={<SettingsStatusPill status={profileSaveStatus} />}
        actionsClassName='w-auto shrink-0'
      />
      <div className='space-y-3 px-4 py-3'>
        <ContentSurfaceCard className='flex items-center justify-between gap-4 bg-surface-0 px-4 py-3.5'>
          <span className='text-[13px] text-primary-token'>
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

        <ContentSurfaceCard className='flex flex-col gap-3 bg-surface-0 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'>
          <label
            htmlFor='displayName'
            className='shrink-0 text-[13px] text-primary-token'
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

        <ContentSurfaceCard className='flex flex-col gap-3 bg-surface-0 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'>
          <div className='shrink-0'>
            <label
              htmlFor='username'
              className='text-[13px] text-primary-token'
            >
              Username
            </label>
            <p className='mt-0.5 text-[13px] text-secondary-token'>
              Used in your profile URL
            </p>
          </div>
          <div className='flex w-full rounded-[8px] sm:max-w-[280px]'>
            <span className='inline-flex select-none items-center rounded-l-[8px] border border-r-0 border-subtle bg-surface-1 px-3 text-[13px] text-secondary-token'>
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

        <ContentSurfaceCard className='flex flex-col gap-3 bg-surface-0 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'>
          <div className='shrink-0'>
            <label
              htmlFor='location'
              className='text-[13px] text-primary-token'
            >
              Current location
            </label>
            <p className='mt-0.5 text-[13px] text-secondary-token'>
              Where you are based now
            </p>
          </div>
          <Input
            type='text'
            name='location'
            id='location'
            value={formData.location}
            onChange={e => handleFieldChange('location', e.target.value)}
            onBlur={() => flushSave()}
            placeholder='Los Angeles, CA'
            className={`w-full sm:max-w-[280px] ${PROFILE_INPUT_CLASS}`}
          />
        </ContentSurfaceCard>

        <ContentSurfaceCard className='flex flex-col gap-3 bg-surface-0 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'>
          <div className='shrink-0'>
            <label
              htmlFor='hometown'
              className='text-[13px] text-primary-token'
            >
              Hometown
            </label>
            <p className='mt-0.5 text-[13px] text-secondary-token'>
              Where you are from if it differs from where you live now
            </p>
          </div>
          <Input
            type='text'
            name='hometown'
            id='hometown'
            value={formData.hometown}
            onChange={e => handleFieldChange('hometown', e.target.value)}
            onBlur={() => flushSave()}
            placeholder='Nashville, TN'
            className={`w-full sm:max-w-[280px] ${PROFILE_INPUT_CLASS}`}
          />
        </ContentSurfaceCard>
      </div>
    </ContentSurfaceCard>
  );
}
