'use client';

import { AlertCircle } from 'lucide-react';
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
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import type { AvatarQuality } from '@/lib/profile/avatar-quality';
import { useUserAvatarMutation } from '@/lib/queries/useUserAvatarMutation';
import { cn } from '@/lib/utils';
import {
  canProceedFromProfileReview,
  validateDisplayName as validateDisplayNameGuard,
} from './profile-review-guards';
import { useAvatarPolling } from './useAvatarPolling';

interface OnboardingProfileReviewStepProps {
  readonly title: string;
  readonly prompt: string;
  readonly enrichedProfile: EnrichedProfileData | null;
  readonly handle: string;
  readonly onGoToDashboard: () => void;
  readonly isEnriching: boolean;
  readonly avatarQuality?: AvatarQuality | null;
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
  avatarQuality = null,
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

  // Poll for background avatar upload (OAuth avatar via handleBackgroundAvatarUpload)
  const { polledAvatarUrl } = useAvatarPolling({
    enabled:
      !uploadedAvatarUrl &&
      !enrichedProfile?.imageUrl &&
      !existingAvatarUrl &&
      !isStepResume,
  });

  // Avatar state: uploaded → polled (bg upload) → enriched → existing → null
  const enrichedAvatarUrl = enrichedProfile?.imageUrl || null;
  const avatarUrl =
    uploadedAvatarUrl ||
    polledAvatarUrl ||
    enrichedAvatarUrl ||
    existingAvatarUrl;

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

  // Sync polled avatar (background OAuth upload) into local state
  useEffect(() => {
    if (polledAvatarUrl && !uploadedAvatarUrl) {
      setUploadedAvatarUrl(polledAvatarUrl);
    }
  }, [polledAvatarUrl, uploadedAvatarUrl]);

  // Update display name from enrichment when it arrives
  useEffect(() => {
    if (enrichedProfile?.name && editableDisplayName === handle) {
      setEditableDisplayName(enrichedProfile.name);
    }
  }, [enrichedProfile?.name, editableDisplayName, handle]);

  // Track photo status on mount
  useEffect(() => {
    if (!showLoading) {
      let source: 'enrichment' | 'oauth' | 'none' = 'none';
      if (enrichedProfile?.imageUrl) source = 'enrichment';
      else if (existingAvatarUrl) source = 'oauth';
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
                <div className='h-full w-[40%] rounded-full bg-(--linear-accent) animate-[onboarding-indeterminate_1.5s_ease-in-out_infinite]' />
              </div>
            </div>
            <p className='text-app text-secondary-token animate-pulse'>
              Setting up your profile...
            </p>
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
                    <p className='text-xs text-tertiary-token'>
                      Tap to add a profile photo
                    </p>
                  )}
                  {avatarQuality?.status === 'low' ? (
                    <div className='mt-2 flex max-w-[320px] items-start gap-2 rounded-[10px] border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-left text-xs text-secondary-token'>
                      <AlertCircle
                        className='mt-0.5 h-4 w-4 shrink-0 text-amber-600'
                        aria-hidden='true'
                      />
                      <p>
                        This photo is only {avatarQuality.width}x
                        {avatarQuality.height}. Jovie profiles look best at
                        512x512 or higher, so swap in a sharper image if you
                        have one.
                      </p>
                    </div>
                  ) : null}
                </div>

                {/* Editable Name + Handle */}
                <div className='text-center w-full'>
                  {isEditingName ? (
                    <div className='flex w-full flex-col items-center gap-1.5'>
                      <div
                        className={cn(
                          AUTH_SURFACE.fieldShell,
                          'mx-auto max-w-[280px] justify-center px-3 py-2.5'
                        )}
                      >
                        <input
                          ref={nameInputRef}
                          type='text'
                          value={editableDisplayName}
                          onChange={e => setEditableDisplayName(e.target.value)}
                          onBlur={handleNameBlur}
                          onKeyDown={handleNameKeyDown}
                          maxLength={50}
                          className={cn(
                            AUTH_SURFACE.fieldInput,
                            'text-center text-mid font-semibold'
                          )}
                          aria-label='Edit display name'
                        />
                      </div>
                      {nameError && (
                        <p className='text-2xs text-red-500'>{nameError}</p>
                      )}
                    </div>
                  ) : (
                    <div className='flex flex-col items-center gap-2'>
                      <button
                        type='button'
                        onClick={startEditingName}
                        className='group cursor-pointer'
                        aria-label='Edit display name'
                      >
                        <span className='text-base font-semibold text-primary-token transition-colors group-hover:text-accent'>
                          {editableDisplayName}
                        </span>
                      </button>
                      <button
                        type='button'
                        onClick={startEditingName}
                        className={AUTH_SURFACE.inlineAction}
                      >
                        Edit name
                      </button>
                    </div>
                  )}
                  <div className='mt-2'>
                    <span className={AUTH_SURFACE.subtlePill}>@{handle}</span>
                  </div>
                </div>

                {/* Bio */}
                {bio && (
                  <p className='text-app text-secondary-token text-center max-w-sm line-clamp-3'>
                    {bio}
                  </p>
                )}

                {/* Genres */}
                {genres.length > 0 && (
                  <div className='flex flex-wrap justify-center gap-1.5'>
                    {genres.slice(0, 3).map(genre => (
                      <span key={genre} className={AUTH_SURFACE.subtlePill}>
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
