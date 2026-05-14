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
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHero } from '@/components/shell/DrawerHero';
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
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Audience member details'
      contextMenuItems={contextMenuItems}
      data-testid='audience-member-sidebar'
      onClose={onClose}
      headerMode='minimal'
      entityHeader={
        member ? (
          <DrawerHero
            title={primaryLabel}
            subtitle={secondaryLabel}
            artwork={
              <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-subtle bg-surface-0 text-sm font-semibold text-secondary-token'>
                {primaryLabel.charAt(0).toUpperCase()}
              </div>
            }
            meta={
              member.locationLabel || member.visits > 0 ? (
                <div className='flex flex-wrap items-center gap-2 text-2xs text-tertiary-token'>
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
