'use client';

import { useRouter } from 'next/navigation';
import { memo, type ReactNode, useCallback, useMemo } from 'react';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { AccountSettingsSection } from '@/features/dashboard/organisms/account-settings';
import { DataPrivacySection } from '@/features/dashboard/organisms/DataPrivacySection';
import { SettingsAdminSection } from '@/features/dashboard/organisms/SettingsAdminSection';
import { SettingsAdPixelsSection } from '@/features/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAnalyticsSection } from '@/features/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsAudienceSection } from '@/features/dashboard/organisms/SettingsAudienceSection';
import { SettingsBillingSection } from '@/features/dashboard/organisms/SettingsBillingSection';
import { SettingsBrandingSection } from '@/features/dashboard/organisms/SettingsBrandingSection';
import { SettingsContactsSection } from '@/features/dashboard/organisms/SettingsContactsSection';
import { SettingsPaymentsSection } from '@/features/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsTouringSection } from '@/features/dashboard/organisms/SettingsTouringSection';
import { SettingsArtistProfileSection } from '@/features/dashboard/organisms/settings-artist-profile-section';
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

interface SettingsSidebarProps {
  readonly groups: ReadonlyArray<SettingsSectionGroup>;
}

const SettingsSidebar = memo(({ groups }: SettingsSidebarProps) => (
  <aside className='h-fit'>
    <div className='max-h-[calc(100vh-5rem)] overflow-y-auto rounded-[10px] border border-subtle/55 bg-surface-0/90 p-2 shadow-none backdrop-blur-sm'>
      {groups.map(group => (
        <div key={group.id} className='mb-2.5 last:mb-0'>
          <p className='mb-1.5 px-2 text-[11px] font-[590] uppercase tracking-[0.08em] text-tertiary-token'>
            {group.label}
          </p>
          <nav aria-label={`${group.label} settings`}>
            <ul className='space-y-0.5'>
              {group.sections.map(section => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className='flex min-h-8 items-center rounded-md px-2 py-1 text-[13px] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ))}
    </div>
  </aside>
));

SettingsSidebar.displayName = 'SettingsSidebar';
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
          <DashboardCard variant='settings'>
            <div className='text-center py-4'>
              <h3 className='text-[14px] font-[510] text-primary-token mb-3'>
                Account settings unavailable
              </h3>
              <p className='text-[13px] text-secondary'>
                Clerk is not configured (missing publishable key). Set
                NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable account management.
              </p>
            </div>
          </DashboardCard>
        )}
      </div>
    ),
    [isGrowth]
  );

  // -- General (user-level) settings --
  const userSections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
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
  const artistSections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
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
  const adminSections = useMemo<ReadonlyArray<SettingsSectionConfig>>(
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

  const sectionGroups = useMemo<ReadonlyArray<SettingsSectionGroup>>(
    () => [
      {
        id: 'general',
        label: 'General',
        sections: userSections,
      },
      {
        id: 'artist',
        label: 'Artist',
        sections: artistSections,
      },
      ...(adminSections.length > 0
        ? [
            {
              id: 'admin',
              label: 'Admin',
              sections: adminSections,
            },
          ]
        : []),
    ],
    [adminSections, artistSections, userSections]
  );

  const allSections = useMemo(
    () => sectionGroups.flatMap(group => group.sections),
    [sectionGroups]
  );

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

  // Full settings view with Linear-style grouped navigation
  return (
    <div
      className='mx-auto grid w-full max-w-5xl gap-7 pb-6 lg:grid-cols-[180px_minmax(0,760px)] lg:justify-center lg:gap-10'
      data-testid='settings-polished'
    >
      <div className='lg:sticky lg:top-5 lg:self-start'>
        <SettingsSidebar groups={sectionGroups} />
      </div>

      <div className='space-y-10'>
        {sectionGroups.map(group => (
          <section
            key={group.id}
            aria-label={`${group.label} settings group`}
            className='px-1'
          >
            <h3 className='mb-5 px-1 text-[12px] font-[590] uppercase tracking-[0.08em] text-tertiary-token'>
              {group.label}
            </h3>
            <div className='space-y-8'>
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
