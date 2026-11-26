import type { ReactNode } from 'react';
import type { ProfileCardAccentAssignment } from '@/lib/profile/mode-card-accent';
import { ProfileModeCard } from './ProfileModeCard';

export interface ProfileEventsCardProps {
  readonly accent: ProfileCardAccentAssignment;
  /** Whether any event dates exist; false hides the section entirely. */
  readonly hasEvents: boolean;
  /** The event list, rendered only when `hasEvents` is true. */
  readonly children?: ReactNode;
  /** Retained for callers; unused now that empty Events is hidden (JOV-14241). */
  readonly emptyAction?: ReactNode;
}

/**
 * Events mode card (Pen NdEbB). Hidden when there are no upcoming dates
 * (JOV-14241); with dates it hosts the event list.
 */
export function ProfileEventsCard({
  accent,
  hasEvents,
  children,
}: Readonly<ProfileEventsCardProps>) {
  // JOV-14241: hide Events entirely when empty (nav also drops the tab).
  if (!hasEvents) {
    return null;
  }

  return (
    <ProfileModeCard
      accent={accent}
      eyebrow='Events'
      dataTestId='profile-events-card'
    >
      {children}
    </ProfileModeCard>
  );
}
