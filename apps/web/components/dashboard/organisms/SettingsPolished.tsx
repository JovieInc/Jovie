'use client';

import { BarChart3, Rocket, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { AccountSettingsSection } from '@/components/dashboard/organisms/account-settings';
import { DataPrivacySection } from '@/components/dashboard/organisms/DataPrivacySection';
import { ListenNowForm } from '@/components/dashboard/organisms/listen-now-form';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAnalyticsSection } from '@/components/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsAppearanceSection } from '@/components/dashboard/organisms/SettingsAppearanceSection';
import { SettingsBillingSection } from '@/components/dashboard/organisms/SettingsBillingSection';
import { SettingsBrandingSection } from '@/components/dashboard/organisms/SettingsBrandingSection';
import { SettingsNotificationsSection } from '@/components/dashboard/organisms/SettingsNotificationsSection';
import { SettingsProGateCard } from '@/components/dashboard/organisms/SettingsProGateCard';
import { SettingsSection } from '@/components/dashboard/organisms/SettingsSection';
import { SettingsArtistProfileSection } from '@/components/dashboard/organisms/settings-artist-profile-section';
import { ConnectedDspList } from '@/components/dashboard/organisms/settings-artist-profile-section/ConnectedDspList';
import { SocialsForm } from '@/components/dashboard/organisms/socials-form/SocialsForm';
import { SettingsMenu } from '@/components/settings/organisms/SettingsMenu';
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
      id: 'billing',
      title: 'Billing & Subscription',
      description:
        'Manage your subscription, payment methods, and billing history.',
      render: () => <SettingsBillingSection />,
    },
    {
      id: 'data-privacy',
      title: 'Data & Privacy',
      description: 'Export your data or delete your account.',
      render: () => <DataPrivacySection />,
    },
  ];

  // -- Artist-level settings --
  const artistSections = [
    {
      id: 'artist-profile',
      title: 'Artist Profile',
      description: 'Manage your photo, display name, and username.',
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
      description: 'Connect your social media accounts.',
      render: () => <SocialsForm artist={artist} />,
    },
    {
      id: 'music-links',
      title: 'Music Links',
      description:
        'Connect streaming platforms and manage your music profile links.',
      render: () => (
        <div className='space-y-4 sm:space-y-6'>
          <div>
            <h3 className='text-[13px] sm:text-sm font-medium text-primary-token mb-2 sm:mb-3'>
              Connected Platforms
            </h3>
            <ConnectedDspList
              profileId={artist.id}
              spotifyId={artist.spotify_id}
            />
          </div>
          <div>
            <h3 className='text-[13px] sm:text-sm font-medium text-primary-token mb-2 sm:mb-3'>
              Streaming Links
            </h3>
            <ListenNowForm
              artist={artist}
              onUpdate={a => onArtistUpdate?.(a)}
            />
          </div>
        </div>
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
      id: 'analytics',
      title: 'Analytics',
      description:
        'Control how your own activity is tracked in your analytics.',
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
        className='grid gap-4 pb-4 sm:gap-6 sm:pb-6 lg:grid-cols-[240px_minmax(0,1fr)]'
        data-testid='settings-polished'
      >
        <div className='lg:sticky lg:top-4 lg:self-start'>
          <SettingsMenu focusSection={focusSection} />
        </div>
        <SettingsSection
          id={section.id}
          title={section.title}
          description={section.description}
          className='rounded-xl border border-subtle bg-base p-4 sm:p-6'
          headerClassName='mb-4 sm:mb-5'
        >
          {section.render()}
        </SettingsSection>
      </div>
    );
  }

  // Full settings view with group headers
  return (
    <div
      className='grid gap-4 pb-4 sm:gap-6 sm:pb-6 lg:grid-cols-[240px_minmax(0,1fr)]'
      data-testid='settings-polished'
    >
      <div className='lg:sticky lg:top-4 lg:self-start'>
        <SettingsMenu />
      </div>

      <div className='space-y-4 rounded-xl border border-subtle bg-base p-4 sm:space-y-6 sm:p-6'>
        <div className='space-y-2'>
          <h1 className='text-xl font-semibold text-primary-token'>Settings</h1>
          <p className='text-sm text-secondary-token'>
            Everything that controls your account, experience, and artist page.
          </p>
        </div>

        {/* General settings */}
        <div className='space-y-4 sm:space-y-6'>
          <h2 className='text-xs font-medium uppercase tracking-wider text-tertiary-token'>
            General
          </h2>
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
        <div className='space-y-4 border-t border-subtle pt-4 sm:space-y-6 sm:pt-6'>
          <h2 className='text-xs font-medium uppercase tracking-wider text-tertiary-token'>
            Artist
          </h2>
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
    </div>
  );
}
