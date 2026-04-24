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
import {
  DrawerSurfaceCard,
  DrawerTabbedCard,
  DrawerTabs,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { AudienceMemberActivityFeed } from './AudienceMemberActivityFeed';
import { AudienceMemberDetails } from './AudienceMemberDetails';
import { AudienceMemberReferrers } from './AudienceMemberReferrers';
import type { AudienceMemberSidebarProps } from './types';

type AudienceTab = 'details' | 'activity' | 'sources';

const AUDIENCE_TAB_OPTIONS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'activity' as const, label: 'Activity' },
  { value: 'sources' as const, label: 'Sources' },
];

function AudienceMemberEntityHeader({
  member,
  onClose,
  contextMenuItems,
}: Readonly<{
  member: NonNullable<AudienceMemberSidebarProps['member']>;
  onClose: () => void;
  contextMenuItems?: AudienceMemberSidebarProps['contextMenuItems'];
}>) {
  const primaryLabel =
    member.displayName?.trim() ||
    member.email ||
    member.phone ||
    'Audience member';
  const secondaryLabel =
    member.displayName?.trim() && (member.email || member.phone)
      ? member.email || member.phone
      : null;

  return (
    <DrawerSurfaceCard
      variant='flat'
      className='overflow-hidden'
      testId='audience-member-header-card'
    >
      <div className='relative border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] px-3 py-2.5'>
        <div className='absolute right-2.5 top-2.5'>
          <DrawerHeaderActions
            primaryActions={[]}
            menuItems={contextMenuItems}
            onClose={onClose}
          />
        </div>
        <EntityHeaderCard
          title={primaryLabel}
          subtitle={secondaryLabel}
          meta={
            <div className='mt-1 flex flex-wrap items-center gap-2 text-[11px] text-tertiary-token'>
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
          }
          image={
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-subtle bg-surface-0 text-[14px] font-semibold text-secondary-token'>
              {primaryLabel.charAt(0).toUpperCase()}
            </div>
          }
          className='pr-8'
        />
      </div>
    </DrawerSurfaceCard>
  );
}

export function AudienceMemberSidebar({
  member,
  isOpen,
  onClose,
  contextMenuItems,
}: AudienceMemberSidebarProps) {
  const [activeTab, setActiveTab] = useState<AudienceTab>('details');

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Audience member details'
      contextMenuItems={contextMenuItems}
      data-testid='audience-member-sidebar'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeader={
        member ? (
          <AudienceMemberEntityHeader
            member={member}
            onClose={onClose}
            contextMenuItems={contextMenuItems}
          />
        ) : undefined
      }
      isEmpty={!member}
      emptyMessage='Select a row in the table to view contact details.'
    >
      {member && (
        <DrawerTabbedCard
          testId='audience-member-tabbed-card'
          className='pt-0.5'
          tabs={
            <DrawerTabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as AudienceTab)}
              options={AUDIENCE_TAB_OPTIONS}
              ariaLabel='Audience member tabs'
              distribution='intrinsic'
            />
          }
          contentClassName='pt-2'
        >
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
        </DrawerTabbedCard>
      )}
    </EntitySidebarShell>
  );
}
