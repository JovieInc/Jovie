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
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { AdminCreatorFilters } from '@/components/admin/AdminCreatorFilters';
import { CreatorProfileTableRow } from '@/components/admin/CreatorProfileTableRow';
import {
  getNextSort,
  getSortDirection,
  SORTABLE_COLUMNS,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { IngestProfileDropdown } from '@/components/admin/IngestProfileDropdown';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { SortableHeaderButton } from '@/components/admin/table/SortableHeaderButton';
import { useAdminTableKeyboardNavigation } from '@/components/admin/table/useAdminTableKeyboardNavigation';
import { useAdminTablePaginationLinks } from '@/components/admin/table/useAdminTablePaginationLinks';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { useCreatorActions } from '@/components/admin/useCreatorActions';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import { useToast } from '@/components/molecules/ToastContainer';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { useMediaQuery } from '@/hooks/useMediaQuery';

import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';
import type { Contact, ContactSidebarMode } from '@/types';

const DeleteCreatorDialog = dynamic(
  () =>
    import('@/components/admin/DeleteCreatorDialog').then(mod => ({
      default: mod.DeleteCreatorDialog,
    })),
  { ssr: false }
);

const ContactSidebar = dynamic(
  () =>
    import('@/components/organisms/ContactSidebar').then(mod => ({
      default: mod.ContactSidebar,
    })),
  {
    loading: () => <div className='h-full w-full animate-pulse bg-surface-1' />,
    ssr: false,
  }
);

const CONTACT_PANEL_WIDTH = 320;

function useOptionalTableMeta() {
  try {
    return useTableMeta();
  } catch {
    return null;
  }
}

export interface AdminCreatorProfilesWithSidebarProps {
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

type AdminCreatorSocialLinksResponse =
  | {
      success: true;
      links: Array<{
        id: string;
        label: string;
        url: string;
        platformType: string;
      }>;
    }
  | {
      success: false;
      error: string;
    };

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
  const { showToast } = useToast();
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
  const [openMenuProfileId, setOpenMenuProfileId] = useState<string | null>(
    null
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draftContact, setDraftContact] = useState<Contact | null>(null);

  const [ingestRefreshStatuses, setIngestRefreshStatuses] = useState<
    Record<string, 'idle' | 'loading' | 'success' | 'error'>
  >({});
  const tableMetaCtx = useOptionalTableMeta();
  const [searchTerm, setSearchTerm] = useState(search);
  const setTableMeta = React.useMemo(
    () => tableMetaCtx?.setTableMeta ?? (() => {}),
    [tableMetaCtx]
  );

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] =
    useState<AdminCreatorProfileRow | null>(null);

  const {
    totalPages,
    canPrev,
    canNext,
    from,
    to,
    prevHref,
    nextHref,
    clearHref,
    buildHref,
  } = useAdminTablePaginationLinks<AdminCreatorProfilesSort>({
    basePath,
    page,
    pageSize,
    search,
    sort,
    total,
  });

  const createSortHref = (column: SortableColumnKey) =>
    buildHref({ page: 1, sort: getNextSort(sort, column) });

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

  const rowIds = useMemo(
    () => filteredProfiles.map(profile => profile.id),
    [filteredProfiles]
  );

  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
  } = useRowSelection(rowIds);

  const selectedProfile = useMemo(
    () => filteredProfiles.find(p => p.id === selectedId) ?? null,
    [filteredProfiles, selectedId]
  );

  const hydrateContactSocialLinks = useCallback(
    async (profileId: string): Promise<void> => {
      const contactBase = mapProfileToContact(
        filteredProfiles.find(p => p.id === profileId) ?? null
      );
      if (!contactBase) return;

      try {
        const response = await fetch(
          `/api/admin/creator-social-links?profileId=${encodeURIComponent(profileId)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        const payload = (await response
          .json()
          .catch(() => null)) as AdminCreatorSocialLinksResponse | null;

        if (!response.ok || !payload || !payload.success) {
          setDraftContact(contactBase);
          return;
        }

        setDraftContact({
          ...contactBase,
          socialLinks: payload.links.map(link => ({
            id: link.id,
            label: link.label,
            url: link.url,
            platformType: link.platformType,
          })),
        });
      } catch {
        setDraftContact(contactBase);
      }
    },
    [filteredProfiles]
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

  React.useEffect(() => {
    if (!sidebarOpen || !selectedId) return;
    void hydrateContactSocialLinks(selectedId);
  }, [hydrateContactSocialLinks, selectedId, sidebarOpen]);

  const refreshIngest = useCallback(
    async (profileId: string): Promise<void> => {
      setIngestRefreshStatuses(prev => ({ ...prev, [profileId]: 'loading' }));
      try {
        const response = await fetch('/app/admin/creators/bulk-refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ profileIds: [profileId] }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          queuedCount?: number;
          error?: string;
        };

        if (!response.ok || !payload.success) {
          throw new Error(payload.error ?? 'Failed to queue ingestion');
        }

        setIngestRefreshStatuses(prev => ({ ...prev, [profileId]: 'success' }));
        showToast({
          type: 'success',
          message: 'Ingestion refresh queued',
        });
        router.refresh();

        if (selectedId === profileId) {
          void hydrateContactSocialLinks(profileId);
        }
      } catch (error) {
        setIngestRefreshStatuses(prev => ({ ...prev, [profileId]: 'error' }));
        showToast({
          type: 'error',
          message: error instanceof Error ? error.message : 'Refresh failed',
        });
      } finally {
        window.setTimeout(() => {
          setIngestRefreshStatuses(prev => ({ ...prev, [profileId]: 'idle' }));
        }, 2200);
      }
    },
    [hydrateContactSocialLinks, router, selectedId, showToast]
  );

  const { handleKeyDown } = useAdminTableKeyboardNavigation({
    items: filteredProfiles,
    selectedId,
    onSelect: setSelectedId,
    onToggleSidebar: () => setSidebarOpen(open => !open),
    onCloseSidebar: () => setSidebarOpen(false),
    isSidebarOpen: sidebarOpen,
    getId: profile => profile.id,
  });

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
      <div className='flex-1 min-h-0 overflow-hidden'>
        <AdminTableShell
          scrollContainerProps={{
            tabIndex: 0,
            onKeyDown: handleKeyDown,
          }}
          toolbar={
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
          }
          footer={
            <div className='flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs text-secondary-token'>
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
          }
        >
          {({ headerElevated, stickyTopPx }) => (
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
                      'sticky z-20 w-14 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                      headerElevated &&
                        'shadow-sm shadow-black/10 dark:shadow-black/40'
                    )}
                    style={{ top: stickyTopPx }}
                  >
                    <Checkbox
                      aria-label='Select all creators'
                      checked={headerCheckboxState}
                      onCheckedChange={toggleSelectAll}
                      className='border-sidebar-border data-[state=checked]:bg-sidebar-accent data-[state=checked]:text-sidebar-accent-foreground'
                    />
                  </th>
                  <th
                    className={cn(
                      'sticky z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                      headerElevated &&
                        'shadow-sm shadow-black/10 dark:shadow-black/40'
                    )}
                    style={{ top: stickyTopPx }}
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
                          <DropdownMenuItem
                            disabled
                            className='text-destructive'
                          >
                            Delete selected (coming soon)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                  <th
                    className={cn(
                      'sticky z-20 px-4 py-3 text-left cursor-pointer select-none border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                      headerElevated &&
                        'shadow-sm shadow-black/10 dark:shadow-black/40'
                    )}
                    style={{ top: stickyTopPx }}
                  >
                    <SortableHeaderButton
                      label={SORTABLE_COLUMNS.created.label}
                      direction={getSortDirection(sort, 'created')}
                      onClick={() => router.push(createSortHref('created'))}
                    />
                  </th>
                  <th
                    className={cn(
                      'sticky z-20 px-4 py-3 text-left cursor-pointer select-none border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                      headerElevated &&
                        'shadow-sm shadow-black/10 dark:shadow-black/40'
                    )}
                    style={{ top: stickyTopPx }}
                  >
                    <SortableHeaderButton
                      label={SORTABLE_COLUMNS.claimed.label}
                      direction={getSortDirection(sort, 'claimed')}
                      onClick={() => router.push(createSortHref('claimed'))}
                    />
                  </th>
                  <th
                    className={cn(
                      'sticky z-20 px-4 py-3 text-left cursor-pointer select-none border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                      headerElevated &&
                        'shadow-sm shadow-black/10 dark:shadow-black/40'
                    )}
                    style={{ top: stickyTopPx }}
                  >
                    <SortableHeaderButton
                      label={SORTABLE_COLUMNS.verified.label}
                      direction={getSortDirection(sort, 'verified')}
                      onClick={() => router.push(createSortHref('verified'))}
                    />
                  </th>
                  <th
                    className={cn(
                      'sticky z-20 px-4 py-3 text-right border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
                      headerElevated &&
                        'shadow-sm shadow-black/10 dark:shadow-black/40'
                    )}
                    style={{ top: stickyTopPx }}
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
                  profilesWithActions.map((profile, index) => (
                    <CreatorProfileTableRow
                      key={profile.id}
                      profile={profile}
                      rowNumber={(page - 1) * pageSize + index + 1}
                      isSelected={profile.id === selectedId}
                      isChecked={selectedIds.has(profile.id)}
                      isMobile={isMobile}
                      verificationStatus={
                        verificationStatuses[profile.id] ?? 'idle'
                      }
                      refreshIngestStatus={
                        ingestRefreshStatuses[profile.id] ?? 'idle'
                      }
                      isMenuOpen={openMenuProfileId === profile.id}
                      onRowClick={handleRowClick}
                      onContextMenu={setOpenMenuProfileId}
                      onToggleSelect={toggleSelect}
                      onMenuOpenChange={open =>
                        setOpenMenuProfileId(open ? profile.id : null)
                      }
                      onRefreshIngest={() => refreshIngest(profile.id)}
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
                  ))
                )}
              </tbody>
            </table>
          )}
        </AdminTableShell>
      </div>
      <RightDrawer
        isOpen={sidebarOpen && Boolean(effectiveContact)}
        width={CONTACT_PANEL_WIDTH}
        ariaLabel='Contact details'
        className='hidden md:flex bg-surface-0 border-subtle'
      >
        <div className='flex-1 min-h-0 overflow-auto'>
          <ContactSidebar
            contact={effectiveContact}
            mode={mode}
            isOpen={sidebarOpen && Boolean(effectiveContact)}
            onClose={handleSidebarClose}
            onRefresh={() => {
              router.refresh();
              if (selectedId) {
                void hydrateContactSocialLinks(selectedId);
              }
            }}
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
