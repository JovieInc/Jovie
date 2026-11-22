// @coverage-via apps/web/tests/unit/components/features/AudienceMemberSidebar.test.tsx
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
  DrawerEntityAvatar,
  EntityHeader,
  EntityTabbedRail,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
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

  const visitsLabel = member
    ? `${member.visits} visit${member.visits === 1 ? '' : 's'}`
    : undefined;
  const activityLine =
    member && (member.locationLabel || member.visits > 0)
      ? [member.locationLabel, visitsLabel].filter(Boolean).join(' · ')
      : undefined;
  const detailsLine = secondaryLabel ?? activityLine;

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
          <EntityHeader
            layout='grid'
            title={primaryLabel}
            subtitle={detailsLine}
            titleLineClamp={1}
            subtitleLineClamp={1}
            className='pt-3'
            titleClassName='text-base leading-5 tracking-tighter'
            thumbnail={
              <DrawerEntityAvatar
                src={computeMemberAvatarSrc(member)}
                name={computeMemberAvatarName(member, primaryLabel)}
                testId='audience-entity-avatar-frame'
              />
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
