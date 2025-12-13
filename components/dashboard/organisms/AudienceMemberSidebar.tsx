'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { AudienceDetailRow } from '@/components/dashboard/atoms/AudienceDetailRow';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import { AudienceMemberHeader } from '@/components/dashboard/atoms/AudienceMemberHeader';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { cn } from '@/lib/utils';
import { formatLongDate, formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

export const AUDIENCE_MEMBER_SIDEBAR_WIDTH = 360;

export interface AudienceMemberSidebarProps {
  member: AudienceMember | null;
  isOpen: boolean;
  onClose: () => void;
}

function renderEmptyValue(fallback: string = '—'): ReactNode {
  return <span className='text-secondary-token'>{fallback}</span>;
}

export function AudienceMemberSidebar({
  member,
  isOpen,
  onClose,
}: AudienceMemberSidebarProps) {
  const isAnonymous = member?.type === 'anonymous' || !member;

  const title = isAnonymous
    ? 'Anonymous user'
    : member.displayName || member.email || member.phone || 'Visitor';

  const subtitle = isAnonymous
    ? 'Visitor'
    : member.type === 'email'
      ? (member.email ?? 'Email fan')
      : member.type === 'sms'
        ? (member.phone ?? 'SMS fan')
        : member.type === 'spotify'
          ? 'Spotify connected'
          : member.type === 'customer'
            ? 'Customer'
            : 'Visitor';

  const avatarSrc = isAnonymous ? '/avatars/default-user.png' : null;
  const avatarName = isAnonymous
    ? 'Anonymous user'
    : title || member?.id || 'Audience member';

  return (
    <RightDrawer
      isOpen={isOpen}
      width={AUDIENCE_MEMBER_SIDEBAR_WIDTH}
      ariaLabel='Audience member details'
      className='bg-sidebar-surface border-sidebar-border'
    >
      <div
        className='flex h-12 items-center justify-between border-b border-subtle px-4 shrink-0'
        data-testid='audience-member-sidebar'
      >
        <h2 className='text-[13px] font-medium text-primary-token'>Contact</h2>
        <DashboardHeaderActionButton
          ariaLabel='Close contact sidebar'
          onClick={onClose}
          icon={<XMarkIcon className='h-4 w-4' aria-hidden='true' />}
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
          <div className='space-y-3'>
            <AudienceDetailRow
              label='Location'
              value={
                member.locationLabel ? (
                  member.locationLabel
                ) : (
                  <span className='text-secondary-token'>Unknown</span>
                )
              }
            />
            <AudienceDetailRow
              label='Device'
              value={
                member.deviceType
                  ? member.deviceType
                  : renderEmptyValue('Unknown')
              }
            />
            <AudienceDetailRow label='Visits' value={String(member.visits)} />
            <AudienceDetailRow
              label='Last seen'
              value={formatLongDate(member.lastSeenAt)}
            />
            <AudienceDetailRow
              label='Intent'
              value={<AudienceIntentBadge intentLevel={member.intentLevel} />}
            />
            <AudienceDetailRow
              label='Email'
              value={member.email ?? renderEmptyValue()}
            />
            <AudienceDetailRow
              label='Phone'
              value={member.phone ?? renderEmptyValue()}
            />

            <div className='pt-2 space-y-2'>
              <div className='text-xs font-semibold uppercase tracking-wide text-secondary-token'>
                Recent actions
              </div>
              {member.latestActions.length === 0 ? (
                <div className='text-sm text-secondary-token'>
                  No actions yet.
                </div>
              ) : (
                <ul className='space-y-2'>
                  {member.latestActions.slice(0, 6).map(action => (
                    <li
                      key={`${member.id}-${action.label}-${action.timestamp ?? ''}`}
                      className={cn('text-sm text-primary-token')}
                    >
                      <span className='mr-2' aria-hidden='true'>
                        {action.emoji ?? '⭐'}
                      </span>
                      <span>{action.label}</span>
                      {action.timestamp ? (
                        <span className='ml-2 text-xs text-secondary-token'>
                          {formatTimeAgo(action.timestamp)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className='pt-2 space-y-2'>
              <div className='text-xs font-semibold uppercase tracking-wide text-secondary-token'>
                Referrers
              </div>
              {member.referrerHistory.length === 0 ? (
                <div className='text-sm text-secondary-token'>
                  No referrer data yet.
                </div>
              ) : (
                <ul className='space-y-2'>
                  {member.referrerHistory.slice(0, 6).map(ref => (
                    <li
                      key={`${member.id}-${ref.url}-${ref.timestamp ?? ''}`}
                      className='text-sm text-primary-token'
                    >
                      <div className='truncate'>{ref.url}</div>
                      {ref.timestamp ? (
                        <div className='text-xs text-secondary-token'>
                          {formatTimeAgo(ref.timestamp)}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
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
