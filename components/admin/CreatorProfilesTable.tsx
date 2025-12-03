import { Badge, Button, Input } from '@jovie/ui';

import Link from 'next/link';
import { toggleCreatorVerifiedAction } from '@/app/admin/actions';

import { AdminCreatorFilters } from '@/components/admin/AdminCreatorFilters';
import { ClaimLinkCopyButton } from '@/components/admin/ClaimLinkCopyButton';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';

export interface CreatorProfilesTableProps {
  profiles: AdminCreatorProfileRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminCreatorProfilesSort;
}

export function CreatorProfilesTable({
  profiles,
  page,
  pageSize,
  total,
  search,
  sort,
}: CreatorProfilesTableProps) {
  const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(page * pageSize, total);

  const buildHref = (targetPage: number, includeSearch = true): string => {
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('pageSize', String(pageSize));
    params.set('sort', sort);
    if (includeSearch && search) {
      params.set('q', search);
    }
    const query = params.toString();
    return query.length > 0 ? `/admin?${query}` : '/admin';
  };

  const prevHref = canPrev ? buildHref(page - 1) : undefined;
  const nextHref = canNext ? buildHref(page + 1) : undefined;
  const clearHref = buildHref(1, false);

  return (
    <section
      aria-label='Creator profiles'
      className='space-y-4'
      data-testid='admin-creator-profiles-section'
    >
      <div className='space-y-1'>
        <h2 className='text-lg font-semibold text-primary-token'>
          Creator profiles
        </h2>
        <p className='text-xs text-secondary-token'>
          View and manage creator verification and avatars.
        </p>
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <form
          action='/admin'
          method='get'
          className='flex flex-wrap items-center gap-3'
        >
          <Input
            name='q'
            placeholder='Search by handle'
            defaultValue={search}
            className='max-w-xs'
          />
          <input type='hidden' name='page' value='1' />
          <AdminCreatorFilters initialSort={sort} initialPageSize={pageSize} />
          <Button type='submit' size='sm' variant='secondary'>
            Search
          </Button>
          {search && search.length > 0 && (
            <Button asChild size='sm' variant='ghost'>
              <Link href={clearHref}>Clear</Link>
            </Button>
          )}
        </form>

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
              <th className='px-2 py-2'>Created</th>
              <th className='px-2 py-2'>Claimed</th>
              <th className='px-2 py-2'>Verified</th>
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
              profiles.map(profile => (
                <tr key={profile.id} className='hover:bg-surface-2/60'>
                  <td className='px-2 py-3'>
                    <CreatorAvatarCell
                      profileId={profile.id}
                      username={profile.username}
                      avatarUrl={profile.avatarUrl}
                    />
                  </td>
                  <td className='px-2 py-3 font-medium text-primary-token'>
                    <Link
                      href={`/${profile.username}`}
                      className='hover:underline'
                    >
                      @{profile.username}
                    </Link>
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
                    <div className='flex items-center justify-end gap-2'>
                      {!profile.isClaimed && profile.claimToken && (
                        <ClaimLinkCopyButton claimToken={profile.claimToken} />
                      )}
                      <form action={toggleCreatorVerifiedAction}>
                        <input
                          type='hidden'
                          name='profileId'
                          value={profile.id}
                        />
                        <input
                          type='hidden'
                          name='nextVerified'
                          value={(!profile.isVerified).toString()}
                        />
                        <Button
                          type='submit'
                          size='sm'
                          variant={profile.isVerified ? 'secondary' : 'primary'}
                        >
                          {profile.isVerified ? 'Unverify' : 'Verify'}
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
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
    </section>
  );
}
