'use client';

import dynamic from 'next/dynamic';
import { CreatorProfileTableRow } from '@/components/admin/CreatorProfileTableRow';
import { AdminCreatorsFooter } from '@/components/admin/table/AdminCreatorsFooter';
import { AdminCreatorsTableHeader } from '@/components/admin/table/AdminCreatorsTableHeader';
import { AdminCreatorsToolbar } from '@/components/admin/table/AdminCreatorsToolbar';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import type { AdminCreatorProfilesWithSidebarProps } from './types';
import { useAdminCreatorProfiles } from './useAdminCreatorProfiles';
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
    import('@/components/organisms/ContactSidebar').then(mod => ({
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
  const {
    router,
    showToast,
    profilesWithActions,
    verificationStatuses,
    toggleVerification,
    toggleFeatured,
    toggleMarketing,
    deleteCreatorOrUser,
    selectedId,
    openMenuProfileId,
    setOpenMenuProfileId,
    sidebarOpen,
    isMobile,
    deleteDialogOpen,
    setDeleteDialogOpen,
    profileToDelete,
    setProfileToDelete,
    inviteDialogOpen,
    setInviteDialogOpen,
    profileToInvite,
    setProfileToInvite,
    totalPages,
    canPrev,
    canNext,
    from,
    to,
    prevHref,
    nextHref,
    clearHref,
    handleSortChange,
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    effectiveContact,
    hydrateContactSocialLinks,
    handleContactChange,
    ingestRefreshStatuses,
    refreshIngest,
    handleAvatarUpload,
    handleRowClick,
    handleKeyDown,
    handleSidebarClose,
  } = useAdminCreatorProfiles({
    profiles: initialProfiles,
    page,
    pageSize,
    total,
    search,
    sort,
    basePath,
  });

  return (
    <div className='flex h-full min-h-0 flex-col md:flex-row md:items-stretch'>
      <div className='flex-1 min-h-0 overflow-hidden'>
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
                <col className='w-[160px]' />
                <col className='w-[160px]' />
                <col className='w-[140px]' />
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
      <SendInviteDialog
        profile={profileToInvite}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSuccess={() => {
          setProfileToInvite(null);
          showToast({
            type: 'success',
            message: 'Invite created successfully',
          });
        }}
      />
    </div>
  );
}
