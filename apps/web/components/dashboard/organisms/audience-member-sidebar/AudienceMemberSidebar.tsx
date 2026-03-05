'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer.
 * Context menu items are passed from the parent table to ensure they are identical
 * to the table row context menu.
 */

import { SegmentControl } from '@jovie/ui';
import { useState } from 'react';
import { AudienceMemberHeader } from '@/components/dashboard/atoms/AudienceMemberHeader';
import {
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
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

type SidebarTab = 'details' | 'activity';

const SIDEBAR_TAB_OPTIONS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'activity' as const, label: 'Activity' },
];

export function AudienceMemberSidebar({
  member,
  isOpen,
  onClose,
  contextMenuItems,
}: AudienceMemberSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('details');

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
      tabs={
        member ? (
          <SegmentControl
            value={activeTab}
            onValueChange={setActiveTab}
            options={SIDEBAR_TAB_OPTIONS}
            size='sm'
            aria-label='Contact sidebar view'
          />
        ) : undefined
      }
    >
      {member && activeTab === 'details' && (
        <>
          <AudienceMemberDetails member={member} />

          <DrawerSection title='Recent actions'>
            <AudienceMemberActions member={member} />
          </DrawerSection>

          <DrawerSection title='Referrers'>
            <AudienceMemberReferrers member={member} />
          </DrawerSection>
        </>
      )}

      {member && activeTab === 'activity' && (
        <AudienceMemberActivityFeed member={member} />
      )}
    </EntitySidebarShell>
  );
}
