'use client';

import { Rocket, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { AccountSettingsSection } from '@/components/dashboard/organisms/account-settings';
import { ListenNowForm } from '@/components/dashboard/organisms/ListenNowForm';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAppearanceSection } from '@/components/dashboard/organisms/SettingsAppearanceSection';
import { SettingsBillingSection } from '@/components/dashboard/organisms/SettingsBillingSection';
import { SettingsBrandingSection } from '@/components/dashboard/organisms/SettingsBrandingSection';
import { SettingsNotificationsSection } from '@/components/dashboard/organisms/SettingsNotificationsSection';
import { SettingsProGateCard } from '@/components/dashboard/organisms/SettingsProGateCard';
import { SettingsSection } from '@/components/dashboard/organisms/SettingsSection';
import { SettingsArtistProfileSection } from '@/components/dashboard/organisms/settings-artist-profile-section';
import { SocialsForm } from '@/components/dashboard/organisms/socials-form/SocialsForm';
import { APP_ROUTES } from '@/constants/routes';
import { publicEnv } from '@/lib/env-public';
import { useBillingStatusQuery } from '@/lib/queries';
import type { Artist } from '@/types/db';

interface SettingsPolishedProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly focusSection?: string;
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

  const handleBilling = async () => {
    setIsBillingLoading(true);
    await router.push(APP_ROUTES.SETTINGS_BILLING);
  };

  const renderAccountSection = () => (
    <div className='space-y-6'>
      {publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <AccountSettingsSection />
      ) : (
        <DashboardCard variant='settings'>
          <div className='text-center py-4'>
            <h3 className='text-[14px] font-medium text-primary-token mb-2'>
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
      id: 'artist-profile',
      title: 'Artist Profile',
      description:
        'Manage your profile details and connected streaming platforms.',
      render: () => (
        <SettingsArtistProfileSection
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
      render: () => <SettingsNotificationsSection />,
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
    {
      id: 'social-links',
      title: 'Social Links',
      description: 'Connect your social media accounts.',
      render: () => (
        <DashboardCard variant='settings'>
          <SocialsForm artist={artist} />
        </DashboardCard>
      ),
    },
    {
      id: 'music-links',
      title: 'Music Links',
      description: 'Add streaming platform links for your music.',
      render: () => (
        <DashboardCard variant='settings'>
          <ListenNowForm artist={artist} onUpdate={a => onArtistUpdate?.(a)} />
        </DashboardCard>
      ),
    },
  ];

  const visibleSections = focusSection
    ? sections.filter(section => section.id === focusSection)
    : sections;

  return (
    <div className='space-y-6 pb-6' data-testid='settings-polished'>
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
