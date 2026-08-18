'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer.
 * Context menu items are passed from the parent table to ensure they are identical
 * to the table row context menu.
 */

import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { EntityTabbedRail } from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { AudienceMemberHeader } from '@/features/dashboard/atoms/AudienceMemberHeader';
import { AudienceMemberActivityFeed } from './AudienceMemberActivityFeed';
import { AudienceMemberDetails } from './AudienceMemberDetails';
import { AudienceMemberReferrers } from './AudienceMemberReferrers';
import type { AudienceMemberSidebarProps } from './types';
import { computeMemberAvatarName, computeMemberAvatarSrc } from './utils';

type AudienceTab = 'details' | 'activity' | 'sources';

const AUDIENCE_TAB_OPTIONS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'activity' as const, label: 'Activity' },
  { value: 'sources' as const, label: 'Sources' },
];

export function AudienceMemberSidebar({
  member,
  isOpen,
  onClose,
  contextMenuItems,
}: AudienceMemberSidebarProps) {
  const [activeTab, setActiveTab] = useState<AudienceTab>('details');

  const primaryLabel =
    member?.displayName?.trim() ||
    member?.email ||
    member?.phone ||
    'Audience member';

  const secondaryLabel =
    member?.displayName?.trim() && (member.email || member.phone)
      ? (member.email ?? member.phone ?? undefined)
      : undefined;

  return (
    <EntityTabbedRail
      isOpen={isOpen}
      ariaLabel='Audience member details'
      title='Audience member'
      onClose={member ? undefined : onClose}
      contextMenuItems={contextMenuItems}
      testId='audience-member-sidebar'
      hideMinimalHeaderBar={Boolean(member)}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabOptions={AUDIENCE_TAB_OPTIONS}
      tabsAriaLabel='Audience member tabs'
      tabDistribution='fill'
      tabbedCardTestId='audience-member-tabbed-card'
      sectionKind={
        activeTab === 'details'
          ? 'facts'
          : activeTab === 'activity'
            ? 'status'
            : 'details'
      }
      contentClassName='pt-2'
      entityHeader={
        member ? (
          <AudienceMemberHeader
            title={primaryLabel}
            subtitle={secondaryLabel}
            avatarName={computeMemberAvatarName(member, primaryLabel)}
            avatarSrc={computeMemberAvatarSrc(member)}
            meta={
              member.locationLabel || member.visits > 0 ? (
                <div className='flex items-center gap-2 text-2xs text-tertiary-token'>
                  {member.locationLabel ? (
                    <span className='inline-flex items-center gap-1'>
                      <MapPin className='h-3 w-3' />
                      {member.locationLabel}
                    </span>
                  ) : null}
                  <span>
                    {member.visits} visit{member.visits === 1 ? '' : 's'}
                  </span>
                </div>
              ) : undefined
            }
            actions={
              <DrawerHeaderActions
                primaryActions={[]}
                overflowActions={[]}
                menuItems={contextMenuItems}
                onClose={onClose}
              />
            }
            data-testid='audience-member-header-card'
          />
        ) : undefined
      }
      isEmpty={!member}
      emptyMessage='Select a row in the table to view contact details.'
    >
      {member ? (
        <>
          {activeTab === 'details' && (
            <div data-testid='audience-details-card'>
              <AudienceMemberDetails member={member} />
            </div>
          )}
          {activeTab === 'activity' && (
            <div data-testid='audience-activity-card'>
              <AudienceMemberActivityFeed member={member} />
            </div>
          )}
          {activeTab === 'sources' && (
            <div data-testid='audience-sources-card'>
              <AudienceMemberReferrers member={member} />
            </div>
          )}
        </>
      ) : null}
    </EntityTabbedRail>
  );
}
