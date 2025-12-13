'use client';

import { Button } from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import { useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { Icon } from '@/components/atoms/Icon';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import {
  AUDIENCE_MEMBER_SIDEBAR_WIDTH,
  AudienceMemberSidebar,
} from '@/components/dashboard/organisms/AudienceMemberSidebar';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { cn } from '@/lib/utils';
import {
  flagFromCountry,
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
  const pageSize = 10;
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

  useEffect(() => {
    setPage(1);
    setSelectedMember(null);
  }, [artist?.id, isAudienceV2Enabled]);

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
              const locationParts = [typed.geoCity, typed.geoCountry].filter(
                Boolean
              );
              const locationLabel = locationParts.length
                ? locationParts.join(', ')
                : 'Unknown';

              return {
                ...typed,
                locationLabel,
                latestActions: Array.isArray(typed.latestActions)
                  ? typed.latestActions.map(action => ({
                      ...action,
                      emoji: action.emoji ?? '⭐',
                    }))
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
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4'>
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
          <div className='flex-1 min-h-0 overflow-auto'>
            {error ? (
              <div className='border-b border-subtle bg-surface-2/40 px-4 py-3 text-sm text-red-500'>
                {error}
              </div>
            ) : isLoading ? (
              <div className='px-4 py-10 text-sm text-secondary-token'>
                Loading audience data...
              </div>
            ) : rows.length === 0 ? (
              <div className='px-4 py-10 text-sm text-secondary-token'>
                {paginationLabel()}
              </div>
            ) : (
              <table className='w-full min-w-[960px] border-separate border-spacing-0 text-[13px]'>
                <thead className='sticky top-0 z-20 bg-surface-1/75 backdrop-blur-md'>
                  <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
                    {activeColumns.map(column => {
                      const sortKey = sortableColumnMap[column.key];
                      const isSortable = Boolean(sortKey);
                      const isActiveSort =
                        isSortable && activeSortColumn === column.key;
                      return (
                        <th
                          key={column.key}
                          className='border-b border-subtle px-4 py-3 text-left'
                        >
                          {isSortable ? (
                            <button
                              type='button'
                              className='inline-flex w-full items-center gap-1 rounded-sm text-left font-semibold transition-colors hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive'
                              onClick={() => handleHeaderClick(column.key)}
                            >
                              <span>{column.label}</span>
                              <span
                                aria-hidden='true'
                                className={cn(
                                  'text-[10px] transition-opacity',
                                  isActiveSort ? 'opacity-100' : 'opacity-50'
                                )}
                              >
                                {isActiveSort
                                  ? activeSortDirection === 'asc'
                                    ? '▲'
                                    : '▼'
                                  : ''}
                              </span>
                            </button>
                          ) : (
                            <span className='inline-flex items-center font-semibold'>
                              {column.label}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const deviceIndicator = getDeviceIndicator(row.deviceType);

                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0 hover:bg-surface-2',
                          selectedMember?.id === row.id && 'bg-surface-2'
                        )}
                        onClick={() => setSelectedMember(row)}
                      >
                        {isAudienceV2Enabled ? (
                          <>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              <div className='font-semibold'>
                                {row.displayName || 'Visitor'}
                              </div>
                              <div className='text-xs text-secondary-token'>
                                {row.type === 'anonymous'
                                  ? 'Visitor'
                                  : row.type === 'email'
                                    ? (row.email ?? 'Email fan')
                                    : row.type === 'sms'
                                      ? (row.phone ?? 'SMS fan')
                                      : 'Connected fan'}
                              </div>
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/40 px-2 py-0.5 text-[11px] font-medium text-secondary-token capitalize'>
                                {row.type}
                              </span>
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              <div className='inline-flex items-center gap-2 text-secondary-token'>
                                <span aria-hidden='true' className='text-lg'>
                                  {flagFromCountry(row.geoCountry)}
                                </span>
                                <span>{row.locationLabel || 'Unknown'}</span>
                              </div>
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
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
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              <div className='flex flex-col gap-1'>
                                <span className='font-semibold'>
                                  {row.visits}
                                </span>
                                {formatIntentBadge(row.intentLevel)}
                              </div>
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              <div className='flex gap-2'>
                                {row.latestActions.slice(0, 3).map(action => (
                                  <span
                                    key={`${row.id}-${action.label}`}
                                    className='text-[15px] text-primary-token/90'
                                    aria-label={action.label}
                                  >
                                    {action.emoji ?? '⭐'}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              {formatTimeAgo(row.lastSeenAt)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              {row.displayName || 'Contact'}
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              {row.phone ?? '—'}
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              <div className='inline-flex items-center gap-2 text-secondary-token'>
                                <span aria-hidden='true' className='text-lg'>
                                  {flagFromCountry(row.geoCountry)}
                                </span>
                                <span>{row.locationLabel}</span>
                              </div>
                            </td>
                            <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                              {formatLongDate(row.lastSeenAt)}
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

          {!isLoading && rows.length > 0 && (
            <div className='shrink-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-1/75 px-3 py-2 text-xs text-secondary-token backdrop-blur-md'>
              <span className='tracking-wide'>{paginationLabel()}</span>
              <div className='flex gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page <= 1}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page >= totalPages}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() =>
                    setPage(prev => Math.min(totalPages, prev + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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
