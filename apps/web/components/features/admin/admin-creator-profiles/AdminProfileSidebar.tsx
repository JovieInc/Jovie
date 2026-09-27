// @coverage-via apps/web/tests/unit/components/admin/AdminProfileSidebar.test.tsx
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
import type { UnclaimedIdentityEnrichmentReceipt } from '@/lib/profile/unclaimed-artist-profile';
import type { Contact } from '@/types';
import { AlgorithmHealthPanel } from './AlgorithmHealthPanel';

const SOURCE_LABELS = { musicfetch: 'MusicFetch', musicbrainz: 'MusicBrainz' };
const SOURCE_STATUS_LABELS = {
  verified: 'Verified',
  not_found: 'Not found',
  not_checked: 'Not checked',
};

function EnrichmentRow({
  label,
  value,
  warning = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly warning?: boolean;
}) {
  return (
    <div className='flex items-center justify-between gap-2 text-xs leading-4.5'>
      <span className='text-secondary-token'>{label}</span>
      <span
        className={
          warning
            ? 'font-medium text-warning'
            : 'font-medium text-primary-token'
        }
      >
        {value}
      </span>
    </div>
  );
}

/** JOV-6529: receipt states so an empty Social pane is not ambiguous. */
function IdentityEnrichmentPanel({
  receipt,
}: {
  readonly receipt: UnclaimedIdentityEnrichmentReceipt | null | undefined;
}) {
  const sources = receipt?.sources ?? {
    musicfetch: 'not_checked' as const,
    musicbrainz: 'not_checked' as const,
  };

  return (
    <section
      className='flex flex-col gap-1.5 border-t border-subtle px-1 pt-3'
      data-testid='identity-enrichment-panel'
    >
      <p className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
        Identity enrichment
      </p>
      <EnrichmentRow
        label='Status'
        value={receipt ? receipt.status : 'not_checked'}
      />
      <EnrichmentRow
        label='Share Readiness'
        value={receipt?.shareReady ? 'Share-ready' : 'Not ready — low evidence'}
        warning={!receipt?.shareReady}
      />
      {Object.entries(sources).map(([source, status]) => (
        <EnrichmentRow
          key={source}
          label={SOURCE_LABELS[source as keyof typeof SOURCE_LABELS]}
          value={SOURCE_STATUS_LABELS[status]}
        />
      ))}
      {(receipt?.conflicts ?? []).map(conflict => (
        <EnrichmentRow
          key={conflict.platform}
          label={`${conflict.platform} destinations`}
          value={`Conflicted (${conflict.urls.length})`}
          warning
        />
      ))}
    </section>
  );
}

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

interface AdminProfileSidebarProps {
  readonly profile: AdminCreatorProfileRow | null;
  readonly contact: Contact | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly contextMenuItems?: CommonDropdownItem[];
}

export function AdminProfileSidebar({
  profile,
  contact,
  isOpen,
  onClose,
  contextMenuItems,
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
          <ProfileLinkList
            links={links}
            selectedCategory={selectedCategory as CategoryOption}
            surface='plain'
          />
        ) : null}
        {selectedCategory === 'social' && !profile.isClaimed ? (
          <IdentityEnrichmentPanel receipt={profile.identityEnrichment} />
        ) : null}
      </DrawerTabbedCard>
    </EntitySidebarShell>
  );
}
