'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { useMemo, useState } from 'react';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  DrawerAnalyticsSummaryCard,
  DrawerCardActionBar,
  DrawerTabbedCard,
  DrawerTabs,
  EntityHeaderCard,
  EntitySidebarShell,
  ShareableLinkRow,
} from '@/components/molecules/drawer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { useProfileHeaderParts } from '@/components/organisms/profile-sidebar/ProfileSidebarHeader';
import { BASE_URL } from '@/constants/domains';
import { ProfileAboutTab } from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab';
import {
  type CategoryOption,
  ProfileLinkList,
} from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileLinkList';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { AdminIdentityEnrichment } from '@/lib/queries/useAdminSocialLinksQuery';
import type { Contact } from '@/types';
import { AlgorithmHealthPanel } from './AlgorithmHealthPanel';

const PROFILE_TAB_OPTIONS = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'algorithm' as const, label: 'Algorithm' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'about' as const, label: 'About' },
];

function mapContactLinksToPreviewLinks(contact: Contact): PreviewPanelLink[] {
  return contact.socialLinks.map(link => ({
    id: link.id ?? `${contact.id}-${link.url}`,
    title: link.label,
    url: link.url,
    platform: link.platform ?? link.platformType ?? 'website',
    isVisible: true,
  }));
}

const IDENTITY_STATUS_LABELS: Record<string, string> = {
  verified: 'Verified',
  not_found: 'Not found',
  not_checked: 'Not checked',
  conflicted: 'Conflicted',
};

// Per-platform identity evidence from the enrichment pass (JOV-6529);
function IdentityEnrichmentStatusList({
  enrichment,
}: {
  readonly enrichment: AdminIdentityEnrichment;
}) {
  const entries = Object.entries(enrichment.platformStatus).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return (
    <div
      className='mb-3 rounded-md border border-subtle'
      data-testid='identity-enrichment-status'
    >
      <div className='mb-1.5 flex items-center justify-between'>
        <span className='text-xs font-medium text-secondary-token'>
          Identity evidence
        </span>
        <span className='text-xs text-tertiary-token'>
          {enrichment.shareReadiness === 'ready'
            ? 'Share-ready'
            : 'Limited evidence'}
        </span>
      </div>
      <ul className='space-y-1'>
        {entries.map(([platform, status]) => (
          <li
            key={platform}
            className='flex items-center justify-between text-xs'
          >
            <span className='text-secondary-token'>{platform}</span>
            <span
              className='text-tertiary-token'
              title={
                status.conflicts?.length
                  ? `Conflicting identities: ${status.conflicts.join(', ')}`
                  : undefined
              }
            >
              {IDENTITY_STATUS_LABELS[status.status] ?? status.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface AdminProfileSidebarProps {
  readonly profile: AdminCreatorProfileRow | null;
  readonly contact: Contact | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly contextMenuItems?: CommonDropdownItem[];
  readonly identityEnrichment?: AdminIdentityEnrichment | null;
}

export function AdminProfileSidebar({
  profile,
  contact,
  isOpen,
  onClose,
  contextMenuItems,
  identityEnrichment,
}: AdminProfileSidebarProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    CategoryOption | 'about' | 'algorithm'
  >('social');

  const links = useMemo(() => {
    if (!contact) return [];
    return mapContactLinksToPreviewLinks(contact);
  }, [contact]);

  const { primaryActions } = useProfileHeaderParts({
    username: profile?.username ?? '',
    displayName: profile?.displayName ?? profile?.username ?? '',
    profilePath: profile?.username ? `/${profile.username}` : '',
  });

  if (!profile || !contact) {
    return (
      <EntitySidebarShell
        isOpen={isOpen}
        ariaLabel='Creator profile'
        title='Creator profile'
        onClose={onClose}
        headerMode='minimal'
        contextMenuItems={contextMenuItems}
        isEmpty
        emptyMessage='Select a creator profile to view details.'
      >
        {null}
      </EntitySidebarShell>
    );
  }

  return (
    <EntitySidebarShell
      contextMenuItems={contextMenuItems}
      isOpen={isOpen}
      ariaLabel='Creator profile'
      headerMode='minimal'
      hideMinimalHeaderBar
      workspaceSurface='raised'
      entityHeaderSurface='flat'
      entityHeader={
        <>
          <EntityHeaderCard
            title={profile.displayName ?? profile.username}
            subtitle={`@${profile.username}`}
            stableLayout
            titleLineClamp={1}
            subtitleLineClamp={1}
            reserveSubtitleSlot
            reserveMetaSlot
            metaOverflow='scroll'
            image={
              <AvatarUploadable
                src={profile.avatarUrl}
                alt={`${profile.displayName ?? profile.username} avatar`}
                name={profile.displayName ?? profile.username}
                size='2xl'
              />
            }
            meta={profile.location ? <span>{profile.location}</span> : null}
            actions={
              <DrawerCardActionBar
                primaryActions={primaryActions}
                menuItems={contextMenuItems}
                onClose={onClose}
                overflowTriggerPlacement='card-top-right'
                className='border-0 bg-transparent px-0 py-0'
              />
            }
            bodyClassName='pr-9'
            data-testid='admin-creator-entity-header'
          />
          <DrawerAnalyticsSummaryCard
            testId='admin-creator-summary'
            state='ready'
            stableLayout
            reserveFooterSlot
            metricSlotCount={2}
            metrics={[
              {
                id: 'linked-destinations',
                label: 'Linked Destinations',
                value: String(links.length),
              },
              {
                id: 'profile-state',
                label: 'Profile State',
                value: profile.isVerified
                  ? 'Verified'
                  : profile.isClaimed
                    ? 'Claimed'
                    : 'Unclaimed',
              },
            ]}
            footer={
              <ShareableLinkRow
                url={`${BASE_URL}/${profile.username}`}
                density='rail'
                surface='flat'
                copyButtonTitle='Copy Profile Link'
                openButtonTitle='Open Profile'
                testId='admin-creator-profile-link'
              />
            }
          />
        </>
      }
    >
      <DrawerTabbedCard
        testId='admin-profile-tabbed-card'
        tabs={
          <DrawerTabs
            value={selectedCategory}
            onValueChange={value =>
              setSelectedCategory(
                value as CategoryOption | 'about' | 'algorithm'
              )
            }
            options={PROFILE_TAB_OPTIONS}
            ariaLabel='Creator profile sidebar view'
          />
        }
      >
        {selectedCategory === 'about' ? (
          <ProfileAboutTab
            bio={profile.bio ?? null}
            genres={profile.genres ?? null}
            location={profile.location ?? null}
            hometown={profile.hometown ?? null}
            activeSinceYear={profile.activeSinceYear ?? null}
            allowPhotoDownloads={false}
            showOldReleases={false}
          />
        ) : null}
        {selectedCategory === 'algorithm' ? (
          <AlgorithmHealthPanel
            profile={profile}
            contact={contact}
            isActive={selectedCategory === 'algorithm'}
          />
        ) : null}
        {selectedCategory !== 'about' && selectedCategory !== 'algorithm' ? (
          <>
            {selectedCategory === 'social' && identityEnrichment ? (
              <IdentityEnrichmentStatusList enrichment={identityEnrichment} />
            ) : null}
            <ProfileLinkList
              links={links}
              selectedCategory={selectedCategory as CategoryOption}
              surface='plain'
            />
          </>
        ) : null}
      </DrawerTabbedCard>
    </EntitySidebarShell>
  );
}
