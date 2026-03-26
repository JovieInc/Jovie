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
  DrawerSection,
  DrawerSurfaceCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { AudienceMemberHeader } from '@/features/dashboard/atoms/AudienceMemberHeader';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';
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
        <DrawerSurfaceCard
          className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
        >
          <div className='p-2.5'>
            <AudienceMemberHeader
              title={title}
              subtitle={subtitle}
              avatarName={avatarName}
              avatarSrc={avatarSrc}
            />
          </div>
        </DrawerSurfaceCard>
      }
      tabs={
        <DrawerTabs
          value={activeTab}
          onValueChange={value => setActiveTab(value as AudienceTab)}
          options={AUDIENCE_TAB_OPTIONS}
          ariaLabel='Audience member tabs'
        />
      }
    >
      {member && (
        <>
          {activeTab === 'details' && (
            <DrawerSection
              title='Properties'
              className='space-y-1.5'
              surface='card'
            >
              <AudienceMemberDetails member={member} />
            </DrawerSection>
          )}
          {activeTab === 'activity' && (
            <DrawerSection
              title='Activity'
              className='space-y-1.5'
              surface='card'
            >
              <AudienceMemberActivityFeed member={member} />
            </DrawerSection>
          )}
          {activeTab === 'referrers' && (
            <DrawerSection
              title='Referrers'
              className='space-y-1.5'
              surface='card'
            >
              <AudienceMemberReferrers member={member} />
            </DrawerSection>
          )}
        </>
      )}
    </EntitySidebarShell>
  );
}
