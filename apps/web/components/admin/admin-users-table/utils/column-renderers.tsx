import { Badge } from '@jovie/ui';
import type { CellContext, HeaderContext, Table } from '@tanstack/react-table';
import { Copy, ExternalLink } from 'lucide-react';
import type { RefObject } from 'react';
import { toast } from 'sonner';
import { EmptyCell } from '@/components/atoms/EmptyCell';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  TableCheckboxCell,
} from '@/components/organisms/table';
import { getProfileUrl } from '@/constants/domains';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminUserRow } from '@/lib/admin/users';

/**
 * Renders the name cell with name and email (truncated with tooltip).
 * Falls back to "Email Subscriber" when no name is available, since names
 * are not collected during signup and the email is shown in its own column.
 */
export function renderNameCell({
  getValue,
  row,
}: CellContext<AdminUserRow, string | null>) {
  const user = row.original;
  const name = getValue();
  const displayName = name || 'Email Subscriber';
  const profileUrl = user.profileUsername
    ? getProfileUrl(user.profileUsername)
    : null;

  return (
    <div className='min-w-0'>
      <div className='group/name flex min-w-0 items-center gap-1.5'>
        <TruncatedText lines={1} className='font-semibold text-primary-token'>
          {displayName}
        </TruncatedText>
        {profileUrl ? (
          <span className='flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/name:opacity-100'>
            <button
              type='button'
              className='rounded p-0.5 text-tertiary-token hover:text-primary-token hover:bg-surface-2'
              aria-label={`Copy link for @${user.profileUsername}`}
              onClick={e => {
                e.stopPropagation();
                copyToClipboard(profileUrl).then(ok => {
                  if (ok) {
                    toast.success('Profile link copied', { duration: 2000 });
                  } else {
                    toast.error('Failed to copy link');
                  }
                });
              }}
            >
              <Copy className='h-3 w-3' />
            </button>
            <a
              href={profileUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='rounded p-0.5 text-tertiary-token hover:text-primary-token hover:bg-surface-2'
              aria-label={`Open profile for @${user.profileUsername}`}
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className='h-3 w-3' />
            </a>
          </span>
        ) : null}
      </div>
      {name && user.email ? (
        <TruncatedText lines={1} className='text-xs text-secondary-token'>
          {user.email}
        </TruncatedText>
      ) : null}
    </div>
  );
}

/**
 * Renders the Jovie username cell with hover copy/open actions
 */
export function renderUsernameCell({
  row,
}: CellContext<AdminUserRow, unknown>) {
  const username = row.original.profileUsername;

  if (!username) {
    return <EmptyCell />;
  }

  const profileUrl = getProfileUrl(username);

  return (
    <div className='group/username flex items-center gap-1.5 min-w-0'>
      <TruncatedText lines={1} className='text-secondary-token'>
        {`@${username}`}
      </TruncatedText>
      <span className='flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/username:opacity-100'>
        <button
          type='button'
          className='rounded p-0.5 text-tertiary-token hover:text-primary-token hover:bg-surface-2'
          aria-label={`Copy link for @${username}`}
          onClick={e => {
            e.stopPropagation();
            copyToClipboard(profileUrl).then(ok => {
              if (ok) {
                toast.success('Profile link copied', { duration: 2000 });
              } else {
                toast.error('Failed to copy link');
              }
            });
          }}
        >
          <Copy className='h-3 w-3' />
        </button>
        <a
          href={profileUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='rounded p-0.5 text-tertiary-token hover:text-primary-token hover:bg-surface-2'
          aria-label={`Open profile for @${username}`}
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className='h-3 w-3' />
        </a>
      </span>
    </div>
  );
}

/**
 * Renders the created date cell
 */
export function renderCreatedDateCell({
  getValue,
}: CellContext<AdminUserRow, Date | null>) {
  return <DateCell date={getValue()} />;
}

/**
 * Renders the plan badge cell
 */
export function renderPlanCell({
  getValue,
}: CellContext<AdminUserRow, string>) {
  const plan = getValue();
  return (
    <Badge size='sm' variant={plan === 'pro' ? 'primary' : 'secondary'}>
      {plan}
    </Badge>
  );
}

/**
 * Renders the profile status cell (username link or "No profile")
 */
export function renderProfileCell({
  row,
}: CellContext<AdminUserRow, string | null>) {
  const user = row.original;
  if (!user.profileUsername) {
    return <span className='text-xs text-tertiary-token'>No profile</span>;
  }
  return (
    <div className='min-w-0'>
      <TruncatedText lines={1} className='text-sm text-primary-token'>
        {`@${user.profileUsername}`}
      </TruncatedText>
      {user.profileOrigin ? (
        <span className='text-xs text-tertiary-token'>
          {user.profileOrigin}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Renders the funnel status cell showing user lifecycle state
 */
export function renderFunnelCell({ row }: CellContext<AdminUserRow, string>) {
  const status = row.original.userStatus;
  const label = status.replaceAll('_', ' ');
  let variant: 'success' | 'warning' | 'secondary';
  if (status === 'active') {
    variant = 'success';
  } else if (status === 'banned' || status === 'suspended') {
    variant = 'warning';
  } else {
    variant = 'secondary';
  }
  return (
    <Badge size='sm' variant={variant}>
      {label}
    </Badge>
  );
}

/**
 * Renders the status badge cell
 */
export function renderStatusCell({ row }: CellContext<AdminUserRow, unknown>) {
  const user = row.original;
  return user.deletedAt ? (
    <Badge size='sm' variant='warning'>
      Deleted
    </Badge>
  ) : (
    <Badge size='sm' variant='success'>
      <span className='flex items-center gap-1.5'>
        <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-success' /> Active
      </span>
    </Badge>
  );
}

const LIFECYCLE_BADGE_VARIANT: Record<
  string,
  'secondary' | 'warning' | 'success' | 'destructive' | 'primary'
> = {
  waitlist_pending: 'secondary',
  waitlist_approved: 'primary',
  profile_claimed: 'primary',
  onboarding_incomplete: 'warning',
  active: 'success',
  suspended: 'destructive',
  banned: 'destructive',
};

const LIFECYCLE_LABEL: Record<string, string> = {
  waitlist_pending: 'Waitlist',
  waitlist_approved: 'Approved',
  profile_claimed: 'Claimed',
  onboarding_incomplete: 'Onboarding',
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Banned',
};

/**
 * Renders the user lifecycle status badge
 */
export function renderLifecycleCell({
  row,
}: CellContext<AdminUserRow, unknown>) {
  const status = row.original.userStatus;
  return (
    <Badge size='sm' variant={LIFECYCLE_BADGE_VARIANT[status] ?? 'secondary'}>
      {LIFECYCLE_LABEL[status] ?? status}
    </Badge>
  );
}

/**
 * Renders the outbound suppression status
 */
export function renderSuppressionCell({
  row,
}: CellContext<AdminUserRow, unknown>) {
  const { outboundSuppressedAt, suppressionFailedAt } = row.original;
  if (suppressionFailedAt) {
    return (
      <Badge size='sm' variant='destructive'>
        Failed
      </Badge>
    );
  }
  if (outboundSuppressedAt) {
    return <DateCell date={outboundSuppressedAt} />;
  }
  return <EmptyCell />;
}

/**
 * Renders the founder welcome email status
 */
export function renderWelcomeCell({ row }: CellContext<AdminUserRow, unknown>) {
  const { founderWelcomeSentAt, welcomeFailedAt } = row.original;
  if (welcomeFailedAt) {
    return (
      <Badge size='sm' variant='destructive'>
        Failed
      </Badge>
    );
  }
  if (founderWelcomeSentAt) {
    return <DateCell date={founderWelcomeSentAt} />;
  }
  return <EmptyCell />;
}

/**
 * Creates a header renderer for the checkbox column.
 * Uses a ref for headerCheckboxState to read current value at render time,
 * preventing column recreation on every selection change.
 */
export function createSelectHeaderRenderer(
  headerCheckboxStateRef: RefObject<boolean | 'indeterminate'>,
  onToggleSelectAll: () => void
) {
  return function SelectHeader({
    table,
  }: HeaderContext<AdminUserRow, unknown>) {
    return (
      <TableCheckboxCell
        table={table as Table<AdminUserRow>}
        headerCheckboxState={headerCheckboxStateRef.current ?? false}
        onToggleSelectAll={onToggleSelectAll}
      />
    );
  };
}

/**
 * Creates a cell renderer for the checkbox column.
 * Uses a ref for selectedIds to read current value at render time,
 * preventing column recreation on every selection change.
 */
export function createSelectCellRenderer(
  selectedIdsRef: RefObject<Set<string>>,
  onToggleSelect: (id: string) => void
) {
  return function SelectCell({ row }: CellContext<AdminUserRow, unknown>) {
    const user = row.original;
    const isChecked = selectedIdsRef.current?.has(user.id) ?? false;
    const rowNumber = row.index + 1;

    return (
      <TableCheckboxCell
        row={row}
        rowNumber={rowNumber}
        isChecked={isChecked}
        onToggleSelect={() => onToggleSelect(user.id)}
      />
    );
  };
}

/**
 * Creates a cell renderer for the actions column
 */
export function createActionsCellRenderer(
  getContextMenuItems: (user: AdminUserRow) => ContextMenuItemType[]
) {
  return function ActionsCell({ row }: CellContext<AdminUserRow, unknown>) {
    const user = row.original;
    const contextMenuItems = getContextMenuItems(user);
    const actionMenuItems = convertContextMenuItems(contextMenuItems);

    return (
      <div className='flex items-center justify-end'>
        <TableActionMenu items={actionMenuItems} align='end' />
      </div>
    );
  };
}
