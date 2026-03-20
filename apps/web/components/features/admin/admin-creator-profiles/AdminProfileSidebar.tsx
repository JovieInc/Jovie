'use client';

import { Button, type CommonDropdownItem, Label } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
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
        <div className='space-y-2'>
          <ProfileContactHeader
            displayName={profile.displayName ?? profile.username}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
          />
          <div className='py-1'>
            <div className='grid grid-cols-[88px,minmax(0,1fr)] items-center gap-3'>
              <Label className='text-xs font-medium text-secondary-token'>
                Profile link
              </Label>
              <div className='flex items-center gap-2'>
                <CopyLinkInput
                  url={`${BASE_URL}/${profile.username}`}
                  size='md'
                  className='flex-1'
                  inputClassName='h-8 px-3 py-2'
                />
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  className='h-8 w-8 shrink-0 bg-surface-1'
                  onClick={() =>
                    globalThis.open(
                      `${BASE_URL}/${profile.username}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                  aria-label='Open public profile'
                >
                  <ExternalLink className='h-4 w-4' aria-hidden='true' />
                </Button>
              </div>
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
