'use client';

import { Input } from '@jovie/ui';
import { AlertCircle } from 'lucide-react';
import { type CSSProperties, useEffect, useRef } from 'react';
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
  'block w-full rounded-[10px] border border-subtle bg-surface-0 px-3 py-2 text-app text-primary-token placeholder:text-tertiary-token transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20';
const PROFILE_LABEL_COLUMN_WIDTH = '168px';
const PROFILE_ROW_CLASS =
  'grid gap-2 py-3 sm:grid-cols-[var(--profile-label-column-width)_minmax(0,1fr)] sm:items-start sm:gap-x-5';
const PROFILE_FIELD_COLUMN_CLASS = 'w-full sm:max-w-[420px]';
const PROFILE_LAYOUT_VARS = {
  '--profile-label-column-width': PROFILE_LABEL_COLUMN_WIDTH,
} as CSSProperties;

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
  const shouldPersistProfileRef = useRef(false);

  const handleFieldChange = (
    field:
      | 'username'
      | 'displayName'
      | 'location'
      | 'hometown'
      | 'careerHighlights'
      | 'targetPlaylists',
    value: string
  ) => {
    shouldPersistProfileRef.current = true;
    setFormData(previous => ({ ...previous, [field]: value }));
  };

  useEffect(() => {
    if (!shouldPersistProfileRef.current) {
      return;
    }

    shouldPersistProfileRef.current = false;
    setProfileSaveStatus(state => ({ ...state, success: null, error: null }));
    saveProfile({
      displayName: formData.displayName,
      username: formData.username,
      location: formData.location,
      hometown: formData.hometown,
      careerHighlights: formData.careerHighlights,
      targetPlaylists: formData.targetPlaylists,
    });
  }, [formData, saveProfile, setProfileSaveStatus]);

  return (
    <SettingsPanel
      title='Profile'
      description='Display name, username, image, and place details fans see.'
      actions={<SettingsStatusPill status={profileSaveStatus} />}
    >
      <div className='space-y-0 px-4 py-4 sm:px-5' style={PROFILE_LAYOUT_VARS}>
        <div className={PROFILE_ROW_CLASS}>
          <span className='pt-1 text-app text-primary-token'>
            Profile picture
          </span>
          <div className='flex justify-start sm:pt-0.5'>
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
        </div>
        {avatarQuality?.status === 'low' ? (
          <div className='pb-2 sm:pl-[calc(var(--profile-label-column-width)+1.25rem)]'>
            <div className='flex items-start gap-3 rounded-[10px] border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-secondary-token'>
              <AlertCircle
                className='mt-0.5 h-4 w-4 shrink-0 text-amber-600'
                aria-hidden='true'
              />
              <p>
                This photo is only {avatarQuality.width}x{avatarQuality.height}.
                Jovie profiles look best at 512x512 or higher, so upload a
                sharper image before this goes live at full size.
              </p>
            </div>
          </div>
        ) : null}

        <div className={PROFILE_ROW_CLASS}>
          <label
            htmlFor='displayName'
            className='pt-2 text-app text-primary-token'
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
            className={`${PROFILE_FIELD_COLUMN_CLASS} ${PROFILE_INPUT_CLASS}`}
          />
        </div>

        <div className={PROFILE_ROW_CLASS}>
          <div>
            <label htmlFor='username' className='text-app text-primary-token'>
              Username
            </label>
            <p className='mt-0.5 text-app text-secondary-token'>
              Used in your profile URL
            </p>
          </div>
          <div className={`flex rounded-md ${PROFILE_FIELD_COLUMN_CLASS}`}>
            <span className='inline-flex select-none items-center rounded-l-[10px] border border-r-0 border-subtle bg-surface-0 px-3 text-app text-secondary-token'>
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

        <div className={PROFILE_ROW_CLASS}>
          <div>
            <label htmlFor='location' className='text-app text-primary-token'>
              Current location
            </label>
            <p className='mt-0.5 text-app text-secondary-token'>
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
            className={`${PROFILE_FIELD_COLUMN_CLASS} ${PROFILE_INPUT_CLASS}`}
          />
        </div>

        <div className={PROFILE_ROW_CLASS}>
          <div>
            <label htmlFor='hometown' className='text-app text-primary-token'>
              Hometown
            </label>
            <p className='mt-0.5 text-app text-secondary-token'>
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
            className={`${PROFILE_FIELD_COLUMN_CLASS} ${PROFILE_INPUT_CLASS}`}
          />
        </div>

        <div className={PROFILE_ROW_CLASS}>
          <div>
            <label
              htmlFor='careerHighlights'
              className='text-app text-primary-token'
            >
              Career highlights
            </label>
            <p className='mt-0.5 text-app text-secondary-token'>
              Share your streaming milestones, press coverage, radio play,
              playlist history, and anything that makes your story unique. This
              helps Jovie write better pitches and recommendations.
            </p>
          </div>
          <div className={`relative ${PROFILE_FIELD_COLUMN_CLASS}`}>
            <textarea
              name='careerHighlights'
              id='careerHighlights'
              value={formData.careerHighlights}
              onChange={e =>
                handleFieldChange('careerHighlights', e.target.value)
              }
              onBlur={() => flushSave()}
              placeholder='e.g. 500K+ monthly listeners on Spotify, featured on New Music Friday twice, recent radio play on KCRW...'
              rows={4}
              maxLength={2000}
              className={`w-full resize-y ${PROFILE_INPUT_CLASS}`}
            />
            <span className='absolute bottom-2 right-3 text-2xs text-tertiary-token'>
              {formData.careerHighlights.length}/2000
            </span>
          </div>
        </div>

        <div className={PROFILE_ROW_CLASS}>
          <div>
            <label
              htmlFor='targetPlaylists'
              className='text-app text-primary-token'
            >
              Default target playlists
            </label>
            <p className='mt-0.5 text-app text-secondary-token'>
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
            className={`${PROFILE_FIELD_COLUMN_CLASS} ${PROFILE_INPUT_CLASS}`}
          />
        </div>
      </div>
    </SettingsPanel>
  );
}
