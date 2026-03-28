'use client';

import { Input } from '@jovie/ui';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
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
  'block w-full rounded-[10px] border border-subtle bg-surface-0 px-3 py-2 text-[13px] text-primary-token placeholder:text-tertiary-token transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20';

export function SettingsProfileSection({
  artist,
  avatarQuality,
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
    field:
      | 'username'
      | 'displayName'
      | 'location'
      | 'hometown'
      | 'pitchContext'
      | 'targetPlaylists',
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
        pitchContext: next.pitchContext,
        targetPlaylists: next.targetPlaylists,
      });
      return next;
    });
  };

  return (
    <SettingsPanel
      title='Profile'
      description='Display name, username, image, and place details fans see.'
      actions={<SettingsStatusPill status={profileSaveStatus} />}
    >
      <div className='space-y-1 px-4 py-4 sm:px-5'>
        <div className='flex items-center justify-between gap-4 py-2'>
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
        </div>
        {avatarQuality.status === 'low' ? (
          <div className='flex items-start gap-3 rounded-[10px] border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-secondary-token'>
            <AlertCircle
              className='mt-0.5 h-4 w-4 shrink-0 text-amber-600'
              aria-hidden='true'
            />
            <p>
              This photo is only {avatarQuality.width}x{avatarQuality.height}.
              Jovie profiles look best at 512x512 or higher, so upload a sharper
              image before this goes live at full size.
            </p>
          </div>
        ) : null}

        <div className='flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between'>
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
        </div>

        <div className='flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between'>
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
          <div className='flex w-full rounded-md sm:max-w-[280px]'>
            <span className='inline-flex select-none items-center rounded-l-[10px] border border-r-0 border-subtle bg-surface-0 px-3 text-[13px] text-secondary-token'>
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
              className={`min-w-0 flex-1 rounded-none rounded-r-[10px] border-l-0 ${PROFILE_INPUT_CLASS}`}
            />
          </div>
        </div>

        <div className='flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between'>
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
        </div>

        <div className='flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between'>
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
        </div>

        <div className='flex flex-col gap-2 py-2'>
          <div className='shrink-0'>
            <label
              htmlFor='pitchContext'
              className='text-[13px] text-primary-token'
            >
              Pitch context
            </label>
            <p className='mt-0.5 text-[13px] text-secondary-token'>
              Tell us about your streaming milestones, press coverage, radio
              play, playlist history, and your artist story. This helps generate
              better playlist pitches for your releases.
            </p>
          </div>
          <div className='relative'>
            <textarea
              name='pitchContext'
              id='pitchContext'
              value={formData.pitchContext}
              onChange={e => handleFieldChange('pitchContext', e.target.value)}
              onBlur={() => flushSave()}
              placeholder='e.g. 500K+ monthly listeners on Spotify, featured on New Music Friday twice, recent radio play on KCRW...'
              rows={4}
              maxLength={2000}
              className={`w-full resize-y ${PROFILE_INPUT_CLASS}`}
            />
            <span className='absolute bottom-2 right-3 text-[11px] text-tertiary-token'>
              {formData.pitchContext.length}/2000
            </span>
          </div>
        </div>

        <div className='flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between'>
          <div className='shrink-0'>
            <label
              htmlFor='targetPlaylists'
              className='text-[13px] text-primary-token'
            >
              Default target playlists
            </label>
            <p className='mt-0.5 text-[13px] text-secondary-token'>
              Default playlists for pitch generation. Override per-release in
              the release sidebar.
            </p>
          </div>
          <Input
            type='text'
            name='targetPlaylists'
            id='targetPlaylists'
            value={formData.targetPlaylists}
            onChange={e => handleFieldChange('targetPlaylists', e.target.value)}
            onBlur={() => flushSave()}
            placeholder='e.g. Pollen, Butter, Lorem'
            maxLength={310}
            className={`w-full sm:max-w-[280px] ${PROFILE_INPUT_CLASS}`}
          />
        </div>
      </div>
    </SettingsPanel>
  );
}
