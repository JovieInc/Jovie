'use client';

import { PanelRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { getSidebarNavRowClassName } from '@/components/shell/SidebarNavItem';
import { APP_ROUTES } from '@/constants/routes';
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

interface SettingsSidebarProps {
  readonly groups: ReadonlyArray<SettingsSectionGroup>;
  readonly activeSectionId?: string;
  readonly useRouteLinks?: boolean;
}

function getFocusedSettingsHref(sectionId: string): string {
  switch (sectionId) {
    case 'account':
      return APP_ROUTES.SETTINGS_APPEARANCE;
    case 'billing':
      return APP_ROUTES.SETTINGS_BILLING;
    case 'usage':
      return APP_ROUTES.SETTINGS_USAGE;
    case 'data-privacy':
      return APP_ROUTES.SETTINGS_DATA_PRIVACY;
    case 'artist-profile':
      return APP_ROUTES.SETTINGS_ARTIST_PROFILE;
    case 'contacts':
      return APP_ROUTES.SETTINGS_CONTACTS;
    case 'touring':
      return APP_ROUTES.SETTINGS_TOURING;
    case 'audience-tracking':
      return APP_ROUTES.SETTINGS_AUDIENCE;
    case 'analytics':
      return `${APP_ROUTES.SETTINGS}#analytics`;
    case 'payments':
      return `${APP_ROUTES.SETTINGS}#payments`;
    default:
      return APP_ROUTES.SETTINGS;
  }
}

/**
 * Settings sidebar rows share the canonical shell nav-row chrome
 * (`getSidebarNavRowClassName`) so padding/density/active/hover stay
 * byte-identical to the main app sidebar. The only divergence is
 * structural: settings rows have no icon column, so the grid collapses
 * to a single column and the icon guide lines are hidden.
 *
 * Exported for the settings-vs-shell parity test
 * (tests/unit/sidebar-row-alignment.test.tsx).
 */
export function getSettingsSidebarRowClassName(isActive: boolean): string {
  return getSidebarNavRowClassName({
    active: isActive,
    className: 'grid-cols-[minmax(0,1fr)] before:hidden after:hidden text-left',
  });
}

const SettingsSidebar = memo(
  ({
    groups,
    activeSectionId,
    useRouteLinks = false,
  }: SettingsSidebarProps) => (
    <aside className='h-fit'>
      <div className='max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-xl border border-subtle bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm'>
        {groups.map(group => (
          <div key={group.id} className='mb-2 last:mb-0'>
            <p className='mb-1 px-2.5 text-2xs font-medium tracking-tight text-tertiary-token'>
              {group.label}
            </p>
            <nav aria-label={`${group.label} settings`}>
              <ul className='space-y-1'>
                {group.sections.map(section => {
                  const isActive = section.id === activeSectionId;
                  const href = useRouteLinks
                    ? getFocusedSettingsHref(section.id)
                    : `#${section.id}`;
                  const rowClassName = getSettingsSidebarRowClassName(isActive);
                  const rowContent = (
                    <span className='min-w-0 truncate text-left justify-self-start'>
                      {section.title}
                    </span>
                  );

                  return (
                    <li key={section.id}>
                      {useRouteLinks ? (
                        <Link
                          href={href}
                          aria-current={isActive ? 'page' : undefined}
                          className={rowClassName}
                        >
                          {rowContent}
                        </Link>
                      ) : (
                        <a
                          href={href}
                          aria-current={isActive ? 'page' : undefined}
                          className={rowClassName}
                        >
                          {rowContent}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        ))}
      </div>
    </aside>
  )
);

SettingsSidebar.displayName = 'SettingsSidebar';

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
  const [activeHashSectionId, setActiveHashSectionId] = useState<
    string | undefined
  >(undefined);
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

  useEffect(() => {
    if (focusSection) return;

    const syncActiveSection = () => {
      const nextHash = globalThis.location.hash.replace(/^#/, '');
      setActiveHashSectionId(nextHash || undefined);
    };

    syncActiveSection();
    globalThis.addEventListener('hashchange', syncActiveSection);

    return () => {
      globalThis.removeEventListener('hashchange', syncActiveSection);
    };
  }, [focusSection]);

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
        className='mx-auto grid w-full max-w-230 gap-5 pb-6 lg:grid-cols-[172px_minmax(0,1fr)] lg:justify-center lg:gap-6'
        data-testid='settings-polished'
      >
        <div className='lg:sticky lg:top-4 lg:self-start'>
          <SettingsSidebar
            groups={sectionGroups}
            activeSectionId={focusSection}
            useRouteLinks
          />
        </div>

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
      className='mx-auto grid w-full max-w-230 gap-5 pb-6 lg:grid-cols-[172px_minmax(0,1fr)] lg:justify-center lg:gap-6'
      data-testid='settings-polished'
    >
      <div className='lg:sticky lg:top-4 lg:self-start'>
        <SettingsSidebar
          groups={sectionGroups}
          activeSectionId={activeHashSectionId}
        />
      </div>

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
