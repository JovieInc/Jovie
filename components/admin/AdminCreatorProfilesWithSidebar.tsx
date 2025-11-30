'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@jovie/ui';
import Link from 'next/link';
import React, { useCallback, useMemo, useState } from 'react';

import { AdminCreatorFilters } from '@/components/admin/AdminCreatorFilters';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import { ContactSidebar } from '@/components/organisms/ContactSidebar';
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';
import type { Contact, ContactSidebarMode } from '@/types';

interface AdminCreatorProfilesWithSidebarProps {
  profiles: AdminCreatorProfileRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminCreatorProfilesSort;
  mode?: ContactSidebarMode;
}

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON'
  );
}

function mapProfileToContact(
  profile: AdminCreatorProfileRow | null
): Contact | null {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    displayName:
      'displayName' in profile ? (profile.displayName ?? null) : null,
    firstName: undefined,
    lastName: undefined,
    avatarUrl: profile.avatarUrl ?? null,
    socialLinks: [],
  };
}

export function AdminCreatorProfilesWithSidebar({
  profiles,
  page,
  pageSize,
  total,
  search,
  sort,
  mode = 'admin',
}: AdminCreatorProfilesWithSidebarProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draftContact, setDraftContact] = useState<Contact | null>(null);

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
    return query.length > 0 ? `/admin/users?${query}` : '/admin/users';
  };

  const prevHref = canPrev ? buildHref(page - 1) : undefined;
  const nextHref = canNext ? buildHref(page + 1) : undefined;
  const clearHref = buildHref(1, false);

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const effectiveContact = useMemo(() => {
    if (draftContact && draftContact.id === selectedId) return draftContact;
    return mapProfileToContact(selectedProfile);
  }, [draftContact, selectedId, selectedProfile]);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setSidebarOpen(false);
    setDraftContact(null);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isFormElement(event.target)) return;

    if (event.key === ' ' || event.key === 'Spacebar') {
      if (!selectedProfile) return;
      event.preventDefault();
      setSidebarOpen(open => !open);
    } else if (event.key === 'Escape') {
      if (sidebarOpen) {
        event.preventDefault();
        setSidebarOpen(false);
      }
    }
  };

  const handleContactChange = (updated: Contact) => {
    setDraftContact(updated);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  return (
    <div className='flex flex-col md:flex-row md:items-stretch gap-4'>
      <div
        className={cn(
          'flex-1 outline-none',
          'transition-[flex-basis] duration-200 ease-out'
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label='Creator profiles table'
      >
        <Card className='border-subtle bg-surface-1/80 backdrop-blur-sm overflow-hidden'>
          <CardHeader className='space-y-1'>
            <CardTitle className='text-lg'>Creator profiles</CardTitle>
            <p className='text-xs text-secondary-token'>
              View and manage creator verification and avatars.
            </p>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <form
                action='/admin/users'
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
                <AdminCreatorFilters
                  initialSort={sort}
                  initialPageSize={pageSize}
                />
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
                  <tr className='border-b border-subtle text-xs uppercase tracking-wide text-tertiary-token'>
                    <th className='px-2 py-2'>Avatar</th>
                    <th className='px-2 py-2'>Handle</th>
                    <th className='px-2 py-2'>Created</th>
                    <th className='px-2 py-2'>Claimed</th>
                    <th className='px-2 py-2'>Verified</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-subtle'>
                  {profiles.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className='px-2 py-6 text-center text-sm text-secondary-token'
                      >
                        No creator profiles found.
                      </td>
                    </tr>
                  ) : (
                    profiles.map(profile => {
                      const isSelected = profile.id === selectedId;
                      return (
                        <tr
                          key={profile.id}
                          className={cn(
                            'hover:bg-surface-2/60 cursor-pointer',
                            isSelected && 'bg-surface-2/80'
                          )}
                          onClick={() => handleRowClick(profile.id)}
                          aria-selected={isSelected}
                        >
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
                              onClick={event => event.stopPropagation()}
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
                          <td className='px-2 py-3 text-xs text-secondary-token'>
                            {profile.isClaimed ? 'Claimed' : 'Unclaimed'}
                          </td>
                          <td className='px-2 py-3 text-xs text-secondary-token'>
                            {profile.isVerified ? 'Verified' : 'Not verified'}
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
      </div>

      <div
        className={cn(
          'hidden md:flex md:shrink-0 transition-[width] duration-200 ease-out overflow-hidden',
          sidebarOpen && effectiveContact
            ? 'md:w-[340px] lg:w-[360px]'
            : 'md:w-0 lg:w-0'
        )}
        aria-hidden={!sidebarOpen || !effectiveContact}
      >
        <ContactSidebar
          contact={effectiveContact}
          mode={mode}
          isOpen={sidebarOpen && Boolean(effectiveContact)}
          onClose={handleSidebarClose}
          onContactChange={handleContactChange}
        />
      </div>
    </div>
  );
}
