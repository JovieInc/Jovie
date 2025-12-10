'use client';

import { Button } from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import { useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/dashboard/DashboardDataContext';
import { useTableMeta } from '@/app/dashboard/DashboardLayoutClient';
import { SectionHeader } from '@/components/dashboard/molecules/SectionHeader';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { cn } from '@/lib/utils';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

type AudienceMemberType =
  | 'anonymous'
  | 'email'
  | 'sms'
  | 'spotify'
  | 'customer';
export type IntentLevel = 'high' | 'medium' | 'low';

type AudienceAction = {
  label: string;
  emoji?: string;
  platform?: string;
  timestamp?: string;
};

type AudienceRow = {
  id: string;
  type: AudienceMemberType;
  displayName: string | null;
  locationLabel: string;
  geoCity: string | null;
  geoCountry: string | null;
  visits: number;
  engagementScore: number;
  intentLevel: IntentLevel;
  latestActions: AudienceAction[];
  referrerHistory: { url: string; timestamp?: string }[];
  email: string | null;
  phone: string | null;
  spotifyConnected: boolean;
  purchaseCount: number;
  tags: string[];
  deviceType: string | null;
  lastSeenAt: string | null;
};

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

const INTENT_BADGES: Record<IntentLevel, { label: string; tone: string }> = {
  high: { label: '🔥 High intent', tone: 'text-accent' },
  medium: { label: '⚡ Medium intent', tone: 'text-warning-token' },
  low: { label: '• Low intent', tone: 'text-secondary-token' },
};

function formatCountryLabel(code: string | null): string {
  if (!code) return 'Unknown';
  const upper = code.slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : 'Unknown';
}

function flagFromCountry(code: string | null): string {
  if (!code || code.length < 2) return '🏳️';
  const upper = code.slice(0, 2).toUpperCase();
  const first = upper.codePointAt(0);
  const second = upper.codePointAt(1);

  if (!first || !second) return '🏳️';
  if (first < 65 || first > 90 || second < 65 || second > 90) {
    return '🏳️';
  }

  return String.fromCodePoint(0x1f1e6 + (first - 65), 0x1f1e6 + (second - 65));
}

function formatTimeAgo(value: string | null): string {
  if (!value) return '—';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '—';

  const diff = Date.now() - timestamp.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${days}d ago`;
}

function formatLongDate(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

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

  // Expose row count and a toggle handler for the contact action button
  useEffect(() => {
    const toggle = () => {
      if (rows.length === 0) return;
      setSelectedMember(current => (current ? null : (rows[0] ?? null)));
    };

    setTableMeta({
      rowCount: rows.length,
      toggle: rows.length > 0 ? toggle : null,
    });

    return () => {
      setTableMeta({ rowCount: null, toggle: null });
    };
  }, [rows, setTableMeta]);

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
          <div className='grid grid-cols-6 gap-4 border-b border-subtle px-4 py-3'>
            {activeColumns.map(col => (
              <LoadingSkeleton
                key={col.key}
                height='h-4'
                width='w-24'
                rounded='md'
              />
            ))}
          </div>
          <ul className='divide-y divide-subtle'>
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className='grid grid-cols-6 gap-4 px-4 py-3'
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

  const formatIntentBadge = (intent: IntentLevel) => {
    const badge = INTENT_BADGES[intent];
    return (
      <span className={cn('text-xs font-semibold uppercase', badge.tone)}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold text-primary-token'>Audience CRM</h1>
        <p className='text-secondary-token mt-1'>
          {isAudienceV2Enabled
            ? 'Every visitor, anonymous or identified, lives in this table.'
            : 'Notification signups from your notification modal.'}
        </p>
      </div>

      <div className='w-full overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-sm'>
        <SectionHeader
          title='Audience'
          description='Track visitors, high-intent fans, and actions on your profile.'
          right={
            <span className='rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-secondary-token'>
              {total} {total === 1 ? 'person' : 'people'}
            </span>
          }
        />

        {error ? (
          <div className='px-6 py-4 text-sm text-red-500 bg-surface-2/60'>
            {error}
          </div>
        ) : isLoading ? (
          <div className='px-6 py-10 text-sm text-secondary-token'>
            Loading audience data...
          </div>
        ) : rows.length === 0 ? (
          <div className='px-6 py-10 text-sm text-secondary-token'>
            {paginationLabel()}
          </div>
        ) : (
          <div className='w-full overflow-x-auto'>
            <table className='min-w-full divide-y divide-subtle'>
              <thead className='sticky top-0 bg-surface-1/80 backdrop-blur-sm'>
                <tr>
                  {activeColumns.map(column => {
                    const isActiveSort = activeSortColumn === column.key;
                    return (
                      <th
                        key={column.key}
                        className='px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-secondary-token'
                      >
                        <button
                          type='button'
                          className='flex items-center gap-1 text-left'
                          onClick={() => handleHeaderClick(column.key)}
                        >
                          <span>{column.label}</span>
                          <span
                            aria-hidden='true'
                            className={cn(
                              'text-[11px] transition-opacity',
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
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className='divide-y divide-subtle'>
                {rows.map(row => (
                  <tr
                    key={row.id}
                    className='hover:bg-surface-2/30 cursor-pointer'
                    onClick={() => setSelectedMember(row)}
                  >
                    {isAudienceV2Enabled ? (
                      <>
                        <td className='px-6 py-4 text-sm text-primary-token'>
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
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          <span className='text-xs uppercase text-secondary-token'>
                            {row.type}
                          </span>
                        </td>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          <div className='inline-flex items-center gap-2 text-secondary-token'>
                            <span aria-hidden='true' className='text-lg'>
                              {flagFromCountry(row.geoCountry)}
                            </span>
                            <span>{row.locationLabel || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          <div className='flex flex-col gap-1'>
                            <span className='font-semibold'>{row.visits}</span>
                            {formatIntentBadge(row.intentLevel)}
                          </div>
                        </td>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          <div className='flex gap-2'>
                            {row.latestActions.slice(0, 3).map(action => (
                              <span
                                key={`${row.id}-${action.label}`}
                                className='text-lg'
                                aria-label={action.label}
                              >
                                {action.emoji ?? '⭐'}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          {formatTimeAgo(row.lastSeenAt)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          {row.displayName || 'Contact'}
                        </td>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          {row.phone ?? '—'}
                        </td>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          <div className='inline-flex items-center gap-2 text-secondary-token'>
                            <span aria-hidden='true' className='text-lg'>
                              {flagFromCountry(row.geoCountry)}
                            </span>
                            <span>{row.locationLabel}</span>
                          </div>
                        </td>
                        <td className='px-6 py-4 text-sm text-primary-token'>
                          {formatLongDate(row.lastSeenAt)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <div className='flex items-center justify-between px-6 py-3 text-xs font-medium uppercase tracking-wider text-secondary-token'>
            <span>{paginationLabel()}</span>
            <div className='flex gap-2'>
              <Button
                variant='ghost'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                variant='ghost'
                size='sm'
                disabled={page >= totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedMember && (
        <div className='rounded-lg border border-subtle bg-surface-1/80 p-6 shadow-sm'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-xs uppercase tracking-wider text-secondary-token'>
                Member detail
              </p>
              <h3 className='text-lg font-semibold text-primary-token'>
                {selectedMember.displayName || 'Visitor'}
              </h3>
            </div>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setSelectedMember(null)}
            >
              Close
            </Button>
          </div>

          <div className='mt-5 grid gap-4 sm:grid-cols-2'>
            <div>
              <p className='text-sm text-secondary-token'>Location</p>
              <p className='text-sm text-primary-token'>
                {selectedMember.locationLabel}
              </p>
            </div>
            <div>
              <p className='text-sm text-secondary-token'>Device</p>
              <p className='text-sm text-primary-token'>
                {selectedMember.deviceType ?? 'Unknown'}
              </p>
            </div>
            <div>
              <p className='text-sm text-secondary-token'>Visits</p>
              <p className='text-sm text-primary-token'>
                {selectedMember.visits}
              </p>
            </div>
            <div>
              <p className='text-sm text-secondary-token'>Last seen</p>
              <p className='text-sm text-primary-token'>
                {formatLongDate(selectedMember.lastSeenAt)}
              </p>
            </div>
            <div>
              <p className='text-sm text-secondary-token'>Intent</p>
              {formatIntentBadge(selectedMember.intentLevel)}
            </div>
          </div>

          <div className='mt-6 grid gap-4 sm:grid-cols-2'>
            <div>
              <p className='text-sm text-secondary-token'>Email</p>
              <p className='text-sm text-primary-token'>
                {selectedMember.email ?? '—'}
              </p>
            </div>
            <div>
              <p className='text-sm text-secondary-token'>Phone</p>
              <p className='text-sm text-primary-token'>
                {selectedMember.phone ?? '—'}
              </p>
            </div>
          </div>

          <div className='mt-6 space-y-3'>
            <div>
              <p className='text-sm text-secondary-token'>Recent actions</p>
              <ul className='mt-2 space-y-2 text-sm text-primary-token'>
                {selectedMember.latestActions.length === 0 && (
                  <li className='text-secondary-token'>No actions yet.</li>
                )}
                {selectedMember.latestActions.map(action => (
                  <li
                    key={
                      action.timestamp ?? `${action.label}-${selectedMember.id}`
                    }
                  >
                    <span className='mr-2'>{action.emoji ?? '⭐'}</span>
                    {action.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className='text-sm text-secondary-token'>Referrers</p>
              <ul className='mt-2 space-y-2 text-sm text-primary-token'>
                {selectedMember.referrerHistory.length === 0 ? (
                  <li className='text-secondary-token'>
                    No referrer data yet.
                  </li>
                ) : (
                  selectedMember.referrerHistory.map(ref => (
                    <li key={`${ref.url}-${ref.timestamp}`}>
                      <p className='font-medium'>{ref.url}</p>
                      {ref.timestamp && (
                        <p className='text-xs text-secondary-token'>
                          {formatTimeAgo(ref.timestamp)}
                        </p>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
