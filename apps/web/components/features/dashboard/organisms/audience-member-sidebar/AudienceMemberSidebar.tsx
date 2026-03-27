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
  DrawerSurfaceCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
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
      title='Audience member details'
      onClose={onClose}
      headerMode='minimal'
      isEmpty={!member}
      emptyMessage='Select a row in the table to view contact details.'
    >
      {member && (
        <div className='flex min-h-full flex-col gap-2.5 pt-0.5'>
          <div className='flex min-h-0 flex-1 flex-col gap-2.5'>
            <DrawerTabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as AudienceTab)}
              options={AUDIENCE_TAB_OPTIONS}
              ariaLabel='Audience member tabs'
              overflowMode='scroll'
            />

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
        </div>
      )}
    </EntitySidebarShell>
  );
}
