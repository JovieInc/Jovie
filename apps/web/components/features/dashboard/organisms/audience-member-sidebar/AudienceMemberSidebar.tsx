'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer.
 * Context menu items are passed from the parent table to ensure they are identical
 * to the table row context menu.
 */

import { MapPin, X } from 'lucide-react';
import { useState } from 'react';
import {
  DrawerSurfaceCard,
  DrawerTabs,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';
import { AudienceMemberActivityFeed } from './AudienceMemberActivityFeed';
import { AudienceMemberDetails } from './AudienceMemberDetails';
import { AudienceMemberReferrers } from './AudienceMemberReferrers';
import type { AudienceMemberSidebarProps } from './types';

type AudienceTab = 'details' | 'activity' | 'referrers';

const AUDIENCE_TAB_OPTIONS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'activity' as const, label: 'Activity' },
  { value: 'referrers' as const, label: 'Referrers' },
];

function AudienceMemberEntityHeader({
  member,
  onClose,
}: Readonly<{
  member: NonNullable<AudienceMemberSidebarProps['member']>;
  onClose: () => void;
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
      className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
      testId='audience-member-header-card'
    >
      <div className='relative p-3.5'>
        <div className='absolute right-2.5 top-2.5'>
          <DrawerHeaderActions
            primaryActions={[
              {
                id: 'close-audience-member',
                label: 'Close details',
                icon: X,
                onClick: onClose,
              },
            ]}
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
            <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-subtle bg-surface-0 text-[15px] font-[590] text-secondary-token'>
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
          <AudienceMemberEntityHeader member={member} onClose={onClose} />
        ) : undefined
      }
      tabs={
        member ? (
          <DrawerTabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as AudienceTab)}
            options={AUDIENCE_TAB_OPTIONS}
            ariaLabel='Audience member tabs'
            distribution='intrinsic'
          />
        ) : undefined
      }
      isEmpty={!member}
      emptyMessage='Select a row in the table to view contact details.'
    >
      {member && (
        <div className='flex min-h-full flex-col gap-2.5 pt-0.5'>
          <div className='min-h-0 flex-1'>
            {activeTab === 'details' && (
              <DrawerSurfaceCard
                className={LINEAR_SURFACE.drawerCardSm}
                testId='audience-details-card'
              >
                <div className='p-2.5'>
                  <AudienceMemberDetails member={member} />
                </div>
              </DrawerSurfaceCard>
            )}
            {activeTab === 'activity' && (
              <DrawerSurfaceCard
                className={LINEAR_SURFACE.drawerCardSm}
                testId='audience-activity-card'
              >
                <div className='p-2.5'>
                  <AudienceMemberActivityFeed member={member} />
                </div>
              </DrawerSurfaceCard>
            )}
            {activeTab === 'referrers' && (
              <DrawerSurfaceCard
                className={LINEAR_SURFACE.drawerCardSm}
                testId='audience-referrers-card'
              >
                <div className='p-2.5'>
                  <AudienceMemberReferrers member={member} />
                </div>
              </DrawerSurfaceCard>
            )}
          </div>
        </div>
      )}
    </EntitySidebarShell>
  );
}
