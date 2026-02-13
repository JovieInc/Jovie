'use client';

import { BarChart3, Rocket, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { AccountSettingsSection } from '@/components/dashboard/organisms/account-settings';
import { DataPrivacySection } from '@/components/dashboard/organisms/DataPrivacySection';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAnalyticsSection } from '@/components/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsBillingSection } from '@/components/dashboard/organisms/SettingsBillingSection';
import { SettingsBrandingSection } from '@/components/dashboard/organisms/SettingsBrandingSection';
import { SettingsProGateCard } from '@/components/dashboard/organisms/SettingsProGateCard';
import { SettingsSection } from '@/components/dashboard/organisms/SettingsSection';
import { SettingsArtistProfileSection } from '@/components/dashboard/organisms/settings-artist-profile-section';
import { ConnectedDspList } from '@/components/dashboard/organisms/settings-artist-profile-section/ConnectedDspList';
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
    <div className='space-y-3 sm:space-y-6'>
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

  // -- General (user-level) settings --
  const userSections = [
    {
      id: 'account',
      title: 'Account',
      description: 'Manage your security, theme, and notification preferences.',
      render: renderAccountSection,
    },
    {
      id: 'billing',
      title: 'Billing & Subscription',
      description: 'Subscription, payment methods, and invoices.',
      render: () => <SettingsBillingSection />,
    },
    {
      id: 'data-privacy',
      title: 'Data & Privacy',
      description: 'Data export and account deletion.',
      render: () => <DataPrivacySection />,
    },
  ];

  // -- Artist-level settings --
  const artistSections = [
    {
      id: 'artist-profile',
      title: 'Artist Profile',
      description: 'Photo, display name, and username.',
      render: () => (
        <SettingsArtistProfileSection
          artist={artist}
          onArtistUpdate={onArtistUpdate}
          onRefresh={() => router.refresh()}
        />
      ),
    },
    {
      id: 'social-links',
      title: 'Social Links',
      description: 'Connect your social media profiles.',
      render: () => <SocialsForm artist={artist} />,
    },
    {
      id: 'music-links',
      title: 'Music Links',
      description: 'Streaming platforms and music profile links.',
      render: () => (
        <ConnectedDspList profileId={artist.id} spotifyId={artist.spotify_id} />
      ),
    },
    {
      id: 'branding',
      title: 'Branding',
      description: 'Custom branding for your profile page.',
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
      description: 'Facebook, Google, and TikTok conversion tracking.',
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
      id: 'analytics',
      title: 'Analytics',
      description: 'Control how your visits appear in analytics.',
      render: () =>
        isPro ? (
          <SettingsAnalyticsSection
            artist={artist}
            onArtistUpdate={onArtistUpdate}
          />
        ) : (
          renderProUpgradeCard(
            'Pro Analytics Filtering',
            'Exclude your own visits from analytics to get cleaner data about your real audience.',
            BarChart3
          )
        ),
    },
  ];

  const allSections = [...userSections, ...artistSections];

  // When focusing a single section, show just that section
  if (focusSection) {
    const section = allSections.find(s => s.id === focusSection);
    if (!section) return null;

    return (
      <div
        className='space-y-4 sm:space-y-6 pb-4 sm:pb-6'
        data-testid='settings-polished'
      >
        <SettingsSection
          id={section.id}
          title={section.title}
          description={section.description}
        >
          {section.render()}
        </SettingsSection>
      </div>
    );
  }

  // Full settings view with group headers
  return (
    <div
      className='space-y-8 sm:space-y-10 pb-4 sm:pb-6'
      data-testid='settings-polished'
    >
      {/* General settings */}
      <div className='space-y-6 sm:space-y-8'>
        <h3 className='text-[13px] font-medium text-tertiary-token'>General</h3>
        {userSections.map(section => (
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

      {/* Artist settings */}
      <div className='space-y-6 sm:space-y-8'>
        <h3 className='text-[13px] font-medium text-tertiary-token'>Artist</h3>
        {artistSections.map(section => (
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
    </div>
  );
}
