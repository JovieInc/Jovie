'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer.
 * Context menu items are passed from the parent table to ensure they are identical
 * to the table row context menu.
 */

import {
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { AudienceMemberHeader } from '@/features/dashboard/atoms/AudienceMemberHeader';
import { AudienceMemberActions } from './AudienceMemberActions';
import { AudienceMemberActivityFeed } from './AudienceMemberActivityFeed';
import { AudienceMemberDetails } from './AudienceMemberDetails';
import { AudienceMemberReferrers } from './AudienceMemberReferrers';
import type { AudienceMemberSidebarProps } from './types';
import {
  computeMemberAvatarName,
  computeMemberAvatarSrc,
  computeMemberSubtitle,
  computeMemberTitle,
} from './utils';

export function AudienceMemberSidebar({
  member,
  isOpen,
  onClose,
  contextMenuItems,
}: AudienceMemberSidebarProps) {
  const title = computeMemberTitle(member);
  const subtitle = computeMemberSubtitle(member);
  const avatarSrc = computeMemberAvatarSrc(member);
  const avatarName = computeMemberAvatarName(member, title);

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Audience member details'
      contextMenuItems={contextMenuItems}
      data-testid='audience-member-sidebar'
      title='Contact'
      onClose={onClose}
      isEmpty={!member}
      emptyMessage='Select a row in the table to view contact details.'
      entityHeader={
        <AudienceMemberHeader
          title={title}
          subtitle={subtitle}
          avatarName={avatarName}
          avatarSrc={avatarSrc}
        />
      }
    >
      {member && (
        <>
          <DrawerSection title='Properties'>
            <AudienceMemberDetails member={member} />
          </DrawerSection>

          <DrawerSection title='Activity'>
            <AudienceMemberActivityFeed member={member} />
          </DrawerSection>

          <DrawerSection title='Recent actions'>
            <AudienceMemberActions member={member} />
          </DrawerSection>

          <DrawerSection title='Referrers'>
            <AudienceMemberReferrers member={member} />
          </DrawerSection>
        </>
      )}
    </EntitySidebarShell>
  );
}
