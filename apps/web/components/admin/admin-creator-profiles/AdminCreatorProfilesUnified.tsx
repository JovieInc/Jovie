'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table';
import { CheckCircle, Copy, Star, Trash2, XCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { AdminCreatorsFooter } from '@/components/admin/table/AdminCreatorsFooter';
import { AdminCreatorsToolbar } from '@/components/admin/table/AdminCreatorsToolbar';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { AvatarCell } from '@/components/admin/table/atoms/AvatarCell';
import { DateCell } from '@/components/admin/table/atoms/DateCell';
import { TableCheckboxCell } from '@/components/admin/table/atoms/TableCheckboxCell';
import { SocialLinksCell } from '@/components/admin/table/molecules/SocialLinksCell';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
} from '@/components/admin/table/molecules/TableContextMenu';
import { UnifiedTable } from '@/components/admin/table/organisms/UnifiedTable';
import { useAdminTableKeyboardNavigation } from '@/components/admin/table/useAdminTableKeyboardNavigation';
import { useAdminTablePaginationLinks } from '@/components/admin/table/useAdminTablePaginationLinks';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { useCreatorActions } from '@/components/admin/useCreatorActions';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';
import type { AdminCreatorProfilesWithSidebarProps } from './types';
import { useAvatarUpload } from './useAvatarUpload';
import { useContactHydration } from './useContactHydration';
import { useContactSave } from './useContactSave';
import { useIngestRefresh } from './useIngestRefresh';
import { CONTACT_PANEL_WIDTH } from './utils';

const DeleteCreatorDialog = dynamic(
  () =>
    import('@/components/admin/DeleteCreatorDialog').then(mod => ({
      default: mod.DeleteCreatorDialog,
    })),
  { ssr: false }
);

const SendInviteDialog = dynamic(
  () =>
    import('@/components/admin/SendInviteDialog').then(mod => ({
      default: mod.SendInviteDialog,
    })),
  { ssr: false }
);

const ContactSidebar = dynamic(
  () =>
    import('@/components/organisms/contact-sidebar').then(mod => ({
      default: mod.ContactSidebar,
    })),
  {
    loading: () => <div className='h-full w-full animate-pulse bg-surface-1' />,
    ssr: false,
  }
);

function useOptionalTableMeta() {
  try {
    return useTableMeta();
  } catch {
    return null;
  }
}

const columnHelper = createColumnHelper<AdminCreatorProfileRow>();

export function AdminCreatorProfilesUnified({
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
    statuses: _verificationStatuses,
    toggleVerification,
  } = useCreatorVerification(initialProfiles);

  const {
    profiles: profilesWithActions,
    toggleFeatured,
    toggleMarketing,
    deleteCreatorOrUser,
  } = useCreatorActions(profiles);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [_openMenuProfileId, _setOpenMenuProfileId] = useState<string | null>(
    null
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const tableMetaCtx = useOptionalTableMeta();
  const setTableMeta = React.useMemo(
    () => tableMetaCtx?.setTableMeta ?? (() => {}),
    [tableMetaCtx]
  );

  const _isMobile = useMediaQuery('(max-width: 767px)');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<
    (typeof profilesWithActions)[number] | null
  >(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [profileToInvite, setProfileToInvite] = useState<
    (typeof profilesWithActions)[number] | null
  >(null);

  const {
    totalPages,
    canPrev,
    canNext,
    from,
    to,
    prevHref,
    nextHref,
    clearHref,
  } = useAdminTablePaginationLinks({
    basePath,
    page,
    pageSize,
    search,
    sort,
    total,
  });

  const filteredProfiles = profilesWithActions;

  const rowIds = useMemo(
    () => filteredProfiles.map(profile => profile.id),
    [filteredProfiles]
  );

  const { selectedIds, headerCheckboxState, toggleSelect, toggleSelectAll } =
    useRowSelection(rowIds);

  const {
    setDraftContact,
    effectiveContact,
    hydrateContactSocialLinks,
    handleContactChange,
  } = useContactHydration({
    profiles: filteredProfiles,
    selectedId,
  });

  const { ingestRefreshStatuses, refreshIngest } = useIngestRefresh({
    selectedId,
    onRefreshComplete: hydrateContactSocialLinks,
  });

  const { handleAvatarUpload } = useAvatarUpload();

  const { isSaving, saveContact } = useContactSave({
    onSaveSuccess: updatedContact => {
      setDraftContact(updatedContact);
    },
  });

  const handleRowClick = useCallback(
    (profile: AdminCreatorProfileRow) => {
      setSelectedId(profile.id);
      setSidebarOpen(true);
      setDraftContact(null);
    },
    [setDraftContact]
  );

  React.useEffect(() => {
    if (!sidebarOpen || !selectedId) return;
    void hydrateContactSocialLinks(selectedId);
  }, [hydrateContactSocialLinks, selectedId, sidebarOpen]);

  const { handleKeyDown } = useAdminTableKeyboardNavigation({
    items: filteredProfiles,
    selectedId,
    onSelect: setSelectedId,
    onToggleSidebar: () => setSidebarOpen(open => !open),
    onCloseSidebar: () => setSidebarOpen(false),
    isSidebarOpen: sidebarOpen,
    getId: profile => profile.id,
  });

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  React.useEffect(() => {
    if (sidebarOpen && !selectedId && profilesWithActions.length > 0) {
      setSelectedId(profilesWithActions[0]!.id);
      setDraftContact(null);
    }
  }, [sidebarOpen, selectedId, profilesWithActions, setDraftContact]);

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
    setDraftContact,
  ]);

  // Row selection state for TanStack Table
  const rowSelection = useMemo(() => {
    return Object.fromEntries(Array.from(selectedIds).map(id => [id, true]));
  }, [selectedIds]);

  const handleRowSelectionChange = useCallback(
    (
      updaterOrValue:
        | RowSelectionState
        | ((old: RowSelectionState) => RowSelectionState)
    ) => {
      const newSelection =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(rowSelection)
          : updaterOrValue;

      // Update our custom row selection state
      const newSelectedIds = new Set(
        Object.entries(newSelection)
          .filter(([, selected]) => selected)
          .map(([id]) => id)
      );

      // Toggle all if different count
      if (newSelectedIds.size === filteredProfiles.length) {
        toggleSelectAll();
      } else if (newSelectedIds.size === 0 && selectedIds.size > 0) {
        toggleSelectAll();
      }
    },
    [rowSelection, filteredProfiles.length, selectedIds.size, toggleSelectAll]
  );

  // Context menu items for right-click AND actions button
  const getContextMenuItems = useCallback(
    (profile: AdminCreatorProfileRow): ContextMenuItemType[] => {
      const items: ContextMenuItemType[] = [];

      // Refresh ingest (if available)
      const refreshIngestStatus = ingestRefreshStatuses[profile.id] ?? 'idle';
      if (refreshIngestStatus !== undefined) {
        items.push({
          id: 'refresh-ingest',
          label: 'Refresh ingest',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => refreshIngest(profile.id),
          disabled: refreshIngestStatus === 'loading',
        });
        items.push({ type: 'separator' as const });
      }

      // Verify/Unverify
      items.push(
        profile.isVerified
          ? {
              id: 'unverify',
              label: 'Unverify creator',
              icon: <XCircle className='h-3.5 w-3.5' />,
              onClick: async () => {
                const result = await toggleVerification(profile.id, false);
                if (!result.success) {
                  toast.error('Failed to unverify creator');
                } else {
                  toast.success('Creator unverified');
                }
              },
            }
          : {
              id: 'verify',
              label: 'Verify creator',
              icon: <CheckCircle className='h-3.5 w-3.5' />,
              onClick: async () => {
                const result = await toggleVerification(profile.id, true);
                if (!result.success) {
                  toast.error('Failed to verify creator');
                } else {
                  toast.success('Creator verified');
                }
              },
            }
      );

      // Feature/Unfeature
      items.push({
        id: 'feature',
        label: profile.isFeatured ? 'Unfeature' : 'Feature',
        icon: <Star className='h-3.5 w-3.5' />,
        onClick: async () => {
          const result = await toggleFeatured(profile.id, !profile.isFeatured);
          if (!result.success) {
            toast.error(
              `Failed to ${profile.isFeatured ? 'unfeature' : 'feature'} creator`
            );
          } else {
            toast.success(
              `Creator ${profile.isFeatured ? 'unfeatured' : 'featured'}`
            );
          }
        },
      });

      items.push({ type: 'separator' as const });

      // Marketing emails toggle
      items.push({
        id: 'marketing',
        label: profile.marketingOptOut
          ? 'Enable marketing emails'
          : 'Disable marketing emails',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: async () => {
          const result = await toggleMarketing(
            profile.id,
            !profile.marketingOptOut
          );
          if (!result.success) {
            toast.error('Failed to toggle marketing');
          }
        },
      });

      // View profile
      items.push({
        id: 'view-profile',
        label: 'View profile',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => {
          window.open(`/${profile.username}`, '_blank');
        },
      });

      // Copy claim link & Send invite (if unclaimed and has claim token)
      if (!profile.isClaimed && profile.claimToken) {
        items.push({ type: 'separator' as const });
        items.push({
          id: 'copy-claim-link',
          label: 'Copy claim link',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => {
            const baseUrl =
              typeof window !== 'undefined'
                ? window.location.origin
                : 'https://jovie.app';
            const claimUrl = `${baseUrl}/claim/${profile.claimToken}`;
            navigator.clipboard.writeText(claimUrl);
            toast.success('Claim link copied to clipboard');
          },
        });

        items.push({
          id: 'send-invite',
          label: 'Send invite',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => {
            setProfileToInvite(profile);
            setInviteDialogOpen(true);
          },
        });
      }

      items.push({ type: 'separator' as const });

      // Delete
      items.push({
        id: 'delete',
        label: profile.isClaimed ? 'Delete user' : 'Delete creator',
        icon: <Trash2 className='h-3.5 w-3.5' />,
        destructive: true,
        onClick: () => {
          setProfileToDelete(profile);
          setDeleteDialogOpen(true);
        },
      });

      return items;
    },
    [
      ingestRefreshStatuses,
      refreshIngest,
      toggleVerification,
      toggleFeatured,
      toggleMarketing,
      setProfileToInvite,
      setProfileToDelete,
    ]
  );

  // Define columns using TanStack Table
  const columns = useMemo<ColumnDef<AdminCreatorProfileRow, any>[]>(
    () => [
      // Checkbox column
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <TableCheckboxCell
            table={table}
            headerCheckboxState={headerCheckboxState}
            onToggleSelectAll={toggleSelectAll}
          />
        ),
        cell: ({ row }) => {
          const profile = row.original;
          const isChecked = selectedIds.has(profile.id);
          const rowNumber = (page - 1) * pageSize + row.index + 1;

          return (
            <TableCheckboxCell
              row={row}
              rowNumber={rowNumber}
              isChecked={isChecked}
              onToggleSelect={() => toggleSelect(profile.id)}
            />
          );
        },
        size: 56, // 14 * 4 = 56px (w-14)
      }),

      // Avatar + Name column
      columnHelper.accessor('username', {
        id: 'avatar',
        header: 'Creator',
        cell: ({ row }) => {
          const profile = row.original;
          const displayName =
            'displayName' in profile ? (profile.displayName ?? null) : null;

          return (
            <AvatarCell
              profileId={profile.id}
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              displayName={displayName}
              verified={profile.isVerified}
              isFeatured={profile.isFeatured}
            />
          );
        },
        size: 280,
      }),

      // Social Media Links column
      columnHelper.accessor('socialLinks', {
        id: 'social',
        header: 'Social',
        cell: ({ row }) => {
          const profile = row.original;
          return (
            <SocialLinksCell
              links={profile.socialLinks ?? null}
              filterPlatformType='social_media'
              maxLinks={3}
            />
          );
        },
        size: 220,
      }),

      // Music Streaming Links column
      columnHelper.accessor('socialLinks', {
        id: 'music',
        header: 'Music',
        cell: ({ row }) => {
          const profile = row.original;
          return (
            <SocialLinksCell
              links={profile.socialLinks ?? null}
              filterPlatformType='music_streaming'
              maxLinks={3}
            />
          );
        },
        size: 220,
      }),

      // Created Date column
      columnHelper.accessor('createdAt', {
        id: 'created',
        header: 'Created',
        cell: ({ row }) => {
          const profile = row.original;
          return <DateCell date={profile.createdAt} />;
        },
        size: 180,
      }),

      // Actions column - shows ellipsis menu with SAME items as right-click context menu
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const profile = row.original;
          const contextMenuItems = getContextMenuItems(profile);
          const actionMenuItems = convertContextMenuItems(contextMenuItems);

          return (
            <div className='flex items-center justify-end'>
              <TableActionMenu items={actionMenuItems} align='end' />
            </div>
          );
        },
        size: 48,
      }),
    ],
    [
      headerCheckboxState,
      toggleSelectAll,
      selectedIds,
      page,
      pageSize,
      toggleSelect,
      getContextMenuItems,
    ]
  );

  // Bulk action handlers
  const handleBulkVerify = useCallback(async () => {
    const selectedProfiles = profilesWithActions.filter(p =>
      selectedIds.has(p.id)
    );
    const results = await Promise.all(
      selectedProfiles.map(p => toggleVerification(p.id, true))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to verify ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Verified ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
    }
  }, [profilesWithActions, selectedIds, toggleVerification]);

  const handleBulkUnverify = useCallback(async () => {
    const selectedProfiles = profilesWithActions.filter(p =>
      selectedIds.has(p.id)
    );
    const results = await Promise.all(
      selectedProfiles.map(p => toggleVerification(p.id, false))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to unverify ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Unverified ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
    }
  }, [profilesWithActions, selectedIds, toggleVerification]);

  const handleBulkFeature = useCallback(async () => {
    const selectedProfiles = profilesWithActions.filter(p =>
      selectedIds.has(p.id)
    );
    const results = await Promise.all(
      selectedProfiles.map(p => toggleFeatured(p.id, true))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to feature ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Featured ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
    }
  }, [profilesWithActions, selectedIds, toggleFeatured]);

  const handleBulkDelete = useCallback(async () => {
    const selectedProfiles = profilesWithActions.filter(p =>
      selectedIds.has(p.id)
    );
    if (selectedProfiles.length === 0) return;

    const confirmed = confirm(
      `Are you sure you want to delete ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}? This action cannot be undone.`
    );
    if (!confirmed) return;

    const results = await Promise.all(
      selectedProfiles.map(p => deleteCreatorOrUser(p.id))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to delete ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Deleted ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
      // Clear selection after successful deletion
      toggleSelectAll();
      router.refresh();
    }
  }, [
    profilesWithActions,
    selectedIds,
    deleteCreatorOrUser,
    toggleSelectAll,
    router,
  ]);

  const handleClearSelection = useCallback(() => {
    toggleSelectAll();
  }, [toggleSelectAll]);

  // Get row className based on selection state
  const getRowClassName = useCallback(
    (profile: AdminCreatorProfileRow) => {
      const isChecked = selectedIds.has(profile.id);
      const isSelected = profile.id === selectedId;

      return cn(
        'group',
        isChecked
          ? 'bg-[#ebebf6] dark:bg-[#1b1d38]'
          : isSelected
            ? 'bg-base dark:bg-surface-2'
            : 'hover:bg-base dark:hover:bg-surface-2'
      );
    },
    [selectedIds, selectedId]
  );

  return (
    <div className='flex h-full min-h-0 flex-row items-stretch overflow-hidden'>
      <div className='flex-1 min-h-0 overflow-hidden min-w-0'>
        <AdminTableShell
          scrollContainerProps={{
            tabIndex: 0,
            onKeyDown: handleKeyDown,
          }}
          toolbar={
            <AdminCreatorsToolbar
              basePath={basePath}
              search={search}
              sort={sort}
              pageSize={pageSize}
              from={from}
              to={to}
              total={total}
              clearHref={clearHref}
              profiles={profilesWithActions}
              selectedIds={selectedIds}
              onBulkVerify={handleBulkVerify}
              onBulkUnverify={handleBulkUnverify}
              onBulkFeature={handleBulkFeature}
              onBulkDelete={handleBulkDelete}
              onClearSelection={handleClearSelection}
            />
          }
          footer={
            <AdminCreatorsFooter
              page={page}
              totalPages={totalPages}
              from={from}
              to={to}
              total={total}
              pageSize={pageSize}
              canPrev={canPrev}
              canNext={canNext}
              prevHref={prevHref}
              nextHref={nextHref}
            />
          }
        >
          {({ headerElevated, stickyTopPx }) => (
            <UnifiedTable
              data={filteredProfiles}
              columns={columns}
              isLoading={false}
              emptyState={
                <div className='px-4 py-10 text-center text-sm text-secondary-token'>
                  No creator profiles found.
                </div>
              }
              rowSelection={rowSelection}
              onRowSelectionChange={handleRowSelectionChange}
              getRowId={row => row.id}
              getRowClassName={getRowClassName}
              onRowClick={handleRowClick}
              getContextMenuItems={getContextMenuItems}
              enableVirtualization={true}
              rowHeight={52}
              minWidth='960px'
              className='text-[13px]'
            />
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
            onSave={saveContact}
            isSaving={isSaving}
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
      <SendInviteDialog
        profile={profileToInvite}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSuccess={() => {
          setProfileToInvite(null);
        }}
      />
    </div>
  );
}
