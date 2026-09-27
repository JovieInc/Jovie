import type { ReactNode } from 'react';
import type { ProfileCardAccentAssignment } from '@/lib/profile/mode-card-accent';
import { ProfileModeCard } from './ProfileModeCard';

export interface ProfileStayCloseCardProps {
  readonly accent: ProfileCardAccentAssignment;
  /** The alerts sign-up flow. */
  readonly children: ReactNode;
}

/**
 * Stay close mode card (Pen MvmY2). The alerts flow keeps its own step
 * headings, canonical labels, OTP, and consent copy, so the card adds only
 * the eyebrow and the rotating accent around it.
 */
export function ProfileStayCloseCard({
  accent,
  children,
}: Readonly<ProfileStayCloseCardProps>) {
  return (
    <ProfileModeCard
      accent={accent}
      eyebrow='Stay close'
      dataTestId='profile-primary-tab-subscribe'
    >
      {children}
    </ProfileModeCard>
  );
}
