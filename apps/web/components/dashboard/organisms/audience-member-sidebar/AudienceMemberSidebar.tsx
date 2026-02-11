'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer.
 * Context menu items are passed from the parent table to ensure they are identical
 * to the table row context menu.
 */

import { AudienceMemberHeader } from '@/components/dashboard/atoms/AudienceMemberHeader';
import {
  DrawerEmptyState,
  DrawerHeader,
  DrawerSection,
} from '@/components/molecules/drawer';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { AudienceMemberActions } from './AudienceMemberActions';
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
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Audience member details'
      contextMenuItems={contextMenuItems}
      data-testid='audience-member-sidebar'
    >
      <DrawerHeader title='Contact' onClose={onClose} />

      <div className='flex-1 min-h-0 overflow-auto p-4 space-y-6'>
        <AudienceMemberHeader
          title={title}
          subtitle={subtitle}
          avatarName={avatarName}
          avatarSrc={avatarSrc}
        />

        {member ? (
          <div className='space-y-6'>
            <AudienceMemberDetails member={member} />

            <DrawerSection title='Recent actions'>
              <AudienceMemberActions member={member} />
            </DrawerSection>

            <DrawerSection title='Referrers'>
              <AudienceMemberReferrers member={member} />
            </DrawerSection>
          </div>
        ) : (
          <DrawerEmptyState message='Select a row in the table to view contact details.' />
        )}
      </div>
    </RightDrawer>
  );
}
