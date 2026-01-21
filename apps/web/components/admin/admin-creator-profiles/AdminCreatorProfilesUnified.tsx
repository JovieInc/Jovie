'use client';

import type { RowSelectionState } from '@tanstack/react-table';
import { UserCircle2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { AdminCreatorsFooter } from '@/components/admin/table/AdminCreatorsFooter';
import { AdminCreatorsToolbar } from '@/components/admin/table/AdminCreatorsToolbar';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { useAdminTableKeyboardNavigation } from '@/components/admin/table/useAdminTableKeyboardNavigation';
import { useAdminTablePaginationLinks } from '@/components/admin/table/useAdminTablePaginationLinks';
import { useCreatorActions } from '@/components/admin/useCreatorActions';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { UnifiedTable, useRowSelection } from '@/components/organisms/table';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { SIDEBAR_WIDTH, TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';
import { useBulkActions, useContextMenuItems, useDialogState } from './hooks';
import type { AdminCreatorProfilesWithSidebarProps } from './types';
import { useAvatarUpload } from './useAvatarUpload';
import { useContactHydration } from './useContactHydration';
import { useContactSave } from './useContactSave';
import { useIngestRefresh } from './useIngestRefresh';
import { createCreatorProfileColumns } from './utils/column-definitions';

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
  const { profiles, toggleVerification } =
    useCreatorVerification(initialProfiles);

  const {
    profiles: profilesWithActions,
    toggleFeatured,
    toggleMarketing,
    deleteCreatorOrUser,
  } = useCreatorActions(profiles);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    deleteDialogOpen,
    profileToDelete,
    inviteDialogOpen,
    profileToInvite,
    openDeleteDialog,
    closeDeleteDialog,
    openInviteDialog,
    closeInviteDialog,
    clearDeleteProfile,
    clearInviteProfile,
  } = useDialogState();

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

  const { getContextMenuItems } = useContextMenuItems({
    ingestRefreshStatuses,
    refreshIngest,
    toggleVerification,
    toggleFeatured,
    toggleMarketing,
    openDeleteDialog,
    openInviteDialog,
  });

  const {
    handleBulkVerify,
    handleBulkUnverify,
    handleBulkFeature,
    handleBulkDelete,
    handleClearSelection,
  } = useBulkActions({
    profiles: profilesWithActions,
    selectedIds,
    toggleVerification,
    toggleFeatured,
    deleteCreatorOrUser,
    toggleSelectAll,
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
      setSelectedId(profilesWithActions[0]?.id);
      setDraftContact(null);
    }
  }, [sidebarOpen, selectedId, profilesWithActions, setDraftContact]);

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

      // Toggle all if all selected or all deselected
      if (
        newSelectedIds.size === filteredProfiles.length ||
        (newSelectedIds.size === 0 && selectedIds.size > 0)
      ) {
        toggleSelectAll();
      }
    },
    [rowSelection, filteredProfiles.length, selectedIds.size, toggleSelectAll]
  );

  // Define columns using factory function
  const columns = useMemo(
    () =>
      createCreatorProfileColumns({
        page,
        pageSize,
        selectedIds,
        headerCheckboxState,
        toggleSelectAll,
        toggleSelect,
        getContextMenuItems,
      }),
    [
      page,
      pageSize,
      selectedIds,
      headerCheckboxState,
      toggleSelectAll,
      toggleSelect,
      getContextMenuItems,
    ]
  );

  // Get row className based on selection state - uses unified tokens
  const getRowClassName = useCallback(
    (profile: AdminCreatorProfileRow) => {
      const isChecked = selectedIds.has(profile.id);
      const isSelected = profile.id === selectedId;

      return cn(
        'group',
        isChecked
          ? 'bg-surface-2/70 hover:bg-surface-2'
          : isSelected
            ? 'bg-surface-2'
            : 'hover:bg-surface-2/50'
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
          {() => (
            <UnifiedTable
              data={filteredProfiles}
              columns={columns}
              isLoading={false}
              emptyState={
                <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
                  <UserCircle2 className='h-6 w-6' />
                  <div>
                    <div className='font-medium'>No creator profiles found</div>
                    <div className='text-xs'>
                      Creator profiles will appear here once created.
                    </div>
                  </div>
                </div>
              }
              rowSelection={rowSelection}
              onRowSelectionChange={handleRowSelectionChange}
              getRowId={row => row.id}
              getRowClassName={getRowClassName}
              onRowClick={handleRowClick}
              getContextMenuItems={getContextMenuItems}
              enableVirtualization={true}
              minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
              className='text-[13px]'
            />
          )}
        </AdminTableShell>
      </div>
      <RightDrawer
        isOpen={sidebarOpen && Boolean(effectiveContact)}
        width={SIDEBAR_WIDTH}
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
        onOpenChange={closeDeleteDialog}
        onConfirm={async () => {
          if (!profileToDelete) return { success: false };
          const result = await deleteCreatorOrUser(profileToDelete.id);
          if (result.success) {
            clearDeleteProfile();
          }
          return result;
        }}
      />
      <SendInviteDialog
        profile={profileToInvite}
        open={inviteDialogOpen}
        onOpenChange={closeInviteDialog}
        onSuccess={() => {
          clearInviteProfile();
        }}
      />
    </div>
  );
}
