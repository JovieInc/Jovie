'use client';

/**
 * AudienceMemberSidebar Component
 *
 * Displays detailed information about an audience member in a right-side drawer
 */

import { X } from 'lucide-react';
import { AudienceMemberHeader } from '@/components/dashboard/atoms/AudienceMemberHeader';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { AudienceMemberActions } from './AudienceMemberActions';
import { AudienceMemberDetails } from './AudienceMemberDetails';
import { AudienceMemberReferrers } from './AudienceMemberReferrers';
import {
  AUDIENCE_MEMBER_SIDEBAR_WIDTH,
  type AudienceMemberSidebarProps,
} from './types';
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
}: AudienceMemberSidebarProps) {
  const title = computeMemberTitle(member);
  const subtitle = computeMemberSubtitle(member);
  const avatarSrc = computeMemberAvatarSrc(member);
  const avatarName = computeMemberAvatarName(member, title);

  return (
    <RightDrawer
      isOpen={isOpen}
      width={AUDIENCE_MEMBER_SIDEBAR_WIDTH}
      ariaLabel='Audience member details'
    >
      <div
        className='flex h-12 items-center justify-between px-4 shrink-0'
        data-testid='audience-member-sidebar'
      >
        <h2 className='text-[13px] font-medium text-primary-token'>Contact</h2>
        <DashboardHeaderActionButton
          ariaLabel='Close contact sidebar'
          onClick={onClose}
          icon={<X aria-hidden='true' />}
        />
      </div>

      <div className='flex-1 min-h-0 overflow-auto p-4 space-y-6'>
        <AudienceMemberHeader
          title={title}
          subtitle={subtitle}
          avatarName={avatarName}
          avatarSrc={avatarSrc}
        />

        {member ? (
          <div className='space-y-6'>
            <AudienceMemberDetails member={member} />

            <div className='pt-2 space-y-2'>
              <div className='text-xs font-semibold uppercase tracking-wide text-secondary-token'>
                Recent actions
              </div>
              <AudienceMemberActions member={member} />
            </div>

            <div className='pt-2 space-y-2'>
              <div className='text-xs font-semibold uppercase tracking-wide text-secondary-token'>
                Referrers
              </div>
              <AudienceMemberReferrers member={member} />
            </div>
          </div>
        ) : (
          <div className='text-sm text-secondary-token'>
            Select a row in the table to view contact details.
          </div>
        )}
      </div>
    </RightDrawer>
  );
}
