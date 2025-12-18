'use client';

import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@jovie/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getNextUserSort,
  getUserSortDirection,
  type UserSortableColumnKey,
} from '@/components/admin/users-sort-config';
import { AdminPageSizeSelect } from '@/components/admin/table/AdminPageSizeSelect';
import { SortableHeaderButton } from '@/components/admin/table/SortableHeaderButton';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { UserActionsMenu } from '@/components/admin/UserActionsMenu';
import type { AdminUsersSort, AdminUserRow } from '@/lib/admin/users';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';

export interface AdminUsersTableProps {
  users: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminUsersSort;
}

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

export function AdminUsersTable({
  users,
  page,
  pageSize,
  total,
  search,
  sort,
}: AdminUsersTableProps) {
  const router = useRouter();
  const notifications = useNotifications();
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(page * pageSize, total);

  const buildHref = (
    targetPage: number,
    overrides?: {
      sort?: AdminUsersSort;
      pageSize?: number;
    },
    includeSearch = true
  ): string => {
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('pageSize', String(overrides?.pageSize ?? pageSize));
    params.set('sort', overrides?.sort ?? sort);
    if (includeSearch && search) params.set('q', search);
    const query = params.toString();
    return query.length > 0 ? `/app/admin/users?${query}` : '/app/admin/users';
  };

  const prevHref = canPrev ? buildHref(page - 1) : undefined;
  const nextHref = canNext ? buildHref(page + 1) : undefined;
  const clearHref = buildHref(1, undefined, false);

  const rowIds = useMemo(() => users.map(user => user.id), [users]);
  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
  } = useRowSelection(rowIds);

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

  const createSortHref = (column: UserSortableColumnKey) =>
    buildHref(1, { sort: getNextUserSort(sort, column) });

  const selectedUsers = useMemo(
    () => users.filter(user => selectedIds.has(user.id)),
    [selectedIds, users]
  );

  const copySelectedEmails = async (): Promise<void> => {
    const emails = selectedUsers
      .map(user => user.email)
      .filter((email): email is string => typeof email === 'string' && email.length > 0);

    if (emails.length === 0) {
      notifications.error('No emails available for selected users');
      return;
    }

    const success = await copyTextToClipboard(emails.join('\n'));
    if (success) {
      notifications.success(`Copied ${emails.length} email(s)`);
      return;
    }

    notifications.error('Failed to copy emails');
  };

  const copySelectedClerkIds = async (): Promise<void> => {
    const ids = selectedUsers
      .map(user => user.clerkId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (ids.length === 0) {
      notifications.error('No Clerk IDs available for selected users');
      return;
    }

    const success = await copyTextToClipboard(ids.join('\n'));
    if (success) {
      notifications.success(`Copied ${ids.length} Clerk ID(s)`);
      return;
    }

    notifications.error('Failed to copy Clerk IDs');
  };

  return (
    <div className='flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1'>
      <div
        className='min-h-0 flex-1 overflow-auto flex flex-col'
        ref={tableContainerRef}
      >
        <div
          className={cn(
            'sticky top-0 z-30 border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
            headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
          )}
        >
          <div className='flex h-14 w-full items-center gap-3 px-4'>
            <div className='hidden sm:block text-xs text-secondary-token'>
              Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
              {total.toLocaleString()} users
            </div>
            <div className='ml-auto flex items-center gap-3'>
              <form
                action='/app/admin/users'
                method='get'
                className='relative isolate flex items-center gap-2'
              >
                <input type='hidden' name='sort' value={sort} />
                <input type='hidden' name='pageSize' value={String(pageSize)} />
                <Input
                  name='q'
                  defaultValue={search}
                  placeholder='Search by email or name'
                  className='w-[240px]'
                />
                <input type='hidden' name='page' value='1' />
                <Button type='submit' size='sm' variant='secondary'>
                  Search
                </Button>
                {search ? (
                  <Button asChild size='sm' variant='ghost'>
                    <Link href={clearHref}>Clear</Link>
                  </Button>
                ) : null}
              </form>
            </div>
          </div>
        </div>

        <table className='w-full table-fixed border-separate border-spacing-0 text-[13px]'>
          <colgroup>
            <col className='w-14' />
            <col className='w-[260px]' />
            <col className='w-[280px]' />
            <col className='w-[160px]' />
            <col className='w-[140px]' />
            <col className='w-[120px]' />
            <col className='w-[72px]' />
          </colgroup>
          <thead className='text-left text-secondary-token'>
            <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
              <th
                className={cn(
                  'sticky top-14 z-20 w-14 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <Checkbox
                  aria-label='Select all users'
                  checked={headerCheckboxState}
                  onCheckedChange={toggleSelectAll}
                />
              </th>

              <th
                className={cn(
                  'sticky top-14 z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <span className='sr-only'>Bulk actions</span>
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
                    <DropdownMenuContent align='start'>
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
                          void copySelectedClerkIds();
                        }}
                      >
                        Copy Clerk IDs
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </th>

              <th
                className={cn(
                  'sticky top-14 z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <SortableHeaderButton
                  label='Name'
                  direction={getUserSortDirection(sort, 'name')}
                  onClick={() => router.push(createSortHref('name'))}
                />
              </th>
              <th
                className={cn(
                  'sticky top-14 z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <SortableHeaderButton
                  label='Email'
                  direction={getUserSortDirection(sort, 'email')}
                  onClick={() => router.push(createSortHref('email'))}
                />
              </th>
              <th
                className={cn(
                  'sticky top-14 z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <SortableHeaderButton
                  label='Sign up'
                  direction={getUserSortDirection(sort, 'created')}
                  onClick={() => router.push(createSortHref('created'))}
                />
              </th>
              <th
                className={cn(
                  'sticky top-14 z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <span className='inline-flex items-center font-semibold'>Plan</span>
              </th>
              <th
                className={cn(
                  'sticky top-14 z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <span className='inline-flex items-center font-semibold'>Status</span>
              </th>
              <th
                className={cn(
                  'sticky top-14 z-20 px-4 py-3 text-right border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                  headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
                )}
              >
                <span className='sr-only'>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className='px-4 py-10 text-center text-sm text-secondary-token'
                >
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user, index) => {
                const isChecked = selectedIds.has(user.id);
                const rowNumber = (page - 1) * pageSize + index + 1;

                return (
                  <tr
                    key={user.id}
                    className='group border-b border-subtle transition-colors duration-200 last:border-b-0 hover:bg-surface-2'
                    onContextMenu={event => {
                      event.preventDefault();
                      setOpenMenuUserId(user.id);
                    }}
                  >
                    <td className='w-14 px-4 py-3 align-middle'>
                      <div
                        className='relative flex h-7 w-7 items-center justify-center'
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
                            aria-label={`Select ${user.email ?? user.clerkId}`}
                            checked={isChecked}
                            onCheckedChange={() => toggleSelect(user.id)}
                          />
                        </div>
                      </div>
                    </td>
                    <td className='px-4 py-3 align-middle text-sm text-secondary-token'>
                      <span className='text-tertiary-token'>—</span>
                    </td>
                    <td className='px-4 py-3 align-middle text-sm text-primary-token'>
                      <div className='font-semibold'>{user.name ?? '—'}</div>
                      <div className='text-xs text-secondary-token'>{user.clerkId}</div>
                    </td>
                    <td className='px-4 py-3 align-middle text-sm text-secondary-token'>
                      {user.email ?? '—'}
                    </td>
                    <td className='px-4 py-3 align-middle text-sm text-secondary-token whitespace-nowrap'>
                      {new Intl.DateTimeFormat('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }).format(user.createdAt)}
                    </td>
                    <td className='px-4 py-3 align-middle'>
                      <Badge
                        size='sm'
                        variant={user.plan === 'pro' ? 'primary' : 'secondary'}
                      >
                        {user.plan}
                      </Badge>
                    </td>
                    <td className='px-4 py-3 align-middle'>
                      {user.deletedAt ? (
                        <Badge size='sm' variant='warning'>
                          Deleted
                        </Badge>
                      ) : (
                        <Badge size='sm' variant='success'>
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className='px-4 py-3 align-middle'>
                      <div className='flex items-center justify-end'>
                        <UserActionsMenu
                          user={user}
                          open={openMenuUserId === user.id}
                          onOpenChange={open =>
                            setOpenMenuUserId(open ? user.id : null)
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className='sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-1/80 px-3 py-2 text-xs text-secondary-token backdrop-blur supports-backdrop-filter:bg-surface-1/70'>
          <div className='flex items-center gap-2'>
            <span>
              Page {page} of {totalPages}
            </span>
            <span className='text-tertiary-token'>
              {from.toLocaleString()}–{to.toLocaleString()} of{' '}
              {total.toLocaleString()}
            </span>
          </div>
          <div className='flex items-center gap-3'>
            <AdminPageSizeSelect
              initialPageSize={pageSize}
              onPageSizeChange={nextPageSize => {
                router.push(buildHref(1, { pageSize: nextPageSize }));
              }}
            />
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
        </div>
      </div>
    </div>
  );
}
