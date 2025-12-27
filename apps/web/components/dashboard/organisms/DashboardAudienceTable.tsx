'use client';

import { BellAlertIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as React from 'react';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { AdminPageSizeSelect } from '@/components/admin/table/AdminPageSizeSelect';
import { SortableHeaderButton } from '@/components/admin/table/SortableHeaderButton';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { Icon } from '@/components/atoms/Icon';
import { AudienceRowActionsMenu } from '@/components/dashboard/AudienceRowActionsMenu';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import {
  AUDIENCE_MEMBER_SIDEBAR_WIDTH,
  AudienceMemberSidebar,
} from '@/components/dashboard/organisms/AudienceMemberSidebar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';
import {
  formatCountryLabel,
  formatLongDate,
  formatTimeAgo,
  getDeviceIndicator,
} from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

export type AudienceMode = 'members' | 'subscribers';

type AudienceRow = AudienceMember;

type MemberSortColumn =
  | 'lastSeen'
  | 'visits'
  | 'intent'
  | 'type'
  | 'engagement'
  | 'createdAt';

type SubscriberSortColumn = 'email' | 'phone' | 'country' | 'createdAt';

type MemberColumnKey = (typeof MEMBER_COLUMNS)[number]['key'];

type SubscriberColumnKey = (typeof SUBSCRIBER_COLUMNS)[number]['key'];

type ColumnKey = MemberColumnKey | SubscriberColumnKey;

const MEMBER_COLUMNS = [
  { key: 'displayName', label: 'User' },
  { key: 'type', label: 'Type' },
  { key: 'location', label: 'Location' },
  { key: 'device', label: 'Device' },
  { key: 'visits', label: 'Visits' },
  { key: 'actions', label: 'Actions' },
  { key: 'lastSeen', label: 'Last seen' },
] as const;

const SUBSCRIBER_COLUMNS = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' },
  { key: 'createdAt', label: 'Signed up' },
] as const;

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function resolveAudienceActionIcon(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('visit')) return 'Eye';
  if (normalized.includes('view')) return 'Eye';
  if (normalized.includes('tip')) return 'HandCoins';
  if (normalized.includes('purchase')) return 'CreditCard';
  if (normalized.includes('subscribe')) return 'Bell';
  if (normalized.includes('follow')) return 'UserPlus';
  if (normalized.includes('click')) return 'MousePointerClick';
  if (normalized.includes('link')) return 'Link';
  return 'Sparkles';
}

export interface DashboardAudienceTableProps {
  mode: AudienceMode;
  rows: AudienceRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sort: string) => void;
  profileUrl?: string;
}

export function DashboardAudienceTable({
  mode,
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  profileUrl,
}: DashboardAudienceTableProps) {
  const notifications = useNotifications();
  const { setTableMeta } = useTableMeta();
  const tableContainerRef = React.useRef<HTMLDivElement | null>(null);
  const tbodyRef = React.useRef<HTMLTableSectionElement | null>(null);
  const [headerElevated, setHeaderElevated] = React.useState(false);
  const [openMenuRowId, setOpenMenuRowId] = React.useState<string | null>(null);
  const [selectedMember, setSelectedMember] =
    React.useState<AudienceRow | null>(null);
  const [copiedProfileLink, setCopiedProfileLink] = React.useState(false);
  const copyTimeoutRef = React.useRef<number | null>(null);

  const rowIds = React.useMemo(() => rows.map(row => row.id), [rows]);
  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useRowSelection(rowIds);

  React.useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setHeaderElevated(container.scrollTop > 0);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    clearSelection();
    setSelectedMember(null);
  }, [mode, page, pageSize, sort, direction, clearSelection]);

  React.useEffect(() => {
    const toggle = () => {
      if (rows.length === 0) return;
      setSelectedMember(current => (current ? null : (rows[0] ?? null)));
    };

    setTableMeta({
      rowCount: rows.length,
      toggle: rows.length > 0 ? toggle : null,
      rightPanelWidth: selectedMember ? AUDIENCE_MEMBER_SIDEBAR_WIDTH : 0,
    });

    return () => {
      setTableMeta({ rowCount: null, toggle: null, rightPanelWidth: null });
    };
  }, [rows, selectedMember, setTableMeta]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeColumns =
    mode === 'members' ? MEMBER_COLUMNS : SUBSCRIBER_COLUMNS;

  /**
   * Virtual scrolling configuration for table rows.
   *
   * Virtualization dramatically improves performance for large datasets (500+ rows)
   * by only rendering rows that are visible in the viewport, plus a small buffer.
   * This reduces DOM node count from O(n) to O(viewport_height / row_height + overscan).
   *
   * Configuration choices:
   * - estimateSize: 60px - Based on the actual rendered row height with padding (py-3 = 12px * 2)
   *   and content. This doesn't need to be exact since we use measureElement for dynamic sizing,
   *   but a close estimate prevents layout shifts during initial render.
   * - overscan: 5 - Renders 5 extra rows above and below the visible area. This provides:
   *   1. Smoother scrolling by pre-rendering rows before they become visible
   *   2. Better keyboard navigation (rows exist in DOM before focus reaches them)
   *   3. Reduced "blank flash" during fast scrolling
   *   Higher values (e.g., 10) would be smoother but increase DOM size; 5 is a good balance.
   *
   * @see https://tanstack.com/virtual/latest/docs/api/virtualizer
   */
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const sortableColumnMap: Partial<
    Record<ColumnKey, MemberSortColumn | SubscriberSortColumn>
  > = {
    visits: 'visits',
    lastSeen: 'lastSeen',
    email: 'email',
    phone: 'phone',
    country: 'country',
    createdAt: 'createdAt',
  };

  const selectedRows = React.useMemo(
    () => rows.filter(row => selectedIds.has(row.id)),
    [rows, selectedIds]
  );

  const copySelectedEmails = async (): Promise<void> => {
    const emails = selectedRows
      .map(row => row.email)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      );

    if (emails.length === 0) {
      notifications.error('No emails available for selected rows');
      return;
    }

    const success = await copyTextToClipboard(emails.join('\n'));
    if (success) {
      notifications.success(`Copied ${emails.length} email(s)`);
      return;
    }

    notifications.error('Failed to copy emails');
  };

  const copySelectedPhones = async (): Promise<void> => {
    const phones = selectedRows
      .map(row => row.phone)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      );

    if (phones.length === 0) {
      notifications.error('No phone numbers available for selected rows');
      return;
    }

    const success = await copyTextToClipboard(phones.join('\n'));
    if (success) {
      notifications.success(`Copied ${phones.length} phone number(s)`);
      return;
    }

    notifications.error('Failed to copy phone numbers');
  };

  const paginationLabel = () => {
    if (total === 0) {
      return mode === 'members'
        ? 'No audience yet. Share your profile to invite visitors.'
        : 'No signups yet. Invite fans to tap the bell.';
    }

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `Showing ${start}–${end} of ${total} readers`;
  };

  const handleCopyProfileLink = React.useCallback(async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      notifications.success('Profile link copied');
      setCopiedProfileLink(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedProfileLink(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy profile link', error);
      notifications.error('Unable to copy profile link');
    }
  }, [notifications, profileUrl]);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const emptyStateHeading =
    mode === 'members' ? 'No audience yet' : 'No signups yet';
  const emptyStateDescription =
    mode === 'members'
      ? 'Share your profile to invite visitors. They will appear here as soon as they stop by.'
      : 'Invite fans to tap the bell on your profile to receive notifications.';
  const emptyStateIcon =
    mode === 'members' ? (
      <UserGroupIcon className='h-6 w-6' aria-hidden='true' />
    ) : (
      <BellAlertIcon className='h-6 w-6' aria-hidden='true' />
    );
  const emptyStatePrimaryAction = profileUrl
    ? {
        label: copiedProfileLink ? 'Link copied' : 'Copy profile link',
        onClick: () => {
          void handleCopyProfileLink();
        },
      }
    : {
        label: 'Open profile settings',
        href: '/app/dashboard/profile',
      };
  const emptyStateSecondaryAction = {
    label:
      mode === 'members' ? 'Learn about audience' : 'Learn about subscribers',
    href: '/support',
  };

  return (
    <div
      className='flex h-full min-h-0 flex-col'
      data-testid='dashboard-audience-table'
    >
      <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
              Audience CRM
            </h1>
            <p className='mt-1 text-sm leading-6 text-secondary-token'>
              {mode === 'members'
                ? 'Every visitor, anonymous or identified, lives in this table.'
                : 'Notification signups from your notification modal.'}
            </p>
          </div>
          <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-secondary-token'>
            {total} {total === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>

      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div className='flex-1 min-h-0 overflow-auto' ref={tableContainerRef}>
            {rows.length === 0 ? (
              <EmptyState
                icon={emptyStateIcon}
                heading={emptyStateHeading}
                description={emptyStateDescription}
                action={emptyStatePrimaryAction}
                secondaryAction={emptyStateSecondaryAction}
              />
            ) : (
              <table
                className='w-full min-w-[960px] border-separate border-spacing-0 text-[13px]'
                aria-label={
                  mode === 'members'
                    ? 'Audience members table'
                    : 'Subscribers table'
                }
              >
                <caption className='sr-only'>
                  {mode === 'members'
                    ? 'Table showing all audience members with their visit history, location, and engagement data'
                    : 'Table showing all subscribers with their contact information and signup dates'}
                </caption>
                <thead
                  className={cn(
                    'sticky top-0 z-20 bg-surface-1/75 backdrop-blur-md',
                    headerElevated &&
                      'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                >
                  <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
                    <th className='w-14 border-b border-subtle px-4 py-3 text-left sm:px-6'>
                      <Checkbox
                        aria-label='Select all'
                        checked={headerCheckboxState}
                        onCheckedChange={() => toggleSelectAll()}
                      />
                    </th>

                    {activeColumns.map((column, index) => {
                      const sortKey =
                        sortableColumnMap[column.key as ColumnKey];
                      const isSortable = Boolean(sortKey);
                      const isActive = isSortable && sortKey === sort;
                      const activeDirection = isActive ? direction : undefined;

                      return (
                        <th
                          key={column.key}
                          className='border-b border-subtle px-4 py-3 text-left sm:px-6'
                        >
                          <div className='flex items-center justify-between gap-2'>
                            {isSortable ? (
                              <SortableHeaderButton
                                label={column.label}
                                direction={
                                  activeDirection as 'asc' | 'desc' | undefined
                                }
                                onClick={() =>
                                  onSortChange(sortKey as unknown as string)
                                }
                              />
                            ) : (
                              <span className='inline-flex items-center font-semibold'>
                                {column.label}
                              </span>
                            )}

                            {index === 0 ? (
                              <div
                                className={cn(
                                  'inline-flex items-center transition-all duration-150',
                                  selectedCount > 0
                                    ? 'opacity-100 translate-y-0'
                                    : 'pointer-events-none opacity-0 -translate-y-0.5'
                                )}
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant='secondary'
                                      size='sm'
                                      className='normal-case'
                                    >
                                      Bulk actions
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align='end'>
                                    <DropdownMenuItem
                                      disabled={selectedCount === 0}
                                      onClick={() => {
                                        void copySelectedEmails();
                                      }}
                                    >
                                      Copy emails
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={selectedCount === 0}
                                      onClick={() => {
                                        void copySelectedPhones();
                                      }}
                                    >
                                      Copy phone numbers
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={selectedCount === 0}
                                      onClick={() => clearSelection()}
                                    >
                                      Clear selection
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            ) : null}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/*
                  Virtualized tbody container:
                  - position: relative - Creates positioning context for absolutely positioned rows
                  - height: getTotalSize() - Sets total scrollable height as if all rows were rendered,
                    enabling proper scrollbar sizing even though only visible rows exist in DOM
                */}
                <tbody
                  ref={tbodyRef}
                  style={{
                    position: 'relative',
                    height: `${rowVirtualizer.getTotalSize()}px`,
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map(virtualRow => {
                    const row = rows[virtualRow.index];
                    const deviceIndicator = getDeviceIndicator(row.deviceType);
                    const isChecked = selectedIds.has(row.id);
                    const rowNumber =
                      (page - 1) * pageSize + virtualRow.index + 1;

                    /**
                     * Virtualized row positioning:
                     * - data-index: Required by measureElement for row height measurement
                     * - ref={measureElement}: Enables dynamic row height calculation
                     * - position: absolute - Removes row from document flow
                     * - translateY: Positions row at its calculated offset within the virtual list
                     * - Using transform instead of top for better paint performance (GPU accelerated)
                     */
                    return (
                      <tr
                        key={row.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className={cn(
                          'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0 hover:bg-surface-2',
                          selectedMember?.id === row.id && 'bg-surface-2'
                        )}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        onClick={() => setSelectedMember(row)}
                        onContextMenu={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          setOpenMenuRowId(row.id);
                        }}
                      >
                        <td className='w-14 px-4 py-3 align-middle sm:px-6'>
                          <div
                            className='relative flex h-7 w-7 items-center justify-center'
                            onClick={event => event.stopPropagation()}
                          >
                            <span
                              className={cn(
                                'text-[11px] tabular-nums text-tertiary-token select-none transition-opacity',
                                isChecked
                                  ? 'opacity-0'
                                  : 'opacity-100 group-hover:opacity-0'
                              )}
                              aria-hidden='true'
                            >
                              {rowNumber}
                            </span>
                            <div
                              className={cn(
                                'absolute inset-0 transition-opacity',
                                isChecked
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100'
                              )}
                            >
                              <Checkbox
                                aria-label={`Select ${row.displayName || 'row'}`}
                                checked={isChecked}
                                onCheckedChange={() => toggleSelect(row.id)}
                              />
                            </div>
                          </div>
                        </td>

                        {mode === 'members' ? (
                          <>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='font-semibold'>
                                {row.displayName || 'Visitor'}
                              </div>
                              {row.type !== 'anonymous' ? (
                                <div className='text-xs text-secondary-token'>
                                  {row.type === 'email'
                                    ? (row.email ?? 'Email fan')
                                    : row.type === 'sms'
                                      ? (row.phone ?? 'SMS fan')
                                      : 'Connected fan'}
                                </div>
                              ) : null}
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/40 px-2 py-0.5 text-[11px] font-medium text-secondary-token capitalize'>
                                {row.type}
                              </span>
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='inline-flex items-center gap-2 text-secondary-token'>
                                <Icon
                                  name='MapPin'
                                  className='h-4 w-4 text-tertiary-token'
                                  aria-hidden='true'
                                />
                                <span>{row.locationLabel || 'Unknown'}</span>
                              </div>
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              {deviceIndicator ? (
                                <Icon
                                  name={deviceIndicator.iconName}
                                  className='h-4 w-4 text-secondary-token'
                                  aria-label={deviceIndicator.label}
                                  role='img'
                                />
                              ) : (
                                <span className='text-secondary-token'>—</span>
                              )}
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='flex items-center gap-2'>
                                <span className='font-semibold'>
                                  {row.visits}
                                </span>
                                <AudienceIntentBadge
                                  intentLevel={row.intentLevel}
                                />
                              </div>
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='flex items-center gap-2'>
                                {row.latestActions
                                  .slice(0, 3)
                                  .map((action, idx) => {
                                    const iconName = resolveAudienceActionIcon(
                                      action.label
                                    );
                                    return (
                                      <span
                                        key={`${row.id}-${action.label}-${action.platform ?? 'unknown'}-${action.timestamp ?? 'unknown'}-${idx}`}
                                        className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface-2/40 text-tertiary-token'
                                        title={action.label}
                                      >
                                        <Icon
                                          name={iconName}
                                          className='h-3.5 w-3.5'
                                          aria-hidden='true'
                                        />
                                        <span className='sr-only'>
                                          {action.label}
                                        </span>
                                      </span>
                                    );
                                  })}
                              </div>
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='flex items-center justify-between gap-2'>
                                <span>{formatTimeAgo(row.lastSeenAt)}</span>
                                <div
                                  className={cn(
                                    'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
                                    openMenuRowId === row.id &&
                                      'opacity-100 pointer-events-auto'
                                  )}
                                  onClick={event => event.stopPropagation()}
                                >
                                  <AudienceRowActionsMenu
                                    row={row}
                                    open={openMenuRowId === row.id}
                                    onOpenChange={open =>
                                      setOpenMenuRowId(open ? row.id : null)
                                    }
                                  />
                                </div>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              {row.displayName || 'Contact'}
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              {row.phone ?? '—'}
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='inline-flex items-center gap-2 text-secondary-token'>
                                <Icon
                                  name='MapPin'
                                  className='h-4 w-4 text-tertiary-token'
                                  aria-hidden='true'
                                />
                                <span>
                                  {row.geoCountry
                                    ? formatCountryLabel(row.geoCountry)
                                    : 'Unknown'}
                                </span>
                              </div>
                            </td>

                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='flex items-center justify-between gap-2'>
                                <span>{formatLongDate(row.lastSeenAt)}</span>
                                <div
                                  className={cn(
                                    'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
                                    openMenuRowId === row.id &&
                                      'opacity-100 pointer-events-auto'
                                  )}
                                  onClick={event => event.stopPropagation()}
                                >
                                  <AudienceRowActionsMenu
                                    row={row}
                                    open={openMenuRowId === row.id}
                                    onOpenChange={open =>
                                      setOpenMenuRowId(open ? row.id : null)
                                    }
                                  />
                                </div>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className='sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-1/75 px-4 py-2 text-xs text-secondary-token backdrop-blur-md sm:px-6'>
            <span className='tracking-wide'>{paginationLabel()}</span>
            <div className='flex items-center gap-3'>
              <AdminPageSizeSelect
                initialPageSize={pageSize}
                onPageSizeChange={onPageSizeChange}
              />
              <div className='flex gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page <= 1 || total === 0}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page >= totalPages || total === 0}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AudienceMemberSidebar
        member={selectedMember}
        isOpen={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
      />
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {paginationLabel()}
        {selectedCount > 0 &&
          `${selectedCount} ${selectedCount === 1 ? 'row' : 'rows'} selected`}
      </div>
    </div>
  );
}
