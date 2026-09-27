// @coverage-via apps/web/components/features/profile/ProfilePrimaryTabPanel.test.tsx
import type { ReactNode } from 'react';
import { PUBLIC_EVENTS_NO_UPCOMING_HEADING } from '@/features/profile/profile-surface-state';
import type { ProfileCardAccentAssignment } from '@/lib/profile/mode-card-accent';
import { ProfileModeCard } from './ProfileModeCard';

export interface ProfileEventsCardProps {
  readonly accent: ProfileCardAccentAssignment;
  /** Whether any event dates exist; false renders the truthful empty state. */
  readonly hasEvents: boolean;
  /** The event list, rendered only when `hasEvents` is true. */
  readonly children?: ReactNode;
}

/**
 * Events mode card (Pen NdEbB). With no dates it says so plainly, with no
 * invented CTA; with dates it hosts the event list.
 */
export function ProfileEventsCard({
  accent,
  hasEvents,
  children,
}: Readonly<ProfileEventsCardProps>) {
  if (!hasEvents) {
    return (
      <ProfileModeCard
        accent={accent}
        eyebrow='Events'
        title={PUBLIC_EVENTS_NO_UPCOMING_HEADING}
        description='New dates will appear here.'
        dataTestId='profile-primary-tab-events-empty'
      />
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
