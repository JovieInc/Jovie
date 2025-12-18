'use client';

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { Icon } from '@/components/atoms/Icon';
import { AdminPageSizeSelect } from '@/components/admin/table/AdminPageSizeSelect';
import { SortableHeaderButton } from '@/components/admin/table/SortableHeaderButton';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { AudienceRowActionsMenu } from '@/components/dashboard/AudienceRowActionsMenu';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import {
  AUDIENCE_MEMBER_SIDEBAR_WIDTH,
  AudienceMemberSidebar,
} from '@/components/dashboard/organisms/AudienceMemberSidebar';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { cn } from '@/lib/utils';
import {
  formatCountryLabel,
  formatLongDate,
  formatTimeAgo,
  getDeviceIndicator,
} from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

type AudienceRow = AudienceMember;

type SubscriberRow = {
  id: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  createdAt: string;
  channel: 'email' | 'phone';
};

type AudienceMembersPayload = {
  members?: unknown[];
  total?: number;
  error?: string;
};

type AudienceSubscribersPayload = {
  subscribers?: SubscriberRow[];
  total?: number;
  error?: string;
};

type AudienceResponsePayload =
  | AudienceMembersPayload
  | AudienceSubscribersPayload;

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

function safeDecodeLocationPart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const maybeEncoded = trimmed.includes('%') || trimmed.includes('+');
  if (!maybeEncoded) return trimmed;

  try {
    return decodeURIComponent(trimmed.replace(/\+/g, ' '));
  } catch {
    return trimmed;
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

const DEFAULT_MEMBER_SORT: MemberSortColumn = 'lastSeen';
const DEFAULT_SUBSCRIBER_SORT: SubscriberSortColumn = 'createdAt';

export function DashboardAudience() {
  const dashboardData = useDashboardData();
  const notifications = useNotifications();
  const artist = useMemo<Artist | null>(
    () =>
      dashboardData.selectedProfile
        ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
        : null,
    [dashboardData.selectedProfile]
  );

  const isAudienceV2Enabled = useFeatureGate(STATSIG_FLAGS.AUDIENCE_V2);

  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [memberSortColumn, setMemberSortColumn] =
    useState<MemberSortColumn>(DEFAULT_MEMBER_SORT);
  const [subscriberSortColumn, setSubscriberSortColumn] =
    useState<SubscriberSortColumn>(DEFAULT_SUBSCRIBER_SORT);
  const [memberSortDirection, setMemberSortDirection] = useState<
    'asc' | 'desc'
  >('desc');
  const [subscriberSortDirection, setSubscriberSortDirection] = useState<
    'asc' | 'desc'
  >('desc');

  const [selectedMember, setSelectedMember] = useState<AudienceRow | null>(
    null
  );
  const { setTableMeta } = useTableMeta();
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [openMenuRowId, setOpenMenuRowId] = useState<string | null>(null);

  const rowIds = useMemo(() => rows.map(row => row.id), [rows]);
  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useRowSelection(rowIds);

  useEffect(() => {
    setPage(1);
    setSelectedMember(null);
    clearSelection();
  }, [artist?.id, isAudienceV2Enabled, clearSelection]);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setHeaderElevated(container.scrollTop > 0);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const activeSortColumn = isAudienceV2Enabled
    ? memberSortColumn
    : subscriberSortColumn;
  const activeSortDirection = isAudienceV2Enabled
    ? memberSortDirection
    : subscriberSortDirection;

  useEffect(() => {
    if (!artist?.id) {
      setRows([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const endpoint = isAudienceV2Enabled
      ? '/api/dashboard/audience/members'
      : '/api/dashboard/audience/subscribers';

    const query = new URLSearchParams({
      profileId: artist.id,
      sort: activeSortColumn,
      direction: activeSortDirection,
      page: String(page),
      pageSize: String(pageSize),
    });

    void fetch(`${endpoint}?${query}`, { signal: controller.signal })
      .then(async response => {
        const payload = (await response
          .json()
          .catch(() => null)) as AudienceResponsePayload | null;

        if (!response.ok) {
          const message =
            payload && 'error' in payload && payload.error
              ? payload.error
              : 'Unable to load audience data';
          throw new Error(message);
        }

        if (isAudienceV2Enabled) {
          const memberPayload = (payload ?? {}) as AudienceMembersPayload;
          const normalized: AudienceRow[] = (memberPayload.members ?? []).map(
            member => {
              const typed = member as AudienceRow;
              const locationParts = [typed.geoCity, typed.geoCountry]
                .filter(Boolean)
                .map(part => safeDecodeLocationPart(part as string));
              const locationLabel = locationParts.length
                ? locationParts.join(', ')
                : 'Unknown';

              return {
                ...typed,
                locationLabel,
                latestActions: Array.isArray(typed.latestActions)
                  ? typed.latestActions
                  : [],
                referrerHistory: Array.isArray(typed.referrerHistory)
                  ? typed.referrerHistory
                  : [],
              };
            }
          );
          setRows(normalized);
          setTotal(memberPayload.total ?? 0);
        } else {
          const subscriberPayload = (payload ??
            {}) as AudienceSubscribersPayload;
          const normalized: AudienceRow[] = (
            subscriberPayload.subscribers ?? []
          ).map(subscriber => ({
            id: subscriber.id,
            type: subscriber.channel === 'email' ? 'email' : 'sms',
            displayName: subscriber.email || subscriber.phone || 'Contact',
            locationLabel: subscriber.country
              ? formatCountryLabel(subscriber.country)
              : 'Unknown',
            geoCity: null,
            geoCountry: subscriber.country,
            visits: 1,
            engagementScore: 1,
            intentLevel: 'medium',
            latestActions: [],
            email: subscriber.email,
            phone: subscriber.phone,
            spotifyConnected: false,
            purchaseCount: 0,
            tags: [],
            referrerHistory: [],
            deviceType: null,
            lastSeenAt: subscriber.createdAt,
          }));
          setRows(normalized);
          setTotal(subscriberPayload.total ?? 0);
        }
        setIsLoading(false);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load audience data'
        );
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [
    artist?.id,
    page,
    pageSize,
    activeSortColumn,
    activeSortDirection,
    isAudienceV2Enabled,
  ]);

  // Expose row count, toggle handler, and right panel width for contact sidebar
  useEffect(() => {
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

  const activeColumns = isAudienceV2Enabled
    ? MEMBER_COLUMNS
    : SUBSCRIBER_COLUMNS;

  const handleSort = (column: MemberSortColumn | SubscriberSortColumn) => {
    if (isAudienceV2Enabled) {
      if (memberSortColumn === column) {
        setMemberSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setMemberSortColumn(column as MemberSortColumn);
        setMemberSortDirection('asc');
      }
    } else {
      if (subscriberSortColumn === column) {
        setSubscriberSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSubscriberSortColumn(column as SubscriberSortColumn);
        setSubscriberSortDirection('asc');
      }
    }
    setPage(1);
  };

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

  const handleHeaderClick = (key: ColumnKey) => {
    const sortKey = sortableColumnMap[key];
    if (!sortKey) return;
    handleSort(sortKey);
  };

  const selectedRows = useMemo(
    () => rows.filter(row => selectedIds.has(row.id)),
    [rows, selectedIds]
  );

  const copySelectedEmails = async (): Promise<void> => {
    const emails = selectedRows
      .map(row => row.email)
      .filter(
        (value): value is string => typeof value === 'string' && value.length > 0
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
        (value): value is string => typeof value === 'string' && value.length > 0
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

  if (!artist) {
    return null;
  }

  if (isLoading) {
    return (
      <div className='space-y-6' aria-busy='true'>
        <div>
          <LoadingSkeleton height='h-6' width='w-40' rounded='md' />
          <div className='mt-2 flex gap-2'>
            <LoadingSkeleton height='h-4' width='w-24' rounded='full' />
            <LoadingSkeleton height='h-4' width='w-16' rounded='full' />
          </div>
        </div>
        <div className='overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-sm'>
          <div
            className='grid gap-4 border-b border-subtle px-4 py-3'
            style={{
              gridTemplateColumns: `repeat(${activeColumns.length}, minmax(0, 1fr))`,
            }}
          >
            {activeColumns.map(col => (
              <LoadingSkeleton
                key={col.key}
                height='h-4'
                width='w-24'
                rounded='md'
              />
            ))}
          </div>
          <ul>
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className='grid gap-4 border-b border-subtle px-4 py-3 last:border-b-0'
                style={{
                  gridTemplateColumns: `repeat(${activeColumns.length}, minmax(0, 1fr))`,
                }}
                aria-hidden='true'
              >
                {activeColumns.map(col => (
                  <LoadingSkeleton
                    key={`${col.key}-${i}`}
                    height='h-4'
                    width='w-32'
                    rounded='md'
                  />
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const paginationLabel = () => {
    if (total === 0) {
      return isAudienceV2Enabled
        ? 'No audience yet. Share your profile to invite visitors.'
        : 'No signups yet. Invite fans to tap the bell.';
    }

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `Showing ${start}–${end} of ${total} readers`;
  };

  const formatIntentBadge = (intent: AudienceRow['intentLevel']) => (
    <AudienceIntentBadge intentLevel={intent} />
  );

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
              Audience CRM
            </h1>
            <p className='mt-1 text-sm leading-6 text-secondary-token'>
              {isAudienceV2Enabled
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
            {error ? (
              <div className='border-b border-subtle bg-surface-2/40 px-4 py-3 text-sm text-red-500 sm:px-6'>
                {error}
              </div>
            ) : isLoading ? (
              <div className='px-4 py-10 text-sm text-secondary-token sm:px-6'>
                Loading audience data...
              </div>
            ) : rows.length === 0 ? (
              <div className='px-4 py-10 text-sm text-secondary-token sm:px-6'>
                {paginationLabel()}
              </div>
            ) : (
              <table className='w-full min-w-[960px] border-separate border-spacing-0 text-[13px]'>
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
                      const sortKey = sortableColumnMap[column.key];
                      const isSortable = Boolean(sortKey);
                      const direction =
                        isSortable && sortKey && activeSortColumn === sortKey
                          ? activeSortDirection
                          : undefined;
                      return (
                        <th
                          key={column.key}
                          className='border-b border-subtle px-4 py-3 text-left sm:px-6'
                        >
                          <div className='flex items-center justify-between gap-2'>
                            {isSortable ? (
                              <SortableHeaderButton
                                label={column.label}
                                direction={direction}
                                onClick={() => handleHeaderClick(column.key)}
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
                <tbody>
                  {rows.map((row, index) => {
                    const deviceIndicator = getDeviceIndicator(row.deviceType);
                    const isChecked = selectedIds.has(row.id);
                    const rowNumber = (page - 1) * pageSize + index + 1;

                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0 hover:bg-surface-2',
                          selectedMember?.id === row.id && 'bg-surface-2'
                        )}
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
                        {isAudienceV2Enabled ? (
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
                                <span className='font-semibold'>{row.visits}</span>
                                {formatIntentBadge(row.intentLevel)}
                              </div>
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token sm:px-6'>
                              <div className='flex items-center gap-2'>
                                {row.latestActions
                                  .slice(0, 3)
                                  .map((action, actionIndex) => {
                                    const iconName = resolveAudienceActionIcon(
                                      action.label
                                    );
                                    return (
                                      <span
                                        key={`${row.id}-${action.label}-${action.platform ?? 'unknown'}-${action.timestamp ?? 'unknown'}-${actionIndex}`}
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
                                <span>{row.locationLabel}</span>
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
                onPageSizeChange={nextPageSize => {
                  setPageSize(nextPageSize);
                  setPage(1);
                }}
              />
              <div className='flex gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page <= 1 || total === 0}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page >= totalPages || total === 0}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
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
    </div>
  );
}
