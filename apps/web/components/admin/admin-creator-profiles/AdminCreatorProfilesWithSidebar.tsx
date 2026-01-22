'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { CreatorProfileTableRow } from '@/components/admin/CreatorProfileTableRow';
import {
  getNextSort,
  type SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { AdminCreatorsFooter } from '@/components/admin/table/AdminCreatorsFooter';
import { AdminCreatorsTableHeader } from '@/components/admin/table/AdminCreatorsTableHeader';
import { AdminCreatorsToolbar } from '@/components/admin/table/AdminCreatorsToolbar';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { useAdminTableKeyboardNavigation } from '@/components/admin/table/useAdminTableKeyboardNavigation';
import { useAdminTablePaginationLinks } from '@/components/admin/table/useAdminTablePaginationLinks';
import { useCreatorActions } from '@/components/admin/useCreatorActions';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { useRowSelection } from '@/components/organisms/table';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { AdminCreatorProfilesWithSidebarProps } from './types';
import { useAvatarUpload } from './useAvatarUpload';
import { useContactHydration } from './useContactHydration';
import { useContactSave } from './useContactSave';
import { useIngestRefresh } from './useIngestRefresh';

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
  const notifications = useNotifications();
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

  const isMobile = useMediaQuery('(max-width: 767px)');
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
    buildHref,
  } = useAdminTablePaginationLinks({
    basePath,
    page,
    pageSize,
    search,
    sort,
    total,
  });

  const handleSortChange = useCallback(
    (column: SortableColumnKey) => {
      router.push(buildHref({ page: 1, sort: getNextSort(sort, column) }));
    },
    [buildHref, router, sort]
  );

  const filteredProfiles = profilesWithActions;

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

  const {
    setDraftContact,
    effectiveContact,
    refetchSocialLinks,
    handleContactChange,
  } = useContactHydration({
    profiles: filteredProfiles,
    selectedId,
    enabled: sidebarOpen,
  });

  const { ingestRefreshStatuses, refreshIngest } = useIngestRefresh({
    selectedId,
    onRefreshComplete: refetchSocialLinks,
  });

  const { handleAvatarUpload } = useAvatarUpload();

  const { isSaving, saveContact } = useContactSave({
    onSaveSuccess: updatedContact => {
      setDraftContact(updatedContact);
    },
  });

  const handleRowClick = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSidebarOpen(true);
      setDraftContact(null);
    },
    [setDraftContact]
  );

  // Social links are fetched automatically via TanStack Query
  // in useContactHydration when enabled && selectedId are truthy

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

  return (
    <div className='flex h-full min-h-0 flex-col md:flex-row md:items-stretch'>
      <div className='flex-1 min-h-0 overflow-hidden'>
        <QueryErrorBoundary fallback={TableErrorFallback}>
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
              <table className='w-full table-fixed border-separate border-spacing-0 text-[13px]'>
                <colgroup>
                  <col className='w-14' />
                  <col className='w-[320px]' />
                  <col className='w-[160px]' />
                  <col className='w-[200px]' />
                </colgroup>
                <AdminCreatorsTableHeader
                  sort={sort}
                  headerCheckboxState={headerCheckboxState}
                  selectedCount={selectedCount}
                  headerElevated={headerElevated}
                  stickyTopPx={stickyTopPx}
                  onToggleSelectAll={toggleSelectAll}
                  onSortChange={handleSortChange}
                />
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
                            const errorSuffix = result.error
                              ? `: ${result.error}`
                              : '';
                            notifications.error(
                              `Failed to update verification status${errorSuffix}`
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
                            const errorSuffix = result.error
                              ? `: ${result.error}`
                              : '';
                            notifications.error(
                              `Failed to update featured status${errorSuffix}`
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
                            const errorSuffix = result.error
                              ? `: ${result.error}`
                              : '';
                            notifications.error(
                              `Failed to update marketing preferences${errorSuffix}`
                            );
                          }
                        }}
                        onSendInvite={
                          !profile.isClaimed && profile.claimToken
                            ? () => {
                                setProfileToInvite(profile);
                                setInviteDialogOpen(true);
                              }
                            : undefined
                        }
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
        </QueryErrorBoundary>
      </div>
      <RightDrawer
        isOpen={sidebarOpen && Boolean(effectiveContact)}
        width={SIDEBAR_WIDTH}
        ariaLabel='Contact details'
        className='hidden md:flex bg-surface-2 border-subtle'
      >
        <div className='flex-1 min-h-0 overflow-auto'>
          <Suspense
            fallback={
              <div className='space-y-4 p-4'>
                <div className='h-10 w-32 animate-pulse rounded-md bg-surface-1' />
                <div className='h-20 w-full animate-pulse rounded-md bg-surface-1' />
                <div className='h-40 w-full animate-pulse rounded-md bg-surface-1' />
              </div>
            }
          >
            <ContactSidebar
              contact={effectiveContact}
              mode={mode}
              isOpen={sidebarOpen && Boolean(effectiveContact)}
              onClose={handleSidebarClose}
              onRefresh={() => {
                router.refresh();
                refetchSocialLinks();
              }}
              onContactChange={handleContactChange}
              onSave={saveContact}
              isSaving={isSaving}
              onAvatarUpload={handleAvatarUpload}
            />
          </Suspense>
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
          notifications.success('Invite created successfully');
        }}
      />
    </div>
  );
}
