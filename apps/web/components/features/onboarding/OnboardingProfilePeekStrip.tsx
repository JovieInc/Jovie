'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
  type OnboardingProfileBuilderState,
  resolvePreviewArtist,
} from './onboardingProfileRailState';

export interface OnboardingProfilePeekStripProps {
  readonly state: OnboardingProfileBuilderState;
  readonly className?: string;
}

/**
 * 390 peek strip above the keyboard (JOV-14243). Shows draft identity only;
 * never grows into the composer or pushes inputs. Full phone preview stays
 * on the side rail at lg+.
 */
export function OnboardingProfilePeekStrip({
  state,
  className,
}: OnboardingProfilePeekStripProps) {
  const artist = resolvePreviewArtist(state);
  if (!artist) return null;

  const handle = state.handle ? `@${state.handle}` : null;
  const imageUrl = artist.imageUrl ?? null;

  return (
    <aside
      className={cn('system-b-onboarding-profile-peek', className)}
      data-testid='onboarding-profile-peek-strip'
      aria-label='Profile Preview'
    >
      <div className='system-b-onboarding-profile-peek-inner'>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=''
            width={28}
            height={28}
            className='system-b-onboarding-profile-peek-avatar'
            unoptimized
          />
        ) : (
          <span
            className='system-b-onboarding-profile-peek-avatar system-b-onboarding-profile-peek-avatar-empty'
            aria-hidden
          />
        )}
        <div className='system-b-onboarding-profile-peek-copy min-w-0'>
          <p className='system-b-onboarding-profile-peek-name truncate'>
            {artist.name}
          </p>
          {handle ? (
            <p className='system-b-onboarding-profile-peek-handle truncate'>
              {handle}
            </p>
          ) : null}
        </div>
        <span className='system-b-onboarding-profile-peek-badge'>Preview</span>
      </div>
    </aside>
  );
}
