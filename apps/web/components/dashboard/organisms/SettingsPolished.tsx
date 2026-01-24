'use client';

import { Rocket, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { AccountSettingsSection } from '@/components/dashboard/organisms/account-settings';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAppearanceSection } from '@/components/dashboard/organisms/SettingsAppearanceSection';
import { SettingsBillingSection } from '@/components/dashboard/organisms/SettingsBillingSection';
import { SettingsBrandingSection } from '@/components/dashboard/organisms/SettingsBrandingSection';
import { SettingsNotificationsSection } from '@/components/dashboard/organisms/SettingsNotificationsSection';
import { SettingsProGateCard } from '@/components/dashboard/organisms/SettingsProGateCard';
import { SettingsSection } from '@/components/dashboard/organisms/SettingsSection';
import { SettingsProfileSection } from '@/components/dashboard/organisms/settings-profile-section';
import { publicEnv } from '@/lib/env-public';
import { useBillingStatusQuery } from '@/lib/queries';
import type { Artist } from '@/types/db';

interface SettingsPolishedProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
  focusSection?: string;
}

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

export function SettingsPolished({
  artist,
  onArtistUpdate,
  focusSection,
}: SettingsPolishedProps) {
  const router = useRouter();
  const { data: billingData, isLoading: billingLoading } =
    useBillingStatusQuery();
  const isPro = billingData?.isPro ?? false;
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const notificationsEnabled = true;

  const handleBilling = async () => {
    setIsBillingLoading(true);
    await router.push('/app/settings/billing');
  };

  const renderAccountSection = () => (
    <div className='space-y-6'>
      {publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <AccountSettingsSection />
      ) : (
        <DashboardCard variant='settings'>
          <div className='text-center py-4'>
            <h3 className='text-lg font-medium text-primary mb-2'>
              Account settings unavailable
            </h3>
            <p className='text-sm text-secondary'>
              Clerk is not configured (missing publishable key). Set
              NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable account management.
            </p>
          </div>
        </DashboardCard>
      )}
    </div>
  );

  const renderProUpgradeCard = (
    title: string,
    description: string,
    icon: React.ComponentType<{ className?: string }>
  ) => (
    <SettingsProGateCard
      title={title}
      description={description}
      icon={icon}
      onUpgrade={handleBilling}
      loading={isBillingLoading || billingLoading}
      buttonClassName={SETTINGS_BUTTON_CLASS}
    />
  );

  const sections = [
    {
      id: 'profile',
      title: 'Profile',
      description: 'Manage your public profile and account details.',
      render: () => (
        <SettingsProfileSection
          artist={artist}
          onArtistUpdate={onArtistUpdate}
          onRefresh={() => router.refresh()}
        />
      ),
    },
    {
      id: 'account',
      title: 'Account',
      description:
        'Manage email addresses, password, connected accounts, and more.',
      render: renderAccountSection,
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description: 'Customize how the interface looks and feels.',
      render: () => <SettingsAppearanceSection />,
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Manage your email preferences and communication settings.',
      render: () =>
        notificationsEnabled ? (
          <SettingsNotificationsSection />
        ) : (
          <DashboardCard variant='settings'>
            <div className='text-center py-4'>
              <h3 className='text-lg font-medium text-primary mb-2'>
                Notifications are not available yet
              </h3>
              <p className='text-sm text-secondary'>
                We&apos;re focused on getting the core Jovie profile experience
                right before launching notifications.
              </p>
            </div>
          </DashboardCard>
        ),
    },
    {
      id: 'branding',
      title: 'Branding',
      description:
        'Remove Jovie branding to create a fully custom experience for your fans.',
      render: () =>
        isPro ? (
          <SettingsBrandingSection
            artist={artist}
            onArtistUpdate={onArtistUpdate}
          />
        ) : (
          renderProUpgradeCard(
            'Professional Appearance',
            'Remove Jovie branding to create a fully custom experience for your fans.',
            Sparkles
          )
        ),
    },
    {
      id: 'ad-pixels',
      title: 'Ad Pixels',
      description:
        'Connect Facebook, Google, and TikTok pixels to track conversions.',
      render: () =>
        isPro ? (
          <SettingsAdPixelsSection />
        ) : (
          renderProUpgradeCard(
            'Unlock Growth Tracking',
            'Seamlessly integrate Facebook, Google, and TikTok pixels.',
            Rocket
          )
        ),
    },
    {
      id: 'billing',
      title: 'Billing & Subscription',
      description:
        'Manage your subscription, payment methods, and billing history.',
      render: () => <SettingsBillingSection />,
    },
  ];

  const visibleSections = focusSection
    ? sections.filter(section => section.id === focusSection)
    : sections;

  return (
    <div className='space-y-8 pb-8' data-testid='settings-polished'>
      {visibleSections.map(section => (
        <SettingsSection
          key={section.id}
          id={section.id}
          title={section.title}
          description={section.description}
        >
          {section.render()}
        </SettingsSection>
      ))}
    </div>
  );
}
