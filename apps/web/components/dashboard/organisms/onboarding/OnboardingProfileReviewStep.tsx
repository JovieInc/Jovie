'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { updateOnboardingProfile } from '@/app/onboarding/actions/update-profile';
import { AuthButton } from '@/components/auth';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { useUserAvatarMutation } from '@/lib/queries';

interface OnboardingProfileReviewStepProps {
  readonly title: string;
  readonly prompt: string;
  readonly enrichedProfile: EnrichedProfileData | null;
  readonly handle: string;
  readonly onGoToDashboard: () => void;
}

export function OnboardingProfileReviewStep({
  title,
  prompt,
  enrichedProfile,
  handle,
  onGoToDashboard,
}: OnboardingProfileReviewStepProps) {
  const [displayName, setDisplayName] = useState(enrichedProfile?.name || '');
  const [bio, setBio] = useState(enrichedProfile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(enrichedProfile?.imageUrl || null);
  const [isSaving, setIsSaving] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);

  // Sync enriched profile data when it arrives (async from DSP step)
  useEffect(() => {
    if (enrichedProfile?.name && !displayName) {
      setDisplayName(enrichedProfile.name);
    }
    if (enrichedProfile?.bio && !bio) {
      setBio(enrichedProfile.bio);
    }
    if (enrichedProfile?.imageUrl && !avatarUrl) {
      setAvatarUrl(enrichedProfile.imageUrl);
    }
  }, [enrichedProfile, displayName, bio, avatarUrl]);

  const { mutateAsync: uploadAvatar } = useUserAvatarMutation();

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      const blobUrl = await uploadAvatar(file);
      // Save to profile in DB
      await updateOnboardingProfile({ avatarUrl: blobUrl });
      return blobUrl;
    },
    [uploadAvatar]
  );

  const handleAvatarSuccess = useCallback((url: string) => {
    setAvatarUrl(url);
  }, []);

  const hasPhoto = Boolean(avatarUrl);
  const hasName = Boolean(displayName.trim());
  const canProceed = hasPhoto && hasName;

  const handleGoToDashboard = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateOnboardingProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
      });
      onGoToDashboard();
    } catch {
      // If save fails, still proceed — profile data was already saved during enrichment
      onGoToDashboard();
    } finally {
      setIsSaving(false);
    }
  }, [displayName, bio, onGoToDashboard]);

  return (
    <div className='flex flex-col items-center justify-center h-full'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          <p className={FORM_LAYOUT.hint}>{prompt}</p>
        </div>

        {/* Avatar */}
        <div className='flex flex-col items-center gap-3 mb-6'>
          <AvatarUploadable
            ref={avatarRef}
            src={avatarUrl}
            alt={displayName || handle}
            name={displayName || handle}
            size='display-md'
            uploadable
            onUpload={handleAvatarUpload}
            onSuccess={handleAvatarSuccess}
            maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
            acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
            showHoverOverlay
          />
          {!hasPhoto && (
            <button
              type='button'
              onClick={() => avatarRef.current?.click()}
              className='text-sm font-medium text-accent hover:text-accent/80 transition-colors'
            >
              Upload a profile photo
            </button>
          )}
        </div>

        {/* Display Name */}
        <div className='space-y-4 mb-6'>
          <div>
            <label
              htmlFor='onboarding-display-name'
              className='block text-sm font-medium text-secondary-token mb-1.5'
            >
              Display name
            </label>
            <input
              id='onboarding-display-name'
              type='text'
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder='Your name'
              className='w-full rounded-[--radius-lg] border border-subtle bg-surface-0 px-4 py-2.5 text-sm text-primary-token placeholder:text-tertiary-token focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'
            />
          </div>

          {/* Bio */}
          <div>
            <label
              htmlFor='onboarding-bio'
              className='block text-sm font-medium text-secondary-token mb-1.5'
            >
              Bio
            </label>
            <textarea
              id='onboarding-bio'
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder='Tell fans about yourself'
              rows={3}
              className='w-full rounded-[--radius-lg] border border-subtle bg-surface-0 px-4 py-2.5 text-sm text-primary-token placeholder:text-tertiary-token focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none'
            />
          </div>
        </div>

        {/* CTA */}
        <div className={FORM_LAYOUT.formInner}>
          <AuthButton
            onClick={handleGoToDashboard}
            disabled={!canProceed || isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? 'Saving...' : 'Go to Dashboard'}
          </AuthButton>
        </div>

        <div className={FORM_LAYOUT.footerHint}>
          {!canProceed && (
            <span className='text-[var(--linear-text-tertiary)]'>
              {!hasPhoto && !hasName
                ? 'Add a profile photo and name to continue'
                : !hasPhoto
                  ? 'Add a profile photo to continue'
                  : 'Add your name to continue'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
