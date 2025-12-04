'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AdminCreatorFilters } from '@/components/admin/AdminCreatorFilters';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import {
  getNextSort,
  getSortDirection,
  SORTABLE_COLUMNS,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { getBaseUrl } from '@/lib/utils/platform-detection';

type RerunStatus = 'idle' | 'loading';

const fallbackCopyToClipboard = (text: string): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (error) {
    console.error('Fallback clipboard copy failed', error);
    return false;
  }
};

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Clipboard API copy failed', error);
    }
  }

  return fallbackCopyToClipboard(text);
};

function SortIndicator({ direction }: { direction?: 'asc' | 'desc' }) {
  if (!direction) {
    return (
      <span className='text-xs text-secondary-token' aria-hidden='true'>
        ⇅
      </span>
    );
  }

  return (
    <span
      className='text-xs text-primary-token'
      aria-hidden='true'
      aria-label={direction === 'asc' ? 'Ascending' : 'Descending'}
    >
      {direction === 'asc' ? '▴' : '▾'}
    </span>
  );
}

export interface CreatorProfilesTableProps {
  profiles: AdminCreatorProfileRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminCreatorProfilesSort;
}

export function CreatorProfilesTable({
  profiles: initialProfiles,
  page,
  pageSize,
  total,
  search,
  sort,
}: CreatorProfilesTableProps) {
  const {
    profiles,
    statuses: verificationStatuses,
    toggleVerification,
  } = useCreatorVerification(initialProfiles);

  const router = useRouter();
  const notifications = useNotifications();
  const [rerunStatuses, setRerunStatuses] = useState<
    Record<string, RerunStatus>
  >({});
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestStatus, setIngestStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(page * pageSize, total);

  const buildHref = (
    targetPage: number,
    overrideSort?: AdminCreatorProfilesSort,
    includeSearch = true
  ): string => {
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('pageSize', String(pageSize));
    params.set('sort', overrideSort ?? sort);
    if (includeSearch && search) {
      params.set('q', search);
    }
    const query = params.toString();
    return query.length > 0 ? `/admin?${query}` : '/admin';
  };

  const prevHref = canPrev ? buildHref(page - 1) : undefined;
  const nextHref = canNext ? buildHref(page + 1) : undefined;
  const clearHref = buildHref(1, undefined, false);

  const createSortHref = (column: SortableColumnKey) =>
    buildHref(1, getNextSort(sort, column));

  const renderSortHeader = (column: SortableColumnKey) => {
    const columnConfig = SORTABLE_COLUMNS[column];
    const direction = getSortDirection(sort, column);

    return (
      <Link
        href={createSortHref(column)}
        className='inline-flex items-center gap-1 text-xs uppercase tracking-wide font-semibold'
      >
        {columnConfig.label}
        <SortIndicator direction={direction} />
      </Link>
    );
  };

  const handleIngestProfile = async () => {
    if (!ingestUrl.trim()) {
      setIngestStatus('error');
      setIngestMessage('Enter a Linktree profile URL.');
      return;
    }

    setIngestStatus('loading');
    setIngestMessage(null);

    try {
      const response = await fetch('/api/admin/creator-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ingestUrl.trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to ingest profile');
      }

      setIngestStatus('success');
      setIngestMessage(
        `Created creator profile @${result.profile?.username ?? 'unknown'}`
      );
      const profileUsername = result.profile?.username;
      const successMessage = profileUsername
        ? `Created creator profile @${profileUsername}`
        : 'Created new creator profile';
      const toastOptions = profileUsername
        ? {
            action: {
              label: 'View profile',
              onClick: () => router.push(`/${profileUsername}`),
            },
          }
        : undefined;

      notifications.success(successMessage, toastOptions);
      setIngestUrl('');
      router.refresh();
    } catch (error) {
      console.error('Ingestion error', error);
      setIngestStatus('error');
      setIngestMessage(
        error instanceof Error
          ? error.message
          : 'Failed to ingest Linktree profile'
      );
      notifications.error(
        error instanceof Error
          ? error.message
          : 'Failed to ingest Linktree profile'
      );
    }
  };

  const handleCopyClaimLink = async (claimToken: string) => {
    const claimUrl = `${getBaseUrl()}/claim/${claimToken}`;
    const copied = await copyTextToClipboard(claimUrl);
    if (copied) {
      notifications.success('Claim link copied to clipboard');
    } else {
      notifications.error('Failed to copy claim link');
    }
  };

  const handleRerunIngestion = async (profile: AdminCreatorProfileRow) => {
    setRerunStatuses(prev => ({
      ...prev,
      [profile.id]: 'loading',
    }));

    try {
      const response = await fetch('/api/admin/creator-ingest/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to queue ingestion job');
      }

      await router.refresh();

      const toastOptions = profile.username
        ? {
            action: {
              label: 'View profile',
              onClick: () => router.push(`/${profile.username}`),
            },
          }
        : undefined;

      notifications.success(
        `Re-run queued for @${profile.username}`,
        toastOptions
      );
    } catch (error) {
      console.error('Failed to rerun ingestion job', error);
      notifications.error(
        error instanceof Error ? error.message : 'Failed to queue ingestion job'
      );
    } finally {
      setRerunStatuses(prev => ({
        ...prev,
        [profile.id]: 'idle',
      }));
    }
  };

  const handleToggleVerification = async (profile: AdminCreatorProfileRow) => {
    const result = await toggleVerification(profile.id, !profile.isVerified);

    if (!result.success) {
      notifications.error(
        result.error ?? 'Failed to update verification status'
      );
      return;
    }

    const statusLabel = result.isVerified ? 'Verified' : 'Unverified';
    notifications.success(`${statusLabel} @${profile.username}`, {
      action: {
        label: 'View profile',
        onClick: () => router.push(`/${profile.username}`),
      },
    });
  };

  return (
    <Card className='border-subtle bg-surface-1/80 overflow-hidden'>
      <CardHeader className='space-y-1'>
        <CardTitle className='text-lg'>Creator profiles</CardTitle>
        <p className='text-xs text-secondary-token'>
          View and manage creator verification and avatars.
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <form
            action='/admin'
            method='get'
            className='flex flex-wrap items-center gap-3'
          >
            <input type='hidden' name='sort' value={sort} />
            <Input
              name='q'
              placeholder='Search by handle'
              defaultValue={search}
              className='max-w-xs'
            />
            <input type='hidden' name='page' value='1' />
            <AdminCreatorFilters initialPageSize={pageSize} />
            <Button type='submit' size='sm' variant='secondary'>
              Search
            </Button>
            {search && search.length > 0 && (
              <Button asChild size='sm' variant='ghost'>
                <Link href={clearHref}>Clear</Link>
              </Button>
            )}
          </form>

          <div className='flex-1 min-w-[260px]'>
            <div className='rounded-2xl border border-subtle bg-surface-1 p-4 space-y-2 shadow-sm'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm font-semibold text-primary-token'>
                    Ingest Linktree profile
                  </p>
                  <p className='text-xs text-secondary-token'>
                    Create a creator profile & links from a Linktree URL.
                  </p>
                </div>
                <Badge
                  variant='secondary'
                  size='sm'
                  className='uppercase tracking-wide'
                >
                  Admin
                </Badge>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Input
                  placeholder='https://linktr.ee/username'
                  value={ingestUrl}
                  onChange={e => setIngestUrl(e.target.value)}
                  className='flex-1 min-w-[220px]'
                />
                <Button
                  size='sm'
                  onClick={handleIngestProfile}
                  disabled={
                    ingestStatus === 'loading' || ingestUrl.trim().length === 0
                  }
                >
                  {ingestStatus === 'loading' ? 'Ingesting...' : 'Ingest'}
                </Button>
              </div>
              {ingestMessage && (
                <p
                  className={`text-xs ${
                    ingestStatus === 'error'
                      ? 'text-rose-500'
                      : 'text-emerald-600'
                  }`}
                >
                  {ingestMessage}
                </p>
              )}
            </div>
          </div>

          <div className='text-xs text-secondary-token'>
            Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {total.toLocaleString()} profiles
          </div>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-sm'>
            <thead className='text-left text-secondary-token'>
              <tr className='border-b border-subtle/60 text-xs uppercase tracking-wide text-tertiary-token'>
                <th className='px-2 py-2'>Avatar</th>
                <th className='px-2 py-2'>Handle</th>
                <th className='px-2 py-2'>{renderSortHeader('created')}</th>
                <th className='px-2 py-2'>{renderSortHeader('claimed')}</th>
                <th className='px-2 py-2'>{renderSortHeader('verified')}</th>
                <th className='px-2 py-2 text-right'>Action</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-subtle/60'>
              {profiles.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className='px-2 py-6 text-center text-sm text-secondary-token'
                  >
                    No creator profiles found.
                  </td>
                </tr>
              ) : (
                profiles.map(profile => {
                  const verificationStatus =
                    verificationStatuses[profile.id] ?? 'idle';
                  const rerunStatus = rerunStatuses[profile.id] ?? 'idle';
                  const claimToken = profile.claimToken;
                  const confidenceValue =
                    typeof profile.confidence === 'number' &&
                    Number.isFinite(profile.confidence)
                      ? Math.min(1, Math.max(0, profile.confidence))
                      : null;
                  const confidencePercent =
                    confidenceValue != null
                      ? Math.round(confidenceValue * 100)
                      : 0;
                  const gradientClass =
                    confidenceValue == null
                      ? 'from-subtle/60 to-subtle/80'
                      : confidenceValue >= 0.7
                        ? 'from-emerald-500 via-emerald-400 to-cyan-500'
                        : confidenceValue >= 0.4
                          ? 'from-amber-500 via-orange-400 to-rose-500'
                          : 'from-rose-500 via-rose-400 to-amber-500';
                  const verificationLabel =
                    verificationStatus === 'loading'
                      ? 'Updating verification…'
                      : profile.isVerified
                        ? 'Unverify creator'
                        : 'Verify creator';
                  const rerunLabel =
                    rerunStatus === 'loading'
                      ? 'Re-running ingestion…'
                      : 'Re-run ingestion';

                  return (
                    <tr key={profile.id} className='hover:bg-surface-2/60'>
                      <td className='px-2 py-3'>
                        <CreatorAvatarCell
                          profileId={profile.id}
                          username={profile.username}
                          avatarUrl={profile.avatarUrl}
                          verified={profile.isVerified}
                        />
                      </td>
                      <td className='px-2 py-3 font-medium text-primary-token'>
                        <Link
                          href={`/${profile.username}`}
                          className='hover:underline'
                        >
                          @{profile.username}
                        </Link>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className='mt-1 h-1.5 rounded-full bg-subtle/40'>
                              <div
                                className={`h-full rounded-full bg-linear-to-r ${gradientClass}`}
                                style={{
                                  width: `${
                                    confidenceValue != null
                                      ? confidenceValue * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side='top'>
                            {confidenceValue != null
                              ? `Confidence ${confidencePercent}%`
                              : 'Confidence unavailable yet'}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className='px-2 py-3 text-secondary-token'>
                        {profile.createdAt
                          ? new Intl.DateTimeFormat('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }).format(profile.createdAt)
                          : '—'}
                      </td>
                      <td className='px-2 py-3'>
                        <Badge
                          size='sm'
                          variant={profile.isClaimed ? 'success' : 'secondary'}
                        >
                          {profile.isClaimed ? 'Claimed' : 'Unclaimed'}
                        </Badge>
                      </td>
                      <td className='px-2 py-3'>
                        <Badge
                          size='sm'
                          variant={profile.isVerified ? 'success' : 'secondary'}
                        >
                          {profile.isVerified ? 'Verified' : 'Not verified'}
                        </Badge>
                      </td>
                      <td className='px-2 py-3 text-right'>
                        <div className='flex items-center justify-end'>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='rounded-full p-0'
                                aria-label='Creator actions'
                              >
                                <span aria-hidden='true'>⋯</span>
                                <span className='sr-only'>Creator actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end' className='w-56'>
                              <DropdownMenuItem
                                disabled={verificationStatus === 'loading'}
                                onSelect={event => {
                                  event.preventDefault();
                                  void handleToggleVerification(profile);
                                }}
                              >
                                {verificationLabel}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={event => {
                                  event.preventDefault();
                                  router.push(`/${profile.username}`);
                                }}
                              >
                                View profile
                              </DropdownMenuItem>
                              {!profile.isClaimed && claimToken ? (
                                <DropdownMenuItem
                                  onSelect={event => {
                                    event.preventDefault();
                                    void handleCopyClaimLink(claimToken);
                                  }}
                                >
                                  Copy claim link
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={rerunStatus === 'loading'}
                                onSelect={event => {
                                  event.preventDefault();
                                  void handleRerunIngestion(profile);
                                }}
                              >
                                {rerunLabel}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className='mt-4 flex items-center justify-between gap-2 text-xs text-secondary-token'>
          <div>
            Page {page} of {totalPages}
          </div>
          <div className='flex items-center gap-2'>
            <Button asChild size='sm' variant='ghost' disabled={!canPrev}>
              <Link href={prevHref ?? '#'} aria-disabled={!canPrev}>
                Previous
              </Link>
            </Button>
            <Button asChild size='sm' variant='ghost' disabled={!canNext}>
              <Link href={nextHref ?? '#'} aria-disabled={!canNext}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
