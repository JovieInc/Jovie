'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { updateOnboardingProfile } from '@/app/onboarding/actions/update-profile';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { AuthButton } from '@/features/auth';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import { useUserAvatarMutation } from '@/lib/queries/useUserAvatarMutation';

interface OnboardingProfileReviewStepProps {
  readonly title: string;
  readonly prompt: string;
  readonly enrichedProfile: EnrichedProfileData | null;
  readonly handle: string;
  readonly onGoToDashboard: () => void;
  readonly isEnriching: boolean;
}

const ENRICHMENT_TIMEOUT_MS = 10_000;
const PROFILE_SAVE_TIMEOUT_MS = 5000;
/** Minimum time the profile preview must display before CTA enables. */
const MIN_DISPLAY_MS = 5000;

function getCtaLabel(
  isSaving: boolean,
  isEnriching: boolean,
  minTimeElapsed: boolean,
  hasAvatar: boolean
): string {
  if (isSaving) return 'Saving...';
  if (isEnriching) return 'Finishing setup...';
  if (!minTimeElapsed) return 'Reviewing your profile...';
  if (!hasAvatar) return 'Add a photo to continue';
  return 'Continue to Dashboard';
}

/**
 * Profile review step in onboarding.
 * Shows a progress bar while enrichment loads, then a read-only profile card.
 * User must click "Continue to Dashboard" to proceed.
 */
export function OnboardingProfileReviewStep({
  title,
  prompt,
  enrichedProfile,
  handle,
  onGoToDashboard,
  isEnriching,
}: OnboardingProfileReviewStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [enrichmentTimedOut, setEnrichmentTimedOut] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(
    null
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minTimeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutateAsync: uploadAvatar } = useUserAvatarMutation({
    onSuccess: (blobUrl: string) => {
      setUploadedAvatarUrl(blobUrl);
    },
  });

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      return uploadAvatar(file);
    },
    [uploadAvatar]
  );

  const showLoading = isEnriching && !enrichedProfile && !enrichmentTimedOut;

  // Start the minimum display timer when the profile card becomes visible,
  // not on mount — so slow enrichments still get the full 5s review window.
  useEffect(() => {
    if (!showLoading && !minTimeElapsed) {
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
  }, [showLoading, minTimeElapsed]);

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
  const displayName = enrichedProfile?.name || handle;
  const bio = enrichedProfile?.bio || null;
  const enrichedAvatarUrl = enrichedProfile?.imageUrl || null;
  const avatarUrl = uploadedAvatarUrl || enrichedAvatarUrl;
  const hasAvatar = Boolean(avatarUrl);
  const genres = enrichedProfile?.genres ?? [];

  // Sync enriched avatar into local state so hasAvatar reflects it
  useEffect(() => {
    if (enrichedAvatarUrl && !uploadedAvatarUrl) {
      setUploadedAvatarUrl(enrichedAvatarUrl);
    }
  }, [enrichedAvatarUrl, uploadedAvatarUrl]);

  const handleContinue = useCallback(async () => {
    setIsSaving(true);
    try {
      // Save enriched data to profile before navigating
      if (enrichedProfile) {
        await Promise.race([
          updateOnboardingProfile({
            displayName: enrichedProfile.name?.trim() || undefined,
            bio: enrichedProfile.bio?.trim() || undefined,
          }),
          new Promise((_, reject) => {
            globalThis.setTimeout(() => {
              reject(new Error('Onboarding profile save timed out'));
            }, PROFILE_SAVE_TIMEOUT_MS);
          }),
        ]);
      }
      onGoToDashboard();
    } catch {
      // Proceed to dashboard even if save fails — data is already in DB from enrichment
      onGoToDashboard();
    } finally {
      setIsSaving(false);
    }
  }, [enrichedProfile, onGoToDashboard]);

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
          /* Read-only profile card */
          <>
            <ContentSurfaceCard className='mb-6 p-6'>
              <div className='flex flex-col items-center gap-4'>
                {/* Avatar — uploadable so user can set a photo */}
                <AvatarUploadable
                  src={avatarUrl}
                  alt={displayName}
                  name={displayName}
                  size='display-md'
                  uploadable
                  onUpload={handleAvatarUpload}
                  onSuccess={setUploadedAvatarUrl}
                />
                {!hasAvatar && (
                  <p className='text-[12px] text-tertiary-token'>
                    Tap to add a profile photo
                  </p>
                )}

                {/* Name + Handle */}
                <div className='text-center'>
                  <p className='text-[16px] font-[590] text-primary-token'>
                    {displayName}
                  </p>
                  <p className='text-[13px] text-tertiary-token'>@{handle}</p>
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
                        className='rounded-full bg-surface-1 px-2.5 py-0.5 text-[11px] font-[510] text-secondary-token'
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
                  !hasAvatar ||
                  (isEnriching && !enrichmentTimedOut)
                }
                aria-busy={isSaving || (isEnriching && !enrichmentTimedOut)}
              >
                {getCtaLabel(
                  isSaving,
                  isEnriching && !enrichmentTimedOut,
                  minTimeElapsed,
                  hasAvatar
                )}
              </AuthButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
