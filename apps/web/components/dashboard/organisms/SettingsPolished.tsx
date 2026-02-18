'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { AccountSettingsSection } from '@/components/dashboard/organisms/account-settings';
import { DataPrivacySection } from '@/components/dashboard/organisms/DataPrivacySection';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAnalyticsSection } from '@/components/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsAudienceSection } from '@/components/dashboard/organisms/SettingsAudienceSection';
import { SettingsBillingSection } from '@/components/dashboard/organisms/SettingsBillingSection';
import { SettingsBrandingSection } from '@/components/dashboard/organisms/SettingsBrandingSection';
import { SettingsContactsSection } from '@/components/dashboard/organisms/SettingsContactsSection';
import { SettingsSection } from '@/components/dashboard/organisms/SettingsSection';
import { SettingsTouringSection } from '@/components/dashboard/organisms/SettingsTouringSection';
import { SettingsArtistProfileSection } from '@/components/dashboard/organisms/settings-artist-profile-section';
import { ConnectedDspList } from '@/components/dashboard/organisms/settings-artist-profile-section/ConnectedDspList';
import { SocialsForm } from '@/components/dashboard/organisms/socials-form/SocialsForm';

import { publicEnv } from '@/lib/env-public';
import { useBillingStatusQuery } from '@/lib/queries';
import type { Artist } from '@/types/db';

interface SettingsPolishedProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly focusSection?: string;
}

export function SettingsPolished({
  artist,
  onArtistUpdate,
  focusSection,
}: SettingsPolishedProps) {
  const router = useRouter();
  const { data: billingData } = useBillingStatusQuery();
  const isPro = billingData?.isPro ?? false;

  const renderAccountSection = useCallback(
    () => (
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
    ),
    []
  );

  // -- General (user-level) settings --
  const userSections = useMemo(
    () => [
      {
        id: 'account',
        title: 'Account',
        description:
          'Manage your security, theme, and notification preferences.',
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
    ],
    [renderAccountSection]
  );

  // -- Artist-level settings --
  const artistSections = useMemo(
    () => [
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
          <ConnectedDspList
            profileId={artist.id}
            spotifyId={artist.spotify_id}
          />
        ),
      },
      {
        id: 'contacts',
        title: 'Contacts',
        description: 'Manage bookings, management, and press contacts.',
        render: () => <SettingsContactsSection artist={artist} />,
      },
      {
        id: 'touring',
        title: 'Touring',
        description:
          'Connect Bandsintown to display tour dates on your profile.',
        render: () => <SettingsTouringSection profileId={artist.id} />,
      },
      {
        id: 'branding',
        title: 'Branding',
        description: 'Custom branding for your profile page.',
        render: () => (
          <SettingsBrandingSection
            artist={artist}
            onArtistUpdate={onArtistUpdate}
            isPro={isPro}
          />
        ),
      },
      {
        id: 'ad-pixels',
        title: 'Ad Pixels',
        description: 'Facebook, Google, and TikTok conversion tracking.',
        render: () => <SettingsAdPixelsSection isPro={isPro} />,
      },
      {
        id: 'analytics',
        title: 'Analytics',
        description: 'Control how your visits appear in analytics.',
        render: () => (
          <SettingsAnalyticsSection
            artist={artist}
            onArtistUpdate={onArtistUpdate}
            isPro={isPro}
          />
        ),
      },
      {
        id: 'audience',
        title: 'Audience',
        description: 'Fan verification and opt-in preferences.',
        render: () => <SettingsAudienceSection />,
      },
    ],
    [artist, isPro, onArtistUpdate, router]
  );

  const allSections = [...userSections, ...artistSections];

  // When focusing a single section, show just that section
  if (focusSection) {
    const section = allSections.find(s => s.id === focusSection);
    if (!section) return null;

    return (
      <div
        className='space-y-4 sm:space-y-5 pb-4 sm:pb-6'
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
      className='space-y-6 sm:space-y-8 pb-4 sm:pb-6'
      data-testid='settings-polished'
    >
      {/* General settings */}
      <div className='space-y-5 sm:space-y-6'>
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
      <div className='space-y-5 sm:space-y-6'>
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
