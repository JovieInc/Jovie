'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import { ProfileAboutTab } from '@/components/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab';
import { ProfileContactHeader } from '@/components/dashboard/organisms/profile-contact-sidebar/ProfileContactHeader';
import {
  type CategoryOption,
  ProfileLinkList,
} from '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList';
import { DrawerTabs, EntitySidebarShell } from '@/components/molecules/drawer';
import { BASE_URL } from '@/constants/domains';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { Contact } from '@/types';

const PROFILE_TAB_OPTIONS = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'about' as const, label: 'About' },
];

function mapContactLinksToPreviewLinks(contact: Contact): PreviewPanelLink[] {
  return contact.socialLinks.map(link => ({
    id: link.id ?? `${contact.id}-${link.url}`,
    title: link.label,
    url: link.url,
    platform: link.platformType ?? 'website',
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
    CategoryOption | 'about'
  >('social');

  const links = useMemo(() => {
    if (!contact) return [];
    return mapContactLinksToPreviewLinks(contact);
  }, [contact]);

  if (!profile || !contact) {
    return (
      <EntitySidebarShell
        isOpen={isOpen}
        ariaLabel='Creator profile'
        title='Creator profile'
        onClose={onClose}
        isEmpty
        emptyMessage='Select a creator profile to view details.'
      >
        {null}
      </EntitySidebarShell>
    );
  }

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Creator profile'
      title='Creator profile'
      onClose={onClose}
      contextMenuItems={contextMenuItems}
      tabsContainerClassName='px-4 py-1.5'
      entityHeader={
        <div className='space-y-2.5'>
          <ProfileContactHeader
            displayName={profile.displayName ?? profile.username}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
          />
          <div className='grid grid-cols-[72px,minmax(0,1fr)] items-center gap-2'>
            <span className='text-[9.5px] font-[510] uppercase tracking-[0.1em] text-(--linear-text-tertiary)'>
              Profile link
            </span>
            <div className='flex items-center gap-2'>
              <CopyLinkInput
                url={`${BASE_URL}/${profile.username}`}
                size='sm'
                className='flex-1'
                inputClassName='h-[30px] rounded-[9px] px-2.5 py-1 text-[11.5px]'
                buttonClassName='right-1'
              />
              <AppIconButton
                ariaLabel='Open public profile'
                className='h-[30px] w-[30px] shrink-0 rounded-[9px] bg-transparent text-(--linear-text-quaternary) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-secondary) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/25 [&_svg]:h-[13px] [&_svg]:w-[13px]'
                onClick={() =>
                  globalThis.open(
                    `${BASE_URL}/${profile.username}`,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                <ExternalLink className='h-4 w-4' aria-hidden='true' />
              </AppIconButton>
            </div>
          </div>
        </div>
      }
      tabs={
        <DrawerTabs
          value={selectedCategory}
          onValueChange={value =>
            setSelectedCategory(value as CategoryOption | 'about')
          }
          options={PROFILE_TAB_OPTIONS}
          ariaLabel='Creator profile sidebar view'
          triggerClassName='h-[30px] px-2.5 text-[11.5px]'
        />
      }
    >
      {selectedCategory === 'about' ? (
        <ProfileAboutTab
          bio={profile.bio ?? null}
          genres={profile.genres ?? null}
          allowPhotoDownloads={false}
        />
      ) : (
        <ProfileLinkList
          links={links}
          selectedCategory={selectedCategory as CategoryOption}
        />
      )}
    </EntitySidebarShell>
  );
}
