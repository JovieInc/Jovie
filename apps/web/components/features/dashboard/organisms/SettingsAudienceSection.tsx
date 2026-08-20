'use client';

import { SettingsNotificationsSection } from '@/features/dashboard/organisms/SettingsNotificationsSection';

interface SettingsAudienceSectionProps {
  readonly isGrowth?: boolean;
}

export function SettingsAudienceSection({
  isGrowth = false,
}: SettingsAudienceSectionProps) {
  return <SettingsNotificationsSection isGrowth={isGrowth} />;
}
