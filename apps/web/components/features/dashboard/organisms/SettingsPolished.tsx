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
import { APP_ROUTES } from '@/constants/routes';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { AccountSettingsSection } from '@/features/dashboard/organisms/account-settings';
import { DataPrivacySection } from '@/features/dashboard/organisms/DataPrivacySection';
import { SettingsAdminSection } from '@/features/dashboard/organisms/SettingsAdminSection';
import { SettingsAdPixelsSection } from '@/features/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAnalyticsSection } from '@/features/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsAudienceSection } from '@/features/dashboard/organisms/SettingsAudienceSection';
import { SettingsBillingSection } from '@/features/dashboard/organisms/SettingsBillingSection';
import { SettingsContactsSection } from '@/features/dashboard/organisms/SettingsContactsSection';
import { SettingsPaymentsSection } from '@/features/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsSmsAccessSection } from '@/features/dashboard/organisms/SettingsSmsAccessSection';
import { SettingsTouringSection } from '@/features/dashboard/organisms/SettingsTouringSection';
import { SettingsArtistProfileSection } from '@/features/dashboard/organisms/settings-artist-profile-section';
import { publicEnv } from '@/lib/env-public';
import { useAppFlag } from '@/lib/flags/client';
import { useBillingStatusQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
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
  readonly activeSectionId?: string;
  readonly useRouteLinks?: boolean;
}

function getFocusedSettingsHref(sectionId: string): string {
  switch (sectionId) {
    case 'account':
      return APP_ROUTES.SETTINGS_ACCOUNT;
    case 'billing':
      return APP_ROUTES.SETTINGS_BILLING;
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
    case 'admin':
      return APP_ROUTES.SETTINGS_ADMIN;
    case 'analytics':
      return `${APP_ROUTES.SETTINGS}#analytics`;
    case 'payments':
      return `${APP_ROUTES.SETTINGS}#payments`;
    default:
      return APP_ROUTES.SETTINGS;
  }
}

const SettingsSidebar = memo(
  ({
    groups,
    activeSectionId,
    useRouteLinks = false,
  }: SettingsSidebarProps) => (
    <aside className='h-fit'>
      <div className='max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-[14px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm'>
        {groups.map(group => (
          <div key={group.id} className='mb-2 last:mb-0'>
            <p className='mb-1 px-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-tertiary-token'>
              {group.label}
            </p>
            <nav aria-label={`${group.label} settings`}>
              <ul className='space-y-1'>
                {group.sections.map(section => {
                  const isActive = section.id === activeSectionId;
                  const href = useRouteLinks
                    ? getFocusedSettingsHref(section.id)
                    : `#${section.id}`;
                  return (
                    <li key={section.id}>
                      {useRouteLinks ? (
                        <Link
                          href={href}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs tracking-[-0.012em] transition-colors',
                            isActive
                              ? 'border border-(--linear-app-frame-seam) bg-surface-0 text-primary-token'
                              : 'border border-transparent text-secondary-token hover:bg-surface-0 hover:text-primary-token'
                          )}
                        >
                          {section.title}
                        </Link>
                      ) : (
                        <a
                          href={href}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs tracking-[-0.012em] transition-colors',
                            isActive
                              ? 'border border-(--linear-app-frame-seam) bg-surface-0 text-primary-token'
                              : 'border border-transparent text-secondary-token hover:bg-surface-0 hover:text-primary-token'
                          )}
                        >
                          {section.title}
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
      className='flex w-full items-center justify-between rounded-[14px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] px-3 py-3 text-left transition-colors hover:bg-surface-0 active:bg-surface-1 lg:hidden'
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
  isAdmin = false,
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
      publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <AccountSettingsSection isGrowth={isGrowth} />
      ) : (
        <div className='text-center py-4'>
          <h3 className='text-sm font-caption text-primary-token mb-3'>
            Account settings unavailable
          </h3>
          <p className='text-app text-secondary'>
            Clerk is not configured (missing publishable key). Set
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable account management.
          </p>
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
          'Manage your security, theme, and creator verification preferences.',
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
              title: 'General',
              description:
                'Dev toolbar, waitlist controls, campaign targeting, and admin quick links.',
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
        className='mx-auto grid w-full max-w-[920px] gap-5 pb-6 lg:grid-cols-[172px_minmax(0,1fr)] lg:justify-center lg:gap-6'
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
      className='mx-auto grid w-full max-w-[920px] gap-5 pb-6 lg:grid-cols-[172px_minmax(0,1fr)] lg:justify-center lg:gap-6'
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
            <h3 className='mb-2 px-1 text-xs font-semibold tracking-[-0.012em] text-secondary-token'>
              {group.label}
            </h3>
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
