'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@jovie/ui';
import Link from 'next/link';

import type { AdminUserRow } from '@/lib/admin/users';

export interface AdminUsersTableProps {
  users: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
}

export function AdminUsersTable({
  users,
  page,
  pageSize,
  total,
  search,
}: AdminUsersTableProps) {
  const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(page * pageSize, total);

  const buildHref = (targetPage: number): string => {
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('pageSize', String(pageSize));
    if (search) params.set('q', search);
    const query = params.toString();
    return query.length > 0 ? `/app/admin/users?${query}` : '/app/admin/users';
  };

  const prevHref = canPrev ? buildHref(page - 1) : undefined;
  const nextHref = canNext ? buildHref(page + 1) : undefined;

  return (
    <Card className='border-subtle bg-surface-1/80'>
      <CardHeader className='space-y-1'>
        <CardTitle className='text-lg'>Users</CardTitle>
        <p className='text-xs text-secondary-token'>
          Includes signup date, email, and plan.
        </p>
      </CardHeader>

      <CardContent className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='text-xs text-secondary-token'>
            Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {total.toLocaleString()} users
          </div>

          <form
            action='/app/admin/users'
            method='get'
            className='flex items-center gap-2'
          >
            <input type='hidden' name='page' value='1' />
            <input type='hidden' name='pageSize' value={String(pageSize)} />
            <Input
              name='q'
              defaultValue={search}
              placeholder='Search by email or name'
              className='h-9 w-[240px]'
            />
            <Button type='submit' size='sm' variant='secondary'>
              Search
            </Button>
            {search ? (
              <Button asChild size='sm' variant='ghost'>
                <Link href='/app/admin/users'>Clear</Link>
              </Button>
            ) : null}
          </form>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-sm'>
            <thead className='text-left text-secondary-token'>
              <tr className='border-b border-subtle text-xs uppercase tracking-wide text-tertiary-token'>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-3 py-2'>
                  Name
                </th>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-3 py-2'>
                  Email
                </th>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-3 py-2'>
                  Sign up
                </th>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-3 py-2'>
                  Plan
                </th>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-3 py-2 text-right'>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className='px-3 py-8 text-center text-sm text-secondary-token'
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr
                    key={user.id}
                    className='border-b border-subtle last:border-b-0 hover:bg-surface-2/60'
                  >
                    <td className='px-3 py-3 font-medium text-primary-token'>
                      {user.name ?? '—'}
                    </td>
                    <td className='px-3 py-3 text-secondary-token'>
                      {user.email ?? '—'}
                    </td>
                    <td className='px-3 py-3 text-secondary-token whitespace-nowrap'>
                      {new Intl.DateTimeFormat('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }).format(user.createdAt)}
                    </td>
                    <td className='px-3 py-3'>
                      <Badge
                        size='sm'
                        variant={user.plan === 'pro' ? 'primary' : 'secondary'}
                      >
                        {user.plan}
                      </Badge>
                    </td>
                    <td className='px-3 py-3 text-right'>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className='mt-2 flex items-center justify-between gap-2 text-xs text-secondary-token'>
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
