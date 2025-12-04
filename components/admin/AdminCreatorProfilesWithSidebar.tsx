'use client';

import { Button, Input } from '@jovie/ui';
import Link from 'next/link';
import React, { useCallback, useMemo, useState } from 'react';

import { AdminCreatorFilters } from '@/components/admin/AdminCreatorFilters';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import { CreatorVerificationToggleButton } from '@/components/admin/CreatorVerificationToggleButton';
import {
  getNextSort,
  getSortDirection,
  SORTABLE_COLUMNS,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
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

export function AdminCreatorProfilesWithSidebar({
  profiles: initialProfiles,
  page,
  pageSize,
  total,
  search,
  sort,
  mode = 'admin',
}: AdminCreatorProfilesWithSidebarProps) {
  const {
    profiles,
    statuses: verificationStatuses,
    toggleVerification,
  } = useCreatorVerification(initialProfiles);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draftContact, setDraftContact] = useState<Contact | null>(null);

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
    return query.length > 0 ? `/admin/users?${query}` : '/admin/users';
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
        onClick={event => event.stopPropagation()}
      >
        {columnConfig.label}
        <SortIndicator direction={direction} />
      </Link>
    );
  };

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const selectedIndex = useMemo(
    () => profiles.findIndex(p => p.id === selectedId),
    [profiles, selectedId]
  );

  const effectiveContact = useMemo(() => {
    if (draftContact && draftContact.id === selectedId) return draftContact;
    return mapProfileToContact(selectedProfile);
  }, [draftContact, selectedId, selectedProfile]);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setSidebarOpen(true);
    setDraftContact(null);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isFormElement(event.target)) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (profiles.length === 0) return;

      event.preventDefault();

      if (event.key === 'ArrowDown') {
        if (selectedIndex === -1) {
          setSelectedId(profiles[0]?.id ?? null);
        } else {
          const nextIndex = Math.min(selectedIndex + 1, profiles.length - 1);
          setSelectedId(profiles[nextIndex]?.id ?? null);
        }
      } else if (event.key === 'ArrowUp') {
        if (selectedIndex === -1) {
          setSelectedId(profiles[profiles.length - 1]?.id ?? null);
        } else {
          const prevIndex = Math.max(selectedIndex - 1, 0);
          setSelectedId(profiles[prevIndex]?.id ?? null);
        }
      }
    } else if (event.key === ' ' || event.key === 'Spacebar') {
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

  const handleAvatarUpload = useCallback(
    async (file: File, contact: Contact): Promise<string> => {
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadJson = (await uploadResponse.json().catch(() => ({}))) as {
        blobUrl?: string;
        error?: string;
      };

      if (!uploadResponse.ok || !uploadJson.blobUrl) {
        const message = uploadJson.error || 'Failed to upload avatar';
        throw new Error(message);
      }

      const blobUrl = uploadJson.blobUrl;

      const adminResponse = await fetch('/api/admin/creator-avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: contact.id,
          avatarUrl: blobUrl,
        }),
      });

      if (!adminResponse.ok) {
        const adminJson = (await adminResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        const message = adminJson.error || 'Failed to update creator avatar';
        throw new Error(message);
      }

      return blobUrl;
    },
    []
  );

  return (
    <div className='flex flex-col md:flex-row md:items-stretch gap-4 md:min-h-[calc(100vh-220px)]'>
      <div
        className={cn(
          'flex-1 outline-none',
          'transition-[flex-basis] duration-200 ease-out'
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label='Creator profiles table'
      >
        <div className='flex-1 w-full space-y-6 rounded-[28px] border border-subtle bg-surface-1/80 p-6 shadow-sm transition'>
          <div className='space-y-1'>
            <h2 className='text-lg font-semibold text-primary-token'>
              Creator profiles
            </h2>
            <p className='text-xs text-secondary-token'>
              View and manage creator verification and avatars.
            </p>
          </div>

          <div className='space-y-3'>
            <form
              action='/admin/users'
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

            <div className='text-xs text-secondary-token'>
              Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
              {total.toLocaleString()} profiles
            </div>
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full border-collapse text-sm'>
              <thead className='text-left text-secondary-token'>
                <tr className='border-b border-subtle/60 text-xs uppercase tracking-wide text-tertiary-token'>
                  <th className='px-2 py-2 text-left sticky top-0 z-10 bg-surface-1/80'>
                    Avatar
                  </th>
                  <th className='px-2 py-2 text-left sticky top-0 z-10 bg-surface-1/80'>
                    Handle
                  </th>
                  <th className='px-2 py-2 text-left sticky top-0 z-10 bg-surface-1/80'>
                    {renderSortHeader('created')}
                  </th>
                  <th className='px-2 py-2 text-left sticky top-0 z-10 bg-surface-1/80'>
                    {renderSortHeader('claimed')}
                  </th>
                  <th className='px-2 py-2 text-left sticky top-0 z-10 bg-surface-1/80'>
                    {renderSortHeader('verified')}
                  </th>
                  <th className='px-2 py-2 text-right sticky top-0 z-10 bg-surface-1/80'>
                    Action
                  </th>
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
                    const isSelected = profile.id === selectedId;
                    return (
                      <tr
                        key={profile.id}
                        className={cn(
                          'transition-colors duration-200 cursor-pointer',
                          isSelected
                            ? 'bg-gray-50 dark:bg-gray-900/60'
                            : 'hover:bg-surface-2/60'
                        )}
                        onClick={() => handleRowClick(profile.id)}
                        aria-selected={isSelected}
                      >
                        <td
                          className={cn(
                            'px-2 py-3 border-l border-transparent',
                            isSelected && 'border-l-2 border-accent'
                          )}
                        >
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
                        <td className='px-2 py-3 text-right'>
                          <CreatorVerificationToggleButton
                            profile={profile}
                            status={verificationStatuses[profile.id] ?? 'idle'}
                            onToggle={async () => {
                              const result = await toggleVerification(
                                profile.id,
                                !profile.isVerified
                              );
                              if (!result.success) {
                                console.error(
                                  'Failed to toggle verification',
                                  result.error
                                );
                              }
                            }}
                          />
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
        </div>
      </div>

      <div
        className={cn(
          'hidden md:flex md:shrink-0 md:h-full transition-[width] duration-200 ease-out overflow-hidden',
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
          onAvatarUpload={handleAvatarUpload}
        />
      </div>
    </div>
  );
}
