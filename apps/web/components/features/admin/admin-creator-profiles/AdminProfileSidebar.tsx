'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { DrawerTabs, EntitySidebarShell } from '@/components/molecules/drawer';
import { BASE_URL } from '@/constants/domains';
import { CopyLinkInput } from '@/features/dashboard/atoms/CopyLinkInput';
import { ProfileAboutTab } from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab';
import { ProfileContactHeader } from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileContactHeader';
import {
  type CategoryOption,
  ProfileLinkList,
} from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileLinkList';
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
      title='Creator profile'
      onClose={onClose}
      entityHeader={
        <div className='space-y-3'>
          <ProfileContactHeader
            displayName={profile.displayName ?? profile.username}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
          />
          <div className='grid grid-cols-[74px,minmax(0,1fr)] items-center gap-2.5'>
            <span className='text-[10px] font-[510] uppercase tracking-[0.08em] text-quaternary-token'>
              Profile link
            </span>
            <div className='flex items-center gap-2'>
              <CopyLinkInput
                url={`${BASE_URL}/${profile.username}`}
                size='sm'
                className='flex-1'
                inputClassName='h-8 px-2.5 py-1.5 text-[12px]'
              />
              <AppIconButton
                ariaLabel='Open public profile'
                className='h-8 w-8 shrink-0 rounded-[8px] bg-transparent text-quaternary-token hover:bg-surface-1 hover:text-secondary-token focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/20 [&_svg]:h-3.5 [&_svg]:w-3.5'
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
      tabsContainerClassName='border-t border-subtle/60 px-4.5 py-1.5'
      tabs={
        <DrawerTabs
          value={selectedCategory}
          onValueChange={value =>
            setSelectedCategory(value as CategoryOption | 'about')
          }
          options={PROFILE_TAB_OPTIONS}
          ariaLabel='Creator profile sidebar view'
          className='rounded-[10px] bg-surface-1/80 p-0.5'
          triggerClassName='h-7 px-2.5 text-[11px] text-secondary-token'
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
