'use client';

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@jovie/ui';
import { Check, Loader2, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTableMeta } from '@/app/dashboard/DashboardLayoutClient';
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
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';
import type { Contact, ContactSidebarMode } from '@/types';

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
  /** Base path for pagination/sort links. Defaults to '/admin/users' */
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
  basePath = '/admin/users',
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draftContact, setDraftContact] = useState<Contact | null>(null);
  const tableMetaCtx = useOptionalTableMeta();
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState(search);
  const setTableMeta = React.useMemo(
    () => tableMetaCtx?.setTableMeta ?? (() => {}),
    [tableMetaCtx]
  );
  const [headerElevated, setHeaderElevated] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [pendingProfiles, setPendingProfiles] = useState<
    Pick<
      AdminCreatorProfileRow,
      | 'id'
      | 'username'
      | 'usernameNormalized'
      | 'avatarUrl'
      | 'isVerified'
      | 'isFeatured'
      | 'marketingOptOut'
      | 'isClaimed'
      | 'claimToken'
      | 'claimTokenExpiresAt'
      | 'userId'
      | 'createdAt'
      | 'ingestionStatus'
      | 'lastIngestionError'
      | 'displayName'
    >[]
  >([]);

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

  // Drop pending placeholders once real profiles arrive.
  React.useEffect(() => {
    setPendingProfiles(prev =>
      prev.filter(pending =>
        profilesWithActions.every(profile => profile.id !== pending.id)
      )
    );
  }, [profilesWithActions]);

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

  const mergedProfiles = useMemo(() => {
    const pendingFiltered = pendingProfiles.filter(
      pending => !profilesWithActions.some(profile => profile.id === pending.id)
    );
    return [...pendingFiltered, ...profilesWithActions];
  }, [pendingProfiles, profilesWithActions]);

  const filteredProfiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return mergedProfiles;
    return mergedProfiles.filter(profile => {
      const username = profile.username.toLowerCase();
      const displayName =
        'displayName' in profile
          ? (profile.displayName ?? '').toLowerCase()
          : '';
      return username.includes(term) || displayName.includes(term);
    });
  }, [mergedProfiles, searchTerm]);

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
    });

    return () => {
      setTableMeta({ rowCount: null, toggle: null });
    };
  }, [filteredProfiles, selectedId, setTableMeta]);

  return (
    <div
      className={cn(
        'relative flex flex-col gap-0 md:flex-row md:items-stretch min-h-screen md:min-h-[calc(100vh-80px)] md:h-svh',
        sidebarOpen && effectiveContact
          ? 'md:pr-[340px] lg:pr-[360px]'
          : undefined
      )}
    >
      <div
        className={cn(
          'flex-1 outline-none flex flex-col',
          'transition-[flex-basis] duration-200 ease-out'
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label='Creator profiles table'
      >
        <div className='w-full space-y-4 px-2 sm:px-3 md:px-4'>
          <div className='relative z-30 flex flex-wrap items-center justify-between gap-3 text-xs text-[#555] dark:text-[#999] mb-3 md:mb-4 bg-white border-b border-[#e5e5e5] px-2 sm:px-3 md:px-4 py-3 rounded-none dark:bg-[#0a0a0a] dark:border-[#1f1f1f]'>
            <div className='hidden sm:block'>
              Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
              {total.toLocaleString()} profiles
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <form
                action={basePath}
                method='get'
                className='relative z-40 isolate flex items-center gap-2 flex-nowrap'
              >
                <input type='hidden' name='sort' value={sort} />
                <input type='hidden' name='pageSize' value={pageSize} />
                <Input
                  name='q'
                  placeholder='Search by handle'
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  className='w-[220px]'
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
              <div className='ml-1'>
                <IngestProfileDropdown
                  onIngestPending={({ id, username }) => {
                    setPendingProfiles(prev => {
                      if (prev.some(profile => profile.id === id)) return prev;
                      return [
                        ...prev,
                        {
                          id,
                          username,
                          usernameNormalized: username.toLowerCase(),
                          displayName: username,
                          avatarUrl: null,
                          isVerified: false,
                          isFeatured: false,
                          marketingOptOut: false,
                          isClaimed: false,
                          claimToken: null,
                          claimTokenExpiresAt: null,
                          userId: null,
                          createdAt: new Date(),
                          ingestionStatus: 'processing',
                          lastIngestionError: null,
                        },
                      ];
                    });
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className='flex-1 overflow-auto w-full px-0 bg-white text-[#111] dark:bg-[#0a0a0a] dark:text-[#eaeaea]'
          ref={tableContainerRef}
        >
          <table className='w-full min-w-full table-auto text-sm border-separate border-spacing-0'>
            <thead
              className={cn(
                'sticky top-0 z-40 text-left text-[#111] border-b border-[#e5e5e5] bg-white dark:text-[#eaeaea] dark:border-[#1f1f1f] dark:bg-[#0a0a0a]',
                headerElevated &&
                  'shadow-sm shadow-black/10 dark:shadow-black/30'
              )}
            >
              <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
                <th className='w-14 px-3 py-2 text-left'>
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      aria-label='Select all creators'
                      checked={headerCheckboxState}
                      onCheckedChange={toggleSelectAll}
                      className='h-4 w-4 bg-[#111] border-[#1f1f1f] data-[state=checked]:bg-[#222] data-[state=checked]:border-[#1f1f1f] focus-visible:ring-2 focus-visible:ring-[#444]'
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-8 px-2 text-[11px] font-semibold'
                          disabled={selectedIds.size === 0}
                        >
                          Bulk actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align='start'
                        className='rounded-lg bg-white text-[#111] border border-[#e5e5e5] dark:bg-[#111] dark:text-[#eaeaea] dark:border-[#1f1f1f]'
                      >
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
                <th className='px-2 py-2 text-left' />
                <th
                  className='px-2 py-2 text-left cursor-pointer select-none'
                  onClick={() => router.push(createSortHref('created'))}
                >
                  {renderSortHeader('created')}
                </th>
                <th
                  className='px-2 py-2 text-left cursor-pointer select-none'
                  onClick={() => router.push(createSortHref('claimed'))}
                >
                  {renderSortHeader('claimed')}
                </th>
                <th
                  className='px-2 py-2 text-left cursor-pointer select-none'
                  onClick={() => router.push(createSortHref('verified'))}
                >
                  {renderSortHeader('verified')}
                </th>
                <th className='px-2 py-2 text-right'>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className='px-2 py-6 text-center text-sm text-secondary-token'
                  >
                    No creator profiles found.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map(profile => {
                  const isPending = profile.ingestionStatus !== 'idle';
                  const isSelected = profile.id === selectedId;
                  const isChecked = selectedIds.has(profile.id);
                  return (
                    <tr
                      key={profile.id}
                      className={cn(
                        'cursor-pointer transition-colors duration-200 h-16 text-[#111] bg-white hover:bg-[#f5f5f5] dark:text-[#eaeaea] dark:bg-[#111] dark:hover:bg-[#1a1a1a]',
                        isSelected &&
                          'bg-[#eaeaea] dark:bg-[#111] dark:ring-1 dark:ring-[#1f1f1f]'
                      )}
                      onClick={() => {
                        if (isPending) return;
                        handleRowClick(profile.id);
                      }}
                      aria-selected={isSelected}
                    >
                      <td
                        className={cn(
                          'w-14 px-3 py-3 border-l border-transparent',
                          isSelected && 'bg-surface-2/40 dark:bg-white/5'
                        )}
                      >
                        <div className='flex items-center gap-3'>
                          <Checkbox
                            aria-label={`Select ${profile.username}`}
                            checked={isChecked}
                            disabled={isPending}
                            onClick={event => event.stopPropagation()}
                            onCheckedChange={() => toggleSelect(profile.id)}
                            className='h-4 w-4 bg-white border-[#e5e5e5] data-[state=checked]:bg-[#111] data-[state=checked]:border-[#111] focus-visible:ring-2 focus-visible:ring-[#dcdcdc] dark:bg-[#111] dark:border-[#1f1f1f] dark:data-[state=checked]:bg-[#222] dark:data-[state=checked]:border-[#1f1f1f] dark:focus-visible:ring-[#444]'
                          />
                          {isPending ? (
                            <div className='flex items-center gap-3'>
                              <div className='h-10 w-10 rounded-full bg-surface-3 animate-pulse' />
                              <div className='flex flex-col gap-1'>
                                <div className='h-3 w-24 rounded bg-surface-3 animate-pulse' />
                                <div className='h-3 w-16 rounded bg-surface-3/80 animate-pulse' />
                              </div>
                            </div>
                          ) : (
                            <>
                              <CreatorAvatarCell
                                profileId={profile.id}
                                username={profile.username}
                                avatarUrl={profile.avatarUrl}
                                verified={profile.isVerified}
                                isFeatured={profile.isFeatured}
                              />
                              <Link
                                href={`/${profile.username}`}
                                className='flex flex-col leading-tight hover:underline'
                                onClick={event => event.stopPropagation()}
                                aria-label={`@${profile.username}`}
                              >
                                <span className='text-sm font-semibold text-primary-token max-w-[180px] truncate whitespace-nowrap'>
                                  {profile.displayName ?? profile.username}
                                </span>
                                <span className='text-[12px] text-secondary-token max-w-[180px] truncate whitespace-nowrap'>
                                  @{profile.username}
                                </span>
                              </Link>
                            </>
                          )}
                        </div>
                      </td>
                      <td
                        className={cn(
                          'px-2 py-3 text-xs text-tertiary-token',
                          isSelected && 'bg-surface-2/40 dark:bg-white/5'
                        )}
                      />
                      <td
                        className={cn(
                          'px-2 py-3 text-xs text-tertiary-token',
                          isSelected && 'bg-surface-2/40 dark:bg-white/5'
                        )}
                      >
                        {isPending ? (
                          <div className='h-3 w-20 rounded bg-surface-3 animate-pulse' />
                        ) : profile.createdAt ? (
                          new Intl.DateTimeFormat('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }).format(profile.createdAt)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-3 text-xs',
                          isSelected && 'bg-surface-2/40 dark:bg-white/5'
                        )}
                      >
                        {isPending ? (
                          <div className='h-6 w-24 rounded-full bg-surface-3 animate-pulse' />
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                              profile.isClaimed
                                ? 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200 dark:bg-green-900/40 dark:text-green-200 dark:ring-green-800'
                                : 'bg-gray-50 text-secondary-token ring-1 ring-inset ring-gray-200 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10'
                            )}
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
                              <>
                                <span
                                  className='h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500'
                                  aria-hidden='true'
                                />
                                <span>Unclaimed</span>
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-3 text-xs',
                          isSelected && 'bg-surface-2/40 dark:bg-white/5'
                        )}
                      >
                        {isPending ? (
                          <div className='h-6 w-24 rounded-full bg-surface-3 animate-pulse' />
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                              profile.isVerified
                                ? 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200 dark:bg-blue-900/30 dark:text-blue-100 dark:ring-blue-800'
                                : 'bg-gray-50 text-secondary-token ring-1 ring-inset ring-gray-200 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10'
                            )}
                          >
                            {profile.isVerified ? (
                              <>
                                <Check className='h-3 w-3' aria-hidden='true' />
                                <span>Verified</span>
                              </>
                            ) : (
                              <>
                                <span
                                  className='h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500'
                                  aria-hidden='true'
                                />
                                <span>Not verified</span>
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-3 text-right',
                          isSelected && 'bg-surface-2/40 dark:bg-white/5'
                        )}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className='flex flex-col items-end gap-1'>
                          {isPending ? (
                            <div className='inline-flex items-center justify-end gap-2 text-secondary-token'>
                              <Loader2 className='h-4 w-4 animate-spin' />
                              <span className='text-xs'>Ingesting…</span>
                            </div>
                          ) : (
                            <CreatorActionsMenu
                              profile={profile}
                              isMobile={isMobile}
                              status={
                                verificationStatuses[profile.id] ?? 'idle'
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
                              onRefresh={async () => {
                                setRefreshingIds(prev => {
                                  const next = new Set(prev);
                                  next.add(profile.id);
                                  return next;
                                });
                                try {
                                  await fetch('/api/admin/creator-ingest', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      url: `https://linktr.ee/${profile.usernameNormalized ?? profile.username}`,
                                    }),
                                  });
                                } catch (error) {
                                  console.error('Refresh ingest failed', error);
                                } finally {
                                  setRefreshingIds(prev => {
                                    const next = new Set(prev);
                                    next.delete(profile.id);
                                    return next;
                                  });
                                }
                              }}
                              refreshing={refreshingIds.has(profile.id)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className='sticky bottom-0 left-0 right-0 mt-4 flex flex-wrap items-center justify-between gap-3 bg-white/95 text-[#111] border-t border-[#e5e5e5] px-3 py-2 text-xs backdrop-blur-sm shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.15)] dark:bg-[#0a0a0a]/95 dark:text-[#eaeaea] dark:border-t-[#1f1f1f] dark:shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.5)]'>
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

      <div
        className={cn(
          'hidden md:flex md:flex-col md:shrink-0 md:fixed md:top-0 md:right-0 md:h-svh md:z-40 bg-sidebar text-sidebar-foreground border-l border-sidebar-border transition-[width] duration-200 ease-out overflow-hidden shadow-xl',
          sidebarOpen && effectiveContact
            ? 'md:w-[340px] lg:w-[360px]'
            : 'md:w-0 lg:w-0'
        )}
        aria-hidden={!sidebarOpen || !effectiveContact}
      >
        <div className='flex-1 overflow-auto'>
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

      {/* Dialogs */}
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
