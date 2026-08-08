'use client';

import { PanelRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useMemo } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { AccountSettingsSection } from '@/features/dashboard/organisms/account-settings';
import { DataPrivacySection } from '@/features/dashboard/organisms/DataPrivacySection';
import { SettingsAdPixelsSection } from '@/features/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAnalyticsSection } from '@/features/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsAudienceSection } from '@/features/dashboard/organisms/SettingsAudienceSection';
import { SettingsBillingSection } from '@/features/dashboard/organisms/SettingsBillingSection';
import { SettingsContactsSection } from '@/features/dashboard/organisms/SettingsContactsSection';
import { SettingsPaymentsSection } from '@/features/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsSmsAccessSection } from '@/features/dashboard/organisms/SettingsSmsAccessSection';
import { SettingsTouringSection } from '@/features/dashboard/organisms/SettingsTouringSection';
import { SettingsUsageStatsSection } from '@/features/dashboard/organisms/SettingsUsageStatsSection';
import { SettingsArtistProfileSection } from '@/features/dashboard/organisms/settings-artist-profile-section';
import { publicEnv } from '@/lib/env-public';
import { useAppFlag } from '@/lib/flags/client';
import { useBillingStatusQuery } from '@/lib/queries';
import type { Artist } from '@/types/db';

interface SettingsPolishedProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly focusSection?: string;
}

interface SettingsSectionConfig {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly render: () => ReactNode;
}

interface SettingsSectionGroup {
  readonly id: string;
  readonly label: string;
  readonly sections: ReadonlyArray<SettingsSectionConfig>;
}

/**
 * Mobile-only trigger to open the profile panel (tabs, links, analytics, share).
 * On desktop the panel is visible as an inline sidebar; on mobile the header
 * (which normally contains the toggle) is hidden on settings pages, so this
 * provides the only way to access the full profile editing experience.
 */
function MobileProfilePanelTrigger() {
  const { open } = usePreviewPanelState();

  return (
    <button
      type='button'
      onClick={open}
      className='flex w-full items-center justify-between rounded-xl border border-subtle bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] px-3 py-3 text-left transition-colors hover:bg-surface-0 active:bg-surface-1 lg:hidden'
    >
      <div>
        <p className='text-sm font-caption text-primary-token'>
          Links, music &amp; more
        </p>
        <p className='mt-0.5 text-app text-secondary-token'>
          Manage social links, music, earnings, and about info
        </p>
      </div>
      <PanelRight
        className='h-4 w-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
    </button>
  );
}

export function SettingsPolished({
  artist,
  onArtistUpdate,
  focusSection,
}: SettingsPolishedProps) {
  const router = useRouter();
  const { data: billingData } = useBillingStatusQuery();
  const isPro = billingData?.isPro ?? false;
  const isGrowth = billingData?.plan === 'growth';
  const isStripeConnectEnabled = useAppFlag('STRIPE_CONNECT_ENABLED');

  const renderAccountSection = useCallback(
    () =>
      publicEnv.NEXT_PUBLIC_BETTER_AUTH_URL ? (
        <AccountSettingsSection isGrowth={isGrowth} />
      ) : (
        <div className='text-center py-4'>
          <h3 className='text-sm font-caption text-primary-token mb-3'>
            Account Settings Unavailable
          </h3>
          <p className='text-app text-secondary-token'>
            Account management is not configured. Set
            NEXT_PUBLIC_BETTER_AUTH_URL to enable account management.
          </p>
        </div>
      ),
    [isGrowth]
  );

  // -- Account group --
  const accountSections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
    () => [
      {
        id: 'account',
        title: 'Account',
        description:
          'Manage your security, theme, and notification preferences.',
        render: renderAccountSection,
      },
      {
        id: 'usage',
        title: 'Usage Stats',
        description:
          'Track your daily chat quota, remaining messages, and plan.',
        render: () => <SettingsUsageStatsSection />,
      },
    ],
    [renderAccountSection]
  );

  // -- Creative group (artist identity, touring) --
  const creativeSections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
    () => [
      {
        id: 'artist-profile',
        title: 'Artist Profile',
        description: 'Photo, display name, username, and profile details.',
        render: () => (
          <div className='space-y-4'>
            <SettingsArtistProfileSection
              artist={artist}
              onArtistUpdate={onArtistUpdate}
              onRefresh={() => router.refresh()}
            />
          </div>
        ),
      },
      {
        id: 'touring',
        title: 'Touring',
        description:
          'Connect Bandsintown to display tour dates on your profile.', // ui-casing-allow: Bandsintown brand name
        render: () => <SettingsTouringSection profileId={artist.id} />,
      },
    ],
    [artist, onArtistUpdate, router]
  );

  // -- Audience group (contacts, audience tracking, analytics) --
  const audienceSections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
    () => [
      {
        id: 'contacts',
        title: 'Contacts',
        description: 'Manage bookings, management, and press contacts.',
        render: () => <SettingsContactsSection artist={artist} />,
      },
      {
        id: 'audience-tracking',
        title: 'Audience & Tracking',
        description:
          'Fan verification, opt-in preferences, and conversion pixel tracking.',
        render: () => (
          <div className='space-y-4'>
            <SettingsAudienceSection />
            {isPro && (
              <SettingsSmsAccessSection
                smsSubscriberCount={0}
                alreadyRequested={false}
              />
            )}
            <SettingsAdPixelsSection isPro={isPro} />
          </div>
        ),
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
    ],
    [artist, isPro, onArtistUpdate]
  );

  // -- Monetization group (billing, payments) --
  const monetizationSections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
    () => [
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
              description: 'Connect Stripe to receive payments from fans.', // ui-casing-allow: Stripe brand name
              render: () => <SettingsPaymentsSection />,
            },
          ]
        : []),
    ],
    [isStripeConnectEnabled]
  );

  // -- Privacy & Data group --
  const privacySections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
    () => [
      {
        id: 'data-privacy',
        title: 'Data & Privacy',
        description: 'Data export and account deletion.',
        render: () => <DataPrivacySection />,
      },
    ],
    []
  );

  const sectionGroups = useMemo<ReadonlyArray<SettingsSectionGroup>>(
    () => [
      {
        id: 'account',
        label: 'Account',
        sections: accountSections,
      },
      {
        id: 'creative',
        label: 'Creative',
        sections: creativeSections,
      },
      {
        id: 'audience',
        label: 'Audience',
        sections: audienceSections,
      },
      {
        id: 'monetization',
        label: 'Monetization',
        sections: monetizationSections,
      },
      {
        id: 'privacy',
        label: 'Privacy & Data',
        sections: privacySections,
      },
    ],
    [
      accountSections,
      audienceSections,
      creativeSections,
      monetizationSections,
      privacySections,
    ]
  );

  const allSections = useMemo(
    () => sectionGroups.flatMap(group => group.sections),
    [sectionGroups]
  );

  if (
    focusSection &&
    !allSections.some(section => section.id === focusSection)
  ) {
    return (
      <div className='space-y-8 pb-6 sm:pb-8' data-testid='settings-polished'>
        <SettingsErrorState message='This settings section could not be found.' />
      </div>
    );
  }

  if (focusSection) {
    const section = allSections.find(item => item.id === focusSection)!;

    return (
      <div
        className='mx-auto w-full max-w-230 pb-6'
        data-testid='settings-polished'
      >
        <div className='space-y-5 pb-5 sm:pb-6'>
          <SettingsSection
            id={section.id}
            title={section.title}
            description={section.description}
          >
            {section.render()}
          </SettingsSection>
          {focusSection === 'artist-profile' ? (
            <MobileProfilePanelTrigger />
          ) : null}
        </div>
      </div>
    );
  }

  // Full settings view with Linear-style grouped navigation
  return (
    <div
      className='mx-auto w-full max-w-230 pb-6'
      data-testid='settings-polished'
    >
      <div className='space-y-4'>
        {sectionGroups.map(group => (
          <section
            key={group.id}
            aria-label={`${group.label} settings group`}
            className='px-0.5'
          >
            <div className='space-y-3'>
              {group.sections.map(section => (
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
          </section>
        ))}
      </div>
    </div>
  );
}
