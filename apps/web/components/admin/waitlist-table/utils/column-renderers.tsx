import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import type { CellContext, HeaderContext, Table } from '@tanstack/react-table';
import { ShoppingBag, Ticket, TrendingUp } from 'lucide-react';
import { StatusBadge } from '@/components/atoms/StatusBadge';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  TableCheckboxCell,
} from '@/components/organisms/table';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { PLATFORM_LABELS, PRIMARY_GOAL_LABELS } from '../constants';

/**
 * Renders a name cell with primary token styling
 */
export function renderNameCell(value: string) {
  return <span className='font-medium text-primary-token'>{value}</span>;
}

/**
 * Renders an email cell as a mailto link
 */
export function renderEmailCell(value: string) {
  return (
    <a
      href={`mailto:${value}`}
      className='text-secondary-token hover:underline'
    >
      {value}
    </a>
  );
}

/**
 * Renders a date cell using the DateCell component
 */
export function renderDateCellWrapper(date: Date | null) {
  return <DateCell date={date} />;
}

/**
 * Renders the primary goal cell with appropriate icon and badge
 */
export function renderPrimaryGoalCell(value: string | null) {
  const primaryGoalLabel = value ? (PRIMARY_GOAL_LABELS[value] ?? value) : null;

  // Icon mapping for primary goals
  const GOAL_ICONS: Record<string, typeof TrendingUp> = {
    streams: TrendingUp,
    merch: ShoppingBag,
    tickets: Ticket,
  };
  const GoalIcon = value ? (GOAL_ICONS[value] ?? null) : null;

  return primaryGoalLabel ? (
    <Badge size='sm' variant='secondary' className='gap-1'>
      {GoalIcon && <GoalIcon className='h-3 w-3' />}
      {primaryGoalLabel}
    </Badge>
  ) : (
    <span className='text-tertiary-token'>—</span>
  );
}

/**
 * Extracts username from a social media URL
 */
function extractUsername(url: string): string {
  const urlWithoutProtocol = url.replace(/^https?:\/\//, '');
  return urlWithoutProtocol.split('/').pop() || urlWithoutProtocol;
}

/**
 * Renders the primary social platform cell
 */
export function renderPrimarySocialCell(entry: WaitlistEntryRow) {
  const platformLabel =
    PLATFORM_LABELS[entry.primarySocialPlatform] ?? entry.primarySocialPlatform;
  const username = extractUsername(entry.primarySocialUrlNormalized);

  return (
    <PlatformPill
      platformIcon={entry.primarySocialPlatform.toLowerCase()}
      platformName={platformLabel}
      primaryText={`@${username}`}
      onClick={() => window.open(entry.primarySocialUrlNormalized, '_blank')}
    />
  );
}

/**
 * Renders the Spotify platform cell
 */
export function renderSpotifyCell(spotifyUrl: string | null) {
  if (!spotifyUrl) {
    return <span className='text-tertiary-token'>—</span>;
  }

  const artistName = extractUsername(spotifyUrl) || 'Spotify';

  return (
    <PlatformPill
      platformIcon='spotify'
      platformName='Spotify'
      primaryText={`@${artistName}`}
      onClick={() => window.open(spotifyUrl, '_blank')}
    />
  );
}

/**
 * Renders the "Heard About" cell with truncation and tooltip for long text
 */
export function renderHeardAboutCell(value: string | null) {
  if (!value) {
    return <span className='text-tertiary-token'>—</span>;
  }

  const truncatedValue = value.length > 30 ? value.slice(0, 30) + '…' : value;

  if (value.length > 30) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='cursor-help text-secondary-token'>
            {truncatedValue}
          </span>
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-xs'>
          {value}
        </TooltipContent>
      </Tooltip>
    );
  }

  return <span className='text-secondary-token'>{value}</span>;
}

/**
 * Renders the status badge cell
 */
export function renderStatusCell(status: WaitlistEntryRow['status']) {
  const statusLabels: Record<WaitlistEntryRow['status'], string> = {
    new: 'New',
    invited: 'Invited',
    claimed: 'Claimed',
  };

  const statusVariants: Record<
    WaitlistEntryRow['status'],
    'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray'
  > = {
    new: 'blue',
    invited: 'orange',
    claimed: 'green',
  };

  return (
    <StatusBadge variant={statusVariants[status]}>
      {statusLabels[status]}
    </StatusBadge>
  );
}

/**
 * Creates a header renderer for the checkbox column
 */
export function createSelectHeaderRenderer(
  headerCheckboxState: boolean | 'indeterminate',
  onToggleSelectAll: () => void
) {
  return function SelectHeader({
    table,
  }: HeaderContext<WaitlistEntryRow, unknown>) {
    return (
      <TableCheckboxCell
        table={table as Table<WaitlistEntryRow>}
        headerCheckboxState={headerCheckboxState}
        onToggleSelectAll={onToggleSelectAll}
      />
    );
  };
}

/**
 * Creates a cell renderer for the checkbox column
 */
export function createSelectCellRenderer(
  selectedIds: Set<string>,
  page: number,
  pageSize: number,
  onToggleSelect: (id: string) => void
) {
  return function SelectCell({ row }: CellContext<WaitlistEntryRow, unknown>) {
    const entry = row.original;
    const isChecked = selectedIds.has(entry.id);
    const rowNumber = (page - 1) * pageSize + row.index + 1;

    return (
      <TableCheckboxCell
        row={row}
        rowNumber={rowNumber}
        isChecked={isChecked}
        onToggleSelect={() => onToggleSelect(entry.id)}
      />
    );
  };
}

/**
 * Creates a cell renderer for the actions column
 */
export function createActionsCellRenderer(
  getContextMenuItems: (entry: WaitlistEntryRow) => ContextMenuItemType[]
) {
  return function ActionsCell({ row }: CellContext<WaitlistEntryRow, unknown>) {
    const entry = row.original;
    const contextMenuItems = getContextMenuItems(entry);
    const actionMenuItems = convertContextMenuItems(contextMenuItems);

    return (
      <div className='flex items-center justify-end'>
        <TableActionMenu items={actionMenuItems} align='end' />
      </div>
    );
  };
}
