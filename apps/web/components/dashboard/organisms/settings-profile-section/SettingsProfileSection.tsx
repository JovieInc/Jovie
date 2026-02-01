'use client';

import { toast } from 'sonner';
import { Input } from '@/components/atoms/Input';
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
    <DashboardCard variant='settings' className='relative'>
      {statusPillState && (
        <SettingsStatusPill
          state={statusPillState}
          className='absolute right-6 top-6'
        />
      )}
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-sm text-secondary-token'>
              Photo, name, username.
            </p>
          </div>
        </div>

        <div className='grid gap-6 lg:grid-cols-[240px,1fr]'>
          <div>
            <div className='flex justify-center'>
              <AvatarUploadable
                src={artist.image_url}
                alt={artist.name || 'Profile photo'}
                name={artist.name || artist.handle}
                size='display-xl'
                uploadable
                showHoverOverlay
                onUpload={handleAvatarUpload}
                onSuccess={handleAvatarUpdate}
                onError={message => toast.error(message)}
                maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
                acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
                className='mx-auto animate-in fade-in duration-300'
              />
            </div>
            <p className='text-sm text-secondary text-center mt-3'>
              Drag & drop or click to upload.
            </p>
          </div>

          <div className='space-y-6'>
            <div>
              <label
                htmlFor='username'
                className='block text-xs font-medium text-primary-token mb-2'
              >
                Username
              </label>
              <div className='mb-2 text-xs text-secondary-token/70'>
                Used in your profile URL
              </div>
              <div className='relative'>
                <div className='flex rounded-lg shadow-sm'>
                  <span className='inline-flex items-center px-3 rounded-l-lg border border-r-0 border-subtle bg-surface-2 text-secondary-token text-sm select-none'>
                    {profileDomain}/
                  </span>
                  <Input
                    type='text'
                    name='username'
                    id='username'
                    data-1p-ignore
                    autoComplete='off'
                    value={formData.username}
                    onChange={e =>
                      handleFieldChange('username', e.target.value)
                    }
                    onBlur={() => flushSave()}
                    placeholder='yourname'
                    className='flex-1 min-w-0'
                    inputClassName='block w-full px-3 py-2 rounded-none rounded-r-lg border border-subtle bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm transition-colors'
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor='displayName'
                className='block text-xs font-medium text-primary-token mb-2'
              >
                Display Name
              </label>
              <Input
                type='text'
                name='displayName'
                id='displayName'
                value={formData.displayName}
                onChange={e => handleFieldChange('displayName', e.target.value)}
                onBlur={() => flushSave()}
                placeholder='The name your fans will see'
                inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
