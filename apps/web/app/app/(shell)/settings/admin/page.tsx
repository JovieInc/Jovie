'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsAdminSection } from '@/features/dashboard/organisms/SettingsAdminSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

export default function SettingsAdminPage() {
  const { isAdmin } = useDashboardData();
  const router = useRouter();

  useEffect(() => {
    if (!isAdmin) {
      router.replace(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
    }
  }, [isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <SettingsSection
      id='admin'
      title='Admin'
      description='Dev toolbar, waitlist controls, campaign targeting, and admin quick links.'
    >
      <SettingsAdminSection />
    </SettingsSection>
  );
}
