'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer.
 * Context menu items are passed from the parent table to ensure they are identical
 * to the table row context menu.
 */

import {
  DrawerSection,
  DrawerSurfaceCard,
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
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Audience member details'
      contextMenuItems={contextMenuItems}
      data-testid='audience-member-sidebar'
      title='Audience'
      onClose={onClose}
      isEmpty={!member}
      emptyMessage='Select a row in the table to view contact details.'
      entityHeader={
        <DrawerSurfaceCard
          className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
        >
          <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
            <p className='text-[11px] font-[510] leading-none text-tertiary-token'>
              Audience
            </p>
          </div>
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
    >
      {member && (
        <>
          <DrawerSection className='space-y-1.5'>
            <AudienceMemberDetails member={member} />
          </DrawerSection>

          <DrawerSection title='Activity' className='space-y-1.5'>
            <AudienceMemberActivityFeed member={member} />
          </DrawerSection>

          <DrawerSection title='Referrers' className='space-y-1.5'>
            <AudienceMemberReferrers member={member} />
          </DrawerSection>
        </>
      )}
    </EntitySidebarShell>
  );
}
