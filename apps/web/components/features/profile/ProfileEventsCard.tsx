import type { ReactNode } from 'react';
import type { ProfileCardAccentAssignment } from '@/lib/profile/mode-card-accent';
import { ProfileModeCard } from './ProfileModeCard';

export interface ProfileEventsCardProps {
  readonly accent: ProfileCardAccentAssignment;
  /** Whether any event dates exist; false renders the truthful empty state. */
  readonly hasEvents: boolean;
  /** The event list, rendered only when `hasEvents` is true. */
  readonly children?: ReactNode;
  /** Optional event-alerts opt-in under the empty state. */
  readonly emptyAction?: ReactNode;
}

/**
 * Events mode card (Pen NdEbB). With no dates it says so plainly and offers
 * only the event-alerts opt-in; with dates it hosts the event list.
 */
export function ProfileEventsCard({
  accent,
  hasEvents,
  children,
  emptyAction,
}: Readonly<ProfileEventsCardProps>) {
  if (!hasEvents) {
    return (
      <ProfileModeCard
        accent={accent}
        eyebrow='Events'
        title='No upcoming events'
        description='New dates will appear here.'
        dataTestId='profile-primary-tab-events-empty'
      >
        {emptyAction}
      </ProfileModeCard>
    );
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
