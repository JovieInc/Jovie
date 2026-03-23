'use client';

import { redirect } from 'next/navigation';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsAdminSection } from '@/features/dashboard/organisms/SettingsAdminSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

export default function SettingsAdminPage() {
  const { isAdmin } = useDashboardData();

  if (!isAdmin) {
    redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
  }

  return (
    <SettingsSection
      id='admin'
      title='General'
      description='Dev toolbar, waitlist controls, campaign targeting, and admin quick links.'
    >
      <SettingsAdminSection />
    </SettingsSection>
  );
}
