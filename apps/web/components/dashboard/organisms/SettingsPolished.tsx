'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsErrorState } from '@/components/dashboard/molecules/SettingsErrorState';
import { SettingsGroupHeading } from '@/components/dashboard/molecules/SettingsGroupHeading';
import { AccountSettingsSection } from '@/components/dashboard/organisms/account-settings';
import { DataPrivacySection } from '@/components/dashboard/organisms/DataPrivacySection';
import { SettingsAdminSection } from '@/components/dashboard/organisms/SettingsAdminSection';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAnalyticsSection } from '@/components/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsAudienceSection } from '@/components/dashboard/organisms/SettingsAudienceSection';
import { SettingsBillingSection } from '@/components/dashboard/organisms/SettingsBillingSection';
import { SettingsBrandingSection } from '@/components/dashboard/organisms/SettingsBrandingSection';
import { SettingsContactsSection } from '@/components/dashboard/organisms/SettingsContactsSection';
import { SettingsPaymentsSection } from '@/components/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/components/dashboard/organisms/SettingsSection';
import { SettingsTouringSection } from '@/components/dashboard/organisms/SettingsTouringSection';
import { SettingsArtistProfileSection } from '@/components/dashboard/organisms/settings-artist-profile-section';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { publicEnv } from '@/lib/env-public';
import { useFeatureGate } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';
import { useBillingStatusQuery } from '@/lib/queries';
import type { Artist } from '@/types/db';

interface SettingsPolishedProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly focusSection?: string;
  readonly isAdmin?: boolean;
}

export function SettingsPolished({
  artist,
  onArtistUpdate,
  focusSection,
  isAdmin = false,
}: SettingsPolishedProps) {
  const router = useRouter();
  const { data: billingData } = useBillingStatusQuery();
  const isPro = billingData?.isPro ?? false;
  const isGrowth = billingData?.plan === 'growth';
  const isStripeConnectEnabled = useFeatureGate(
    FEATURE_FLAG_KEYS.STRIPE_CONNECT_ENABLED
  );

  const renderAccountSection = useCallback(
    () => (
      <div className='space-y-0'>
        {publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <AccountSettingsSection isGrowth={isGrowth} />
        ) : (
          <DashboardCard
            variant='settings'
            padding='none'
            className='overflow-hidden'
          >
            <div className='px-4 py-3'>
              <ContentSurfaceCard className='px-6 py-8 text-center bg-(--linear-bg-surface-0)'>
                <h3 className='mb-2 text-[14px] font-[510] text-primary-token'>
                  Account settings unavailable
                </h3>
                <p className='text-[13px] text-secondary'>
                  Clerk is not configured (missing publishable key). Set
                  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable account
                  management.
                </p>
              </ContentSurfaceCard>
            </div>
          </DashboardCard>
        )}
      </div>
    ),
    [isGrowth]
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
      ...(isStripeConnectEnabled
        ? [
            {
              id: 'payments',
              title: 'Payments',
              description: 'Connect Stripe to receive payments from fans.',
              render: () => <SettingsPaymentsSection />,
            },
          ]
        : []),
      {
        id: 'data-privacy',
        title: 'Data & Privacy',
        description: 'Data export and account deletion.',
        render: () => <DataPrivacySection />,
      },
    ],
    [renderAccountSection, isStripeConnectEnabled]
  );

  // -- Artist-level settings --
  const artistSections = useMemo(
    () => [
      {
        id: 'artist-profile',
        title: 'Artist Profile',
        description: 'Photo, display name, username, and branding.',
        render: () => (
          <div className='space-y-6'>
            <SettingsArtistProfileSection
              artist={artist}
              onArtistUpdate={onArtistUpdate}
              onRefresh={() => router.refresh()}
            />
            <SettingsBrandingSection
              artist={artist}
              onArtistUpdate={onArtistUpdate}
              isPro={isPro}
            />
          </div>
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
        id: 'audience-tracking',
        title: 'Audience & Tracking',
        description:
          'Fan verification, opt-in preferences, and conversion pixel tracking.',
        render: () => (
          <div className='space-y-6'>
            <SettingsAudienceSection />
            <SettingsAdPixelsSection isPro={isPro} />
          </div>
        ),
      },
    ],
    [artist, isPro, onArtistUpdate, router]
  );

  // -- Admin-only settings (only visible to admin users) --
  const adminSections = useMemo(
    () =>
      isAdmin
        ? [
            {
              id: 'admin',
              title: 'Admin',
              description:
                'Platform administration: waitlist, campaigns, and system settings.',
              render: () => <SettingsAdminSection />,
            },
          ]
        : [],
    [isAdmin]
  );

  const allSections = [...userSections, ...artistSections, ...adminSections];

  // When focusing a single section, show just that section
  if (focusSection) {
    const section = allSections.find(s => s.id === focusSection);
    if (!section) {
      return (
        <div className='space-y-8 pb-6 sm:pb-8' data-testid='settings-polished'>
          <SettingsErrorState message='This settings section could not be found.' />
        </div>
      );
    }

    return (
      <div className='space-y-8 pb-6 sm:pb-8' data-testid='settings-polished'>
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
    <div className='space-y-8 pb-6 sm:pb-8' data-testid='settings-polished'>
      {/* General settings */}
      <div className='space-y-6'>
        <SettingsGroupHeading>General</SettingsGroupHeading>
        {userSections.map(section => (
          <SettingsSection
            key={section.id}
            id={section.id}
            title={section.title}
            description={section.description}
            className='mt-6 first:mt-0'
          >
            {section.render()}
          </SettingsSection>
        ))}
      </div>

      {/* Artist settings */}
      <div className='space-y-6'>
        <SettingsGroupHeading>Artist</SettingsGroupHeading>
        {artistSections.map(section => (
          <SettingsSection
            key={section.id}
            id={section.id}
            title={section.title}
            description={section.description}
            className='mt-6 first:mt-0'
          >
            {section.render()}
          </SettingsSection>
        ))}
      </div>

      {/* Admin settings - only visible to admin users */}
      {adminSections.length > 0 && (
        <div className='space-y-6'>
          <SettingsGroupHeading>Admin</SettingsGroupHeading>
          {adminSections.map(section => (
            <SettingsSection
              key={section.id}
              id={section.id}
              title={section.title}
              description={section.description}
              className='mt-6 first:mt-0'
            >
              {section.render()}
            </SettingsSection>
          ))}
        </div>
      )}
    </div>
  );
}
