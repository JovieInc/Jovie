'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import {
  updateOnboardingProfile,
  verifyProfileHasAvatar,
} from '@/app/onboarding/actions/update-profile';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { AuthButton } from '@/features/auth';
import { track } from '@/lib/analytics';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import { useUserAvatarMutation } from '@/lib/queries/useUserAvatarMutation';
import {
  canProceedFromProfileReview,
  validateDisplayName as validateDisplayNameGuard,
} from './profile-review-guards';

interface OnboardingProfileReviewStepProps {
  readonly title: string;
  readonly prompt: string;
  readonly enrichedProfile: EnrichedProfileData | null;
  readonly handle: string;
  readonly onGoToDashboard: () => void;
  readonly isEnriching: boolean;
  /** Existing avatar URL from a prior onboarding (step-resume users) */
  readonly existingAvatarUrl?: string | null;
  /** Existing bio from a prior onboarding (step-resume users) */
  readonly existingBio?: string | null;
  /** Existing genres from a prior onboarding (step-resume users) */
  readonly existingGenres?: string[] | null;
  /** Whether this is a step-resume session (existing user returning) */
  readonly isStepResume?: boolean;
}

const ENRICHMENT_TIMEOUT_MS = 10_000;
const PROFILE_SAVE_TIMEOUT_MS = 5000;
/** Minimum time the profile preview must display before CTA enables. */
const MIN_DISPLAY_MS = 5000;
function getCtaLabel(
  isSaving: boolean,
  isEnriching: boolean,
  minTimeElapsed: boolean,
  hasAvatar: boolean,
  hasDisplayName: boolean
): string {
  if (isSaving) return 'Saving...';
  if (isEnriching) return 'Finishing setup...';
  if (!minTimeElapsed) return 'Reviewing your profile...';
  if (!hasAvatar) return 'Upload a photo to continue';
  if (!hasDisplayName) return 'Add your name to continue';
  return 'Continue to Dashboard';
}

/**
 * Profile review step in onboarding — the quality gate.
 *
 * Shows a live preview of the user's public profile with:
 * - Uploadable avatar (required before proceeding)
 * - Editable display name (required, must differ from handle)
 * - Bio and genres from DSP enrichment
 *
 * Users cannot proceed to the dashboard without a photo and valid display name.
 */
export function OnboardingProfileReviewStep({
  title,
  prompt,
  enrichedProfile,
  handle,
  onGoToDashboard,
  isEnriching,
  existingAvatarUrl = null,
  existingBio = null,
  existingGenres = null,
  isStepResume = false,
}: OnboardingProfileReviewStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [enrichmentTimedOut, setEnrichmentTimedOut] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(
    // Step-resume users don't need the review delay — they've seen their profile before
    isStepResume
  );
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(
    null
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minTimeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Avatar state: uploaded → enriched → existing → null
  const enrichedAvatarUrl = enrichedProfile?.imageUrl || null;
  const avatarUrl = uploadedAvatarUrl || enrichedAvatarUrl || existingAvatarUrl;

  // Display name state: enriched → handle (editable)
  const [editableDisplayName, setEditableDisplayName] = useState(
    enrichedProfile?.name || handle
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const prevNameRef = useRef(editableDisplayName);

  // Bio and genres from enrichment or existing profile
  const bio = enrichedProfile?.bio || existingBio || null;
  const genres = enrichedProfile?.genres ?? existingGenres ?? [];

  const { mutateAsync: uploadAvatar } = useUserAvatarMutation({
    onSuccess: (blobUrl: string) => {
      setUploadedAvatarUrl(blobUrl);
      // Also save avatar URL to profile immediately
      updateOnboardingProfile({ avatarUrl: blobUrl });
      track('onboarding_photo_uploaded', {});
    },
  });

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      return uploadAvatar(file);
    },
    [uploadAvatar]
  );

  const showLoading = isEnriching && !enrichedProfile && !enrichmentTimedOut;

  // Sync enriched avatar into local state so hasAvatar reflects it
  useEffect(() => {
    if (enrichedAvatarUrl && !uploadedAvatarUrl) {
      setUploadedAvatarUrl(enrichedAvatarUrl);
    }
  }, [enrichedAvatarUrl, uploadedAvatarUrl]);

  // Update display name from enrichment when it arrives
  useEffect(() => {
    if (enrichedProfile?.name && editableDisplayName === handle) {
      setEditableDisplayName(enrichedProfile.name);
    }
  }, [enrichedProfile?.name, editableDisplayName, handle]);

  // Track photo status on mount
  useEffect(() => {
    if (!showLoading) {
      const source = enrichedProfile?.imageUrl
        ? 'enrichment'
        : existingAvatarUrl
          ? 'oauth'
          : 'none';
      track('onboarding_photo_status', {
        has_photo: Boolean(avatarUrl),
        source,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when preview becomes visible
  }, [showLoading]);

  // Start the minimum display timer when the profile card becomes visible
  useEffect(() => {
    if (!showLoading && !minTimeElapsed && !isStepResume) {
      minTimeRef.current = globalThis.setTimeout(
        () => setMinTimeElapsed(true),
        MIN_DISPLAY_MS
      );
    }
    return () => {
      if (minTimeRef.current) {
        clearTimeout(minTimeRef.current);
        minTimeRef.current = null;
      }
    };
  }, [showLoading, minTimeElapsed, isStepResume]);

  // Auto-dismiss loading state after timeout
  useEffect(() => {
    if (isEnriching && !enrichedProfile) {
      setEnrichmentTimedOut(false);
      timeoutRef.current = globalThis.setTimeout(() => {
        setEnrichmentTimedOut(true);
      }, ENRICHMENT_TIMEOUT_MS);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isEnriching, enrichedProfile]);

  // Clear timeout when enrichment completes
  useEffect(() => {
    if (enrichedProfile && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [enrichedProfile]);

  // Display name validation — delegates to shared guard
  const validateDisplayName = useCallback(
    (name: string): string | null => validateDisplayNameGuard(name, handle),
    [handle]
  );

  const handleNameBlur = useCallback(() => {
    const error = validateDisplayName(editableDisplayName);
    setNameError(error);
    if (!error && editableDisplayName.trim()) {
      setIsEditingName(false);
      track('onboarding_name_edited', {
        had_enriched_name: Boolean(enrichedProfile?.name),
      });
    }
  }, [editableDisplayName, validateDisplayName, enrichedProfile?.name]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNameBlur();
      }
      if (e.key === 'Escape') {
        setEditableDisplayName(prevNameRef.current);
        setIsEditingName(false);
        setNameError(null);
      }
    },
    [handleNameBlur]
  );

  const startEditingName = useCallback(() => {
    prevNameRef.current = editableDisplayName;
    setIsEditingName(true);
    globalThis.setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [editableDisplayName]);

  // CTA proceed check
  const canProceed = canProceedFromProfileReview(
    editableDisplayName,
    avatarUrl
  );

  const handleContinue = useCallback(async () => {
    // Final client-side validation
    const nameValidationError = validateDisplayName(editableDisplayName);
    if (nameValidationError) {
      setNameError(nameValidationError);
      return;
    }
    if (!avatarUrl) return;

    setIsSaving(true);
    try {
      // Save display name + bio updates
      const updates: {
        displayName?: string;
        bio?: string;
        avatarUrl?: string;
      } = {};

      if (editableDisplayName.trim()) {
        updates.displayName = editableDisplayName.trim();
      }
      if (enrichedProfile?.bio?.trim()) {
        updates.bio = enrichedProfile.bio.trim();
      }

      if (Object.keys(updates).length > 0) {
        await Promise.race([
          updateOnboardingProfile(updates),
          new Promise((_, reject) => {
            globalThis.setTimeout(() => {
              reject(new Error('Onboarding profile save timed out'));
            }, PROFILE_SAVE_TIMEOUT_MS);
          }),
        ]);
      }

      // Server-side defense-in-depth: verify avatar is in DB
      try {
        await verifyProfileHasAvatar();
      } catch (verifyError) {
        // If the server confirms avatar is genuinely missing, block navigation
        if (
          verifyError instanceof Error &&
          verifyError.message === 'Profile photo is required'
        ) {
          setIsSaving(false);
          return;
        }
        // Network/timeout errors — client already checked avatarUrl is set, proceed
      }

      onGoToDashboard();
    } catch {
      // Proceed to dashboard even if profile save fails — avatar data is already in DB
      onGoToDashboard();
    } finally {
      setIsSaving(false);
    }
  }, [
    editableDisplayName,
    enrichedProfile,
    onGoToDashboard,
    avatarUrl,
    validateDisplayName,
  ]);

  const isEnrichingActive = isEnriching && !enrichmentTimedOut;

  return (
    <div className='flex flex-col items-center justify-center h-full'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          <p className={FORM_LAYOUT.hint}>{prompt}</p>
        </div>

        {showLoading ? (
          /* Loading state with progress bar */
          <div className='flex flex-col items-center gap-6 py-12'>
            <div className='w-full max-w-xs'>
              <div className='h-1.5 w-full overflow-hidden rounded-full bg-surface-1'>
                <div className='h-full rounded-full bg-(--linear-accent) animate-[indeterminate_1.5s_ease-in-out_infinite]' />
              </div>
            </div>
            <p className='text-[13px] text-secondary-token animate-pulse'>
              Setting up your profile...
            </p>
            <style>{`
              @keyframes indeterminate {
                0% { width: 0%; margin-left: 0%; }
                50% { width: 60%; margin-left: 20%; }
                100% { width: 0%; margin-left: 100%; }
              }
            `}</style>
          </div>
        ) : (
          /* Live profile preview with editable fields */
          <>
            <ContentSurfaceCard className='mb-6 p-6'>
              <div className='flex flex-col items-center gap-4'>
                {/* Uploadable Avatar */}
                <div className='flex flex-col items-center gap-2'>
                  <div className='rounded-full p-[2px] ring-1 ring-black/5 dark:ring-white/6 shadow-sm'>
                    <AvatarUploadable
                      src={avatarUrl}
                      alt={editableDisplayName}
                      name={editableDisplayName}
                      size='display-md'
                      uploadable
                      onUpload={handleAvatarUpload}
                      onSuccess={setUploadedAvatarUrl}
                      showHoverOverlay
                    />
                  </div>
                  {!avatarUrl && (
                    <p className='text-[12px] text-tertiary-token'>
                      Tap to add a profile photo
                    </p>
                  )}
                </div>

                {/* Editable Name + Handle */}
                <div className='text-center w-full'>
                  {isEditingName ? (
                    <div className='flex flex-col items-center gap-1'>
                      <input
                        ref={nameInputRef}
                        type='text'
                        value={editableDisplayName}
                        onChange={e => setEditableDisplayName(e.target.value)}
                        onBlur={handleNameBlur}
                        onKeyDown={handleNameKeyDown}
                        maxLength={50}
                        className='text-[16px] font-[590] text-primary-token text-center bg-transparent border-b border-accent outline-none w-full max-w-[280px] pb-0.5'
                        aria-label='Edit display name'
                      />
                      {nameError && (
                        <p className='text-[11px] text-red-500'>{nameError}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      type='button'
                      onClick={startEditingName}
                      className='group cursor-pointer'
                      aria-label='Click to edit display name'
                    >
                      <p className='text-[16px] font-[590] text-primary-token group-hover:text-accent transition-colors'>
                        {editableDisplayName}
                      </p>
                    </button>
                  )}
                  <p className='text-[13px] text-tertiary-token mt-1'>
                    @{handle}
                  </p>
                </div>

                {/* Bio */}
                {bio && (
                  <p className='text-[13px] text-secondary-token text-center max-w-sm line-clamp-3'>
                    {bio}
                  </p>
                )}

                {/* Genres */}
                {genres.length > 0 && (
                  <div className='flex flex-wrap justify-center gap-1.5'>
                    {genres.slice(0, 5).map(genre => (
                      <span
                        key={genre}
                        className='rounded-full bg-surface-1 px-2.5 py-0.5 text-[11px] font-[510] text-secondary-token capitalize'
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </ContentSurfaceCard>

            {/* CTA */}
            <div className={FORM_LAYOUT.formInner}>
              <AuthButton
                onClick={handleContinue}
                disabled={
                  isSaving ||
                  !minTimeElapsed ||
                  isEnrichingActive ||
                  !canProceed
                }
                aria-busy={isSaving || isEnrichingActive}
              >
                {getCtaLabel(
                  isSaving,
                  isEnrichingActive,
                  minTimeElapsed,
                  Boolean(avatarUrl),
                  Boolean(editableDisplayName.trim())
                )}
              </AuthButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
