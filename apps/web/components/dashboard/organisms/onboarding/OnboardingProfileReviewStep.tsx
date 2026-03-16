'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { updateOnboardingProfile } from '@/app/onboarding/actions/update-profile';
import { AuthButton } from '@/components/auth';
import { Avatar } from '@/components/molecules/Avatar/Avatar';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { FORM_LAYOUT } from '@/lib/auth/constants';

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss loading state after timeout
  useEffect(() => {
    if (isEnriching && !enrichedProfile) {
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

  const showLoading = isEnriching && !enrichedProfile && !enrichmentTimedOut;
  const displayName = enrichedProfile?.name || handle;
  const bio = enrichedProfile?.bio || null;
  const avatarUrl = enrichedProfile?.imageUrl || null;
  const genres = enrichedProfile?.genres ?? [];

  const handleContinue = useCallback(async () => {
    setIsSaving(true);
    try {
      // Save enriched data to profile before navigating
      if (enrichedProfile) {
        await Promise.race([
          updateOnboardingProfile({
            displayName: enrichedProfile.name?.trim() || handle,
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
  }, [enrichedProfile, handle, onGoToDashboard]);

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
              <div className='h-1.5 w-full overflow-hidden rounded-full bg-(--linear-bg-surface-1)'>
                <div className='h-full rounded-full bg-(--linear-accent) animate-[indeterminate_1.5s_ease-in-out_infinite]' />
              </div>
            </div>
            <p className='text-[13px] text-(--linear-text-secondary) animate-pulse'>
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
                {/* Avatar */}
                <Avatar
                  src={avatarUrl}
                  alt={displayName}
                  name={displayName}
                  size='display-md'
                />

                {/* Name + Handle */}
                <div className='text-center'>
                  <p className='text-[16px] font-[590] text-(--linear-text-primary)'>
                    {displayName}
                  </p>
                  <p className='text-[13px] text-(--linear-text-tertiary)'>
                    @{handle}
                  </p>
                </div>

                {/* Bio */}
                {bio && (
                  <p className='text-[13px] text-(--linear-text-secondary) text-center max-w-sm line-clamp-3'>
                    {bio}
                  </p>
                )}

                {/* Genres */}
                {genres.length > 0 && (
                  <div className='flex flex-wrap justify-center gap-1.5'>
                    {genres.slice(0, 5).map(genre => (
                      <span
                        key={genre}
                        className='rounded-full bg-(--linear-bg-surface-1) px-2.5 py-0.5 text-[11px] font-[510] text-(--linear-text-secondary)'
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
                disabled={isSaving}
                aria-busy={isSaving}
              >
                {isSaving ? 'Saving...' : 'Continue to Dashboard'}
              </AuthButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
