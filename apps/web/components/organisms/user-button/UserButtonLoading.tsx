'use client';

import { INSET_PANEL_ICON_COLUMN, INSET_PANEL_ROW_LAYOUT } from '@jovie/ui';
import { SHELL_RAIL_STAGE } from '@/components/shell/rail-motion';
import { cn } from '@/lib/utils';
import { Avatar } from '../../molecules/Avatar/Avatar';
import { ACCOUNT_LOADING_FILL } from './account-loading-fill';

/**
 * The account button's placeholders and trigger avatar.
 *
 * Every placeholder uses ACCOUNT_LOADING_FILL, so the loading state stays
 * visible on the light and the dark sidebar.
 */

const PULSE = 'animate-pulse motion-reduce:animate-none';

/** Billing row in the open menu while the plan is still loading. */
export function BillingLoadingRow() {
  return (
    <div
      className={cn(INSET_PANEL_ROW_LAYOUT, 'cursor-default')}
      data-testid='billing-loading'
    >
      <span className={INSET_PANEL_ICON_COLUMN}>
        <span className={cn('size-4 rounded', PULSE, ACCOUNT_LOADING_FILL)} />
      </span>
      <span className={cn('h-3 w-20 rounded', PULSE, ACCOUNT_LOADING_FILL)} />
    </div>
  );
}

export interface UserButtonLoadingPlaceholderProps {
  /** The sidebar row with a name, or the bare avatar button. */
  readonly showUserInfo: boolean;
  /** The compact 32px sidebar row. */
  readonly calm: boolean;
}

/** Stands in for the account button until the session has loaded. */
export function UserButtonLoadingPlaceholder({
  showUserInfo,
  calm,
}: UserButtonLoadingPlaceholderProps) {
  if (!showUserInfo) {
    return (
      <div
        data-testid='user-button-loading'
        data-user-button-loading-fill
        className={cn(
          'h-10 w-10 shrink-0 rounded-full',
          PULSE,
          ACCOUNT_LOADING_FILL
        )}
      />
    );
  }
  return (
    <div
      data-testid='user-button-loading'
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0',
        // Founder lock 2026-09-25: single compact 32px row.
        calm && 'h-8'
      )}
    >
      <div
        data-user-button-loading-fill
        className={cn(
          'h-6 w-6 shrink-0 rounded-full',
          PULSE,
          ACCOUNT_LOADING_FILL
        )}
      />
      <div
        data-user-button-loading-copy
        className={cn('flex-1', SHELL_RAIL_STAGE)}
      >
        <div
          data-user-button-loading-fill
          className={cn('h-3 w-20 rounded-sm', PULSE, ACCOUNT_LOADING_FILL)}
        />
      </div>
    </div>
  );
}

export interface UserButtonTriggerAvatarProps {
  /** The compact row centres the avatar on the nav icon column. */
  readonly calm: boolean;
  readonly src: string | undefined;
  readonly name: string;
  readonly alt: string;
}

/** The avatar in the sidebar account row. */
export function UserButtonTriggerAvatar({
  calm,
  src,
  name,
  alt,
}: UserButtonTriggerAvatarProps) {
  const avatar = (
    <Avatar
      src={src}
      alt={alt}
      name={name}
      size={calm ? 'sm' : 'xs'}
      className='shrink-0'
    />
  );
  if (!calm) return avatar;
  return (
    <span data-user-button-icon-column className={INSET_PANEL_ICON_COLUMN}>
      {avatar}
    </span>
  );
}
