'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer.
 * Context menu items are passed from the parent table to ensure they are identical
 * to the table row context menu.
 */

import { useState } from 'react';
import {
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { AudienceMemberHeader } from '@/features/dashboard/atoms/AudienceMemberHeader';
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

type AudienceTab = 'details' | 'activity' | 'referrers';

const AUDIENCE_TAB_OPTIONS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'activity' as const, label: 'Activity' },
  { value: 'referrers' as const, label: 'Referrers' },
];

export function AudienceMemberSidebar({
  member,
  isOpen,
  onClose,
  contextMenuItems,
}: AudienceMemberSidebarProps) {
  const [activeTab, setActiveTab] = useState<AudienceTab>('details');
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
      title='Audience member details'
      onClose={onClose}
      headerMode='minimal'
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
        <DrawerTabbedCard
          testId='audience-member-tabbed-card'
          tabs={
            <DrawerTabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as AudienceTab)}
              options={AUDIENCE_TAB_OPTIONS}
              ariaLabel='Audience member tabs'
            />
          }
        >
          {activeTab === 'details' && <AudienceMemberDetails member={member} />}
          {activeTab === 'activity' && (
            <AudienceMemberActivityFeed member={member} />
          )}
          {activeTab === 'referrers' && (
            <AudienceMemberReferrers member={member} />
          )}
        </DrawerTabbedCard>
      )}
    </EntitySidebarShell>
  );
}
