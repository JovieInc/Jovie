'use client';

import { Button } from '@jovie/ui';
import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo, type ReactNode, useCallback, useMemo } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsErrorState } from '@/components/dashboard/molecules/SettingsErrorState';
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
  readonly onRunAll: () => void;
}

const SettingsSidebar = memo(({ groups, onRunAll }: SettingsSidebarProps) => (
  <aside className='lg:sticky lg:top-4 lg:h-fit'>
    <div className='rounded-2xl border border-subtle bg-surface-1 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none'>
      <Button
        variant='secondary'
        size='sm'
        className='mb-2 w-full justify-start gap-2 rounded-lg'
        onClick={onRunAll}
      >
        <Play className='size-3.5' aria-hidden='true' />
        Run all
      </Button>
      {groups.map(group => (
        <div key={group.id} className='mb-3 last:mb-0'>
          <p className='mb-1 px-2 text-[11px] font-[590] uppercase tracking-[0.08em] text-tertiary-token'>
            {group.label}
          </p>
          <nav aria-label={`${group.label} settings`}>
            <ul className='space-y-0.5'>
              {group.sections.map(section => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className='flex items-center rounded-lg px-2 py-1.5 text-[13px] text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
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
  const handleRunAll = useCallback(() => {
    const [firstSection] = allSections;
    if (!firstSection) {
      return;
    }

    const sectionEl = globalThis.document?.getElementById(firstSection.id);
    sectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [allSections]);

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
      className='grid gap-8 pb-6 sm:pb-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10'
      data-testid='settings-polished'
    >
      <SettingsSidebar groups={sectionGroups} onRunAll={handleRunAll} />

      <div className='space-y-8'>
        {sectionGroups.map(group => (
          <div key={group.id} className='space-y-6'>
            <h3 className='text-[13px] font-[510] text-secondary-token'>
              {group.label}
            </h3>
            {group.sections.map(section => (
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
        ))}
      </div>
    </div>
  );
}
