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
import { Check, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { AdminCreatorFilters } from '@/components/admin/AdminCreatorFilters';
import { CreatorActionsMenu } from '@/components/admin/CreatorActionsMenu';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import {
  getNextSort,
  getSortDirection,
  SORTABLE_COLUMNS,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { DeleteCreatorDialog } from '@/components/admin/DeleteCreatorDialog';
import { IngestProfileDropdown } from '@/components/admin/IngestProfileDropdown';
import { useCreatorActions } from '@/components/admin/useCreatorActions';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import { ContactSidebar } from '@/components/organisms/ContactSidebar';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';
import type { Contact, ContactSidebarMode } from '@/types';

const CONTACT_PANEL_WIDTH = 360;

function useOptionalTableMeta() {
  try {
    return useTableMeta();
  } catch {
    return null;
  }
}

interface AdminCreatorProfilesWithSidebarProps {
  profiles: AdminCreatorProfileRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminCreatorProfilesSort;
  mode?: ContactSidebarMode;
  /** Base path for pagination/sort links. Defaults to '/app/admin/creators' */
  basePath?: string;
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
  basePath = '/app/admin/creators',
}: AdminCreatorProfilesWithSidebarProps) {
  const router = useRouter();
  const {
    profiles,
    statuses: verificationStatuses,
    toggleVerification,
  } = useCreatorVerification(initialProfiles);

  const {
    profiles: profilesWithActions,
    toggleFeatured,
    toggleMarketing,
    deleteCreatorOrUser,
  } = useCreatorActions(profiles);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuProfileId, setOpenMenuProfileId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draftContact, setDraftContact] = useState<Contact | null>(null);
  const tableMetaCtx = useOptionalTableMeta();
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState(search);
  const setTableMeta = React.useMemo(
    () => tableMetaCtx?.setTableMeta ?? (() => { }),
    [tableMetaCtx]
  );
  const [headerElevated, setHeaderElevated] = useState(false);

  // New states for dialogs and responsive
  const [isMobile, setIsMobile] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] =
    useState<AdminCreatorProfileRow | null>(null);

  // Detect mobile breakpoint
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    setIsMobile(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

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
    return query.length > 0 ? `${basePath}?${query}` : basePath;
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
      <button
        type='button'
        onClick={event => {
          event.stopPropagation();
          router.push(createSortHref(column));
        }}
        className='inline-flex w-full items-center gap-1 text-xs uppercase tracking-wide font-semibold text-left hover:text-primary-token focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
      >
        {columnConfig.label}
        <SortIndicator direction={direction} />
      </button>
    );
  };

  const filteredProfiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return profilesWithActions;
    return profilesWithActions.filter(profile => {
      const username = profile.username.toLowerCase();
      const displayName =
        'displayName' in profile
          ? (profile.displayName ?? '').toLowerCase()
          : '';
      return username.includes(term) || displayName.includes(term);
    });
  }, [profilesWithActions, searchTerm]);

  const selectedProfile = useMemo(
    () => filteredProfiles.find(p => p.id === selectedId) ?? null,
    [filteredProfiles, selectedId]
  );

  const selectedIndex = useMemo(
    () => filteredProfiles.findIndex(p => p.id === selectedId),
    [filteredProfiles, selectedId]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedCount = selectedIds.size;
  const allSelected =
    filteredProfiles.length > 0 && selectedCount === filteredProfiles.length;
  const someSelected =
    selectedCount > 0 && selectedCount < filteredProfiles.length;
  const headerCheckboxState: boolean | 'indeterminate' = allSelected
    ? true
    : someSelected
      ? 'indeterminate'
      : false;

  const effectiveContact = useMemo(() => {
    if (draftContact && draftContact.id === selectedId) return draftContact;
    return mapProfileToContact(selectedProfile);
  }, [draftContact, selectedId, selectedProfile]);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setSidebarOpen(true);
    setDraftContact(null);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (filteredProfiles.length === 0) return new Set<string>();
      if (prev.size === filteredProfiles.length) return new Set<string>();
      return new Set(filteredProfiles.map(p => p.id));
    });
  };

  React.useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set<string>();
      filteredProfiles.forEach(profile => {
        if (prev.has(profile.id)) next.add(profile.id);
      });
      return next;
    });
  }, [filteredProfiles]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isFormElement(event.target)) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (filteredProfiles.length === 0) return;

      event.preventDefault();

      if (event.key === 'ArrowDown') {
        if (selectedIndex === -1) {
          setSelectedId(filteredProfiles[0]?.id ?? null);
        } else {
          const nextIndex = Math.min(
            selectedIndex + 1,
            filteredProfiles.length - 1
          );
          setSelectedId(filteredProfiles[nextIndex]?.id ?? null);
        }
      } else if (event.key === 'ArrowUp') {
        if (selectedIndex === -1) {
          setSelectedId(
            filteredProfiles[filteredProfiles.length - 1]?.id ?? null
          );
        } else {
          const prevIndex = Math.max(selectedIndex - 1, 0);
          setSelectedId(filteredProfiles[prevIndex]?.id ?? null);
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

  // Ensure the phone preview never opens empty: select the first creator if none is selected.
  React.useEffect(() => {
    if (sidebarOpen && !selectedId && profilesWithActions.length > 0) {
      setSelectedId(profilesWithActions[0]!.id);
      setDraftContact(null);
    }
  }, [sidebarOpen, selectedId, profilesWithActions]);

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

  // Expose row count and toggle handler for dashboard action button
  React.useEffect(() => {
    const toggle = () => {
      setSidebarOpen(prev => {
        const next = !prev;
        if (next && !selectedId && filteredProfiles[0]) {
          setSelectedId(filteredProfiles[0]!.id);
          setDraftContact(null);
        }
        return next;
      });
    };

    setTableMeta({
      rowCount: filteredProfiles.length,
      toggle,
      rightPanelWidth:
        sidebarOpen && Boolean(effectiveContact) ? CONTACT_PANEL_WIDTH : 0,
    });

    return () => {
      setTableMeta({ rowCount: null, toggle: null, rightPanelWidth: null });
    };
  }, [
    filteredProfiles,
    selectedId,
    setTableMeta,
    sidebarOpen,
    effectiveContact,
  ]);

  return (
    <div className='flex h-full min-h-0 flex-col md:flex-row md:items-stretch'>
      <div className='flex-1 min-h-0 overflow-hidden rounded-lg border border-subtle bg-surface-1'>
        <div
          className='min-h-0 flex-1 overflow-auto flex flex-col'
          ref={tableContainerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
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
                {total.toLocaleString()} profiles
              </div>
              <div className='ml-auto flex items-center gap-3'>
                <form
                  action={basePath}
                  method='get'
                  className='relative isolate flex items-center gap-2'
                >
                  <input type='hidden' name='sort' value={sort} />
                  <input type='hidden' name='pageSize' value={pageSize} />
                  <Input
                    name='q'
                    placeholder='Search by handle'
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    className='w-[240px]'
                  />
                  <input type='hidden' name='page' value='1' />
                  <Button type='submit' size='sm' variant='secondary'>
                    Search
                  </Button>
                  {search && search.length > 0 && (
                    <Button asChild size='sm' variant='ghost'>
                      <Link href={clearHref}>Clear</Link>
                    </Button>
                  )}
                </form>
                <div
                  className='hidden h-6 w-px bg-border sm:block'
                  aria-hidden='true'
                />
                <IngestProfileDropdown />
              </div>
            </div>
          </div>
          <table className='w-full table-fixed border-separate border-spacing-0 text-[13px]'>
            <colgroup>
              <col className='w-14' />
              <col className='w-[320px]' />
              <col className='w-[160px]' />
              <col className='w-[160px]' />
              <col className='w-[160px]' />
              <col className='w-[140px]' />
            </colgroup>
            <thead className='text-left text-secondary-token'>
              <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
                <th
                  className={cn(
                    'sticky top-14 z-20 w-14 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                    headerElevated &&
                    'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                >
                  <Checkbox
                    aria-label='Select all creators'
                    checked={headerCheckboxState}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th
                  className={cn(
                    'sticky top-14 z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                    headerElevated &&
                    'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                >
                  <span className='sr-only'>Creator</span>
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
                        <DropdownMenuItem disabled>
                          Feature selected (coming soon)
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          Unverify selected (coming soon)
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className='text-destructive'>
                          Delete selected (coming soon)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
                <th
                  className={cn(
                    'sticky top-14 z-20 px-4 py-3 text-left cursor-pointer select-none border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                    headerElevated &&
                    'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                  onClick={() => router.push(createSortHref('created'))}
                >
                  {renderSortHeader('created')}
                </th>
                <th
                  className={cn(
                    'sticky top-14 z-20 px-4 py-3 text-left cursor-pointer select-none border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                    headerElevated &&
                    'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                  onClick={() => router.push(createSortHref('claimed'))}
                >
                  {renderSortHeader('claimed')}
                </th>
                <th
                  className={cn(
                    'sticky top-14 z-20 px-4 py-3 text-left cursor-pointer select-none border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                    headerElevated &&
                    'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                  onClick={() => router.push(createSortHref('verified'))}
                >
                  {renderSortHeader('verified')}
                </th>
                <th
                  className={cn(
                    'sticky top-14 z-20 px-4 py-3 text-right border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                    headerElevated &&
                    'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                >
                  <span className='sr-only'>Action</span>
                  <div className='flex items-center justify-end' />
                </th>
              </tr>
            </thead>
            <tbody>
              {profilesWithActions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className='px-4 py-10 text-center text-sm text-secondary-token'
                  >
                    No creator profiles found.
                  </td>
                </tr>
              ) : (
                profilesWithActions.map((profile, index) => {
                  const isSelected = profile.id === selectedId;
                  const isChecked = selectedIds.has(profile.id);
                  const rowNumber = (page - 1) * pageSize + index + 1;
                  const displayName =
                    'displayName' in profile
                      ? (profile.displayName ?? null)
                      : null;
                  return (
                    <tr
                      key={profile.id}
                      className={cn(
                        'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0',
                        isSelected ? 'bg-surface-2' : 'hover:bg-surface-2'
                      )}
                      onClick={() => handleRowClick(profile.id)}
                      onContextMenu={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenMenuProfileId(profile.id);
                      }}
                      aria-selected={isSelected}
                    >
                      <td className='w-14 px-4 py-3 align-middle'>
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
                              aria-label={`Select ${profile.username}`}
                              checked={isChecked}
                              onCheckedChange={() => toggleSelect(profile.id)}
                            />
                          </div>
                        </div>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 align-middle',
                          isSelected && 'bg-surface-2'
                        )}
                      >
                        <div className='flex items-center gap-3'>
                          <CreatorAvatarCell
                            profileId={profile.id}
                            username={profile.username}
                            avatarUrl={profile.avatarUrl}
                            verified={profile.isVerified}
                            isFeatured={profile.isFeatured}
                          />
                          <div className='min-w-0'>
                            {displayName ? (
                              <div className='truncate font-medium text-primary-token'>
                                {displayName}
                              </div>
                            ) : null}
                            <Link
                              href={`/${profile.username}`}
                              className={cn(
                                'truncate text-secondary-token/80 transition-colors hover:text-primary-token',
                                displayName
                                  ? 'text-xs'
                                  : 'font-medium text-primary-token'
                              )}
                              onClick={event => event.stopPropagation()}
                            >
                              @{profile.username}
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className='px-4 py-3 align-middle text-xs text-tertiary-token whitespace-nowrap'>
                        {profile.createdAt
                          ? new Intl.DateTimeFormat('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }).format(profile.createdAt)
                          : '—'}
                      </td>
                      <td className='px-4 py-3 align-middle text-xs whitespace-nowrap'>
                        <Badge
                          size='sm'
                          variant={profile.isClaimed ? 'success' : 'secondary'}
                        >
                          {profile.isClaimed ? (
                            <>
                              <Star
                                className='h-3 w-3 fill-current'
                                aria-hidden='true'
                              />
                              <span>Claimed</span>
                            </>
                          ) : (
                            <span>Unclaimed</span>
                          )}
                        </Badge>
                      </td>
                      <td className='px-4 py-3 align-middle text-xs whitespace-nowrap'>
                        <Badge
                          size='sm'
                          variant={profile.isVerified ? 'primary' : 'secondary'}
                        >
                          {profile.isVerified ? (
                            <>
                              <Check className='h-3 w-3' aria-hidden='true' />
                              <span>Verified</span>
                            </>
                          ) : (
                            <span>Not verified</span>
                          )}
                        </Badge>
                      </td>
                      <td
                        className='px-4 py-3 align-middle text-right'
                        onClick={e => e.stopPropagation()}
                      >
                        <div
                          className={cn(
                            'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
                            openMenuProfileId === profile.id &&
                            'opacity-100 pointer-events-auto'
                          )}
                        >
                          <CreatorActionsMenu
                            profile={profile}
                            isMobile={isMobile}
                            status={verificationStatuses[profile.id] ?? 'idle'}
                            open={openMenuProfileId === profile.id}
                            onOpenChange={open =>
                              setOpenMenuProfileId(open ? profile.id : null)
                            }
                            onToggleVerification={async () => {
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
                            onToggleFeatured={async () => {
                              const result = await toggleFeatured(
                                profile.id,
                                !profile.isFeatured
                              );
                              if (!result.success) {
                                console.error(
                                  'Failed to toggle featured',
                                  result.error
                                );
                              }
                            }}
                            onToggleMarketing={async () => {
                              const result = await toggleMarketing(
                                profile.id,
                                !profile.marketingOptOut
                              );
                              if (!result.success) {
                                console.error(
                                  'Failed to toggle marketing',
                                  result.error
                                );
                              }
                            }}
                            onDelete={() => {
                              setProfileToDelete(profile);
                              setDeleteDialogOpen(true);
                            }}
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
              <div className='flex items-center gap-2'>
                <span>Rows per page</span>
                <AdminCreatorFilters initialPageSize={pageSize} />
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
      </div>
      <RightDrawer
        isOpen={sidebarOpen && Boolean(effectiveContact)}
        width={CONTACT_PANEL_WIDTH}
        ariaLabel='Contact details'
        className='hidden md:flex bg-sidebar-surface border-sidebar-border'
      >
        <div className='flex-1 min-h-0 overflow-auto'>
          <ContactSidebar
            contact={effectiveContact}
            mode={mode}
            isOpen={sidebarOpen && Boolean(effectiveContact)}
            onClose={handleSidebarClose}
            onContactChange={handleContactChange}
            onAvatarUpload={handleAvatarUpload}
          />
        </div>
      </RightDrawer>
      <DeleteCreatorDialog
        profile={profileToDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (!profileToDelete) return { success: false };
          const result = await deleteCreatorOrUser(profileToDelete.id);
          if (result.success) {
            setProfileToDelete(null);
          }
          return result;
        }}
      />
    </div>
  );
}
