'use client';

import { UserCircle2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { CreatorProfileTableRow } from '@/components/admin/CreatorProfileTableRow';
import {
  getNextSort,
  type SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { AdminCreatorsTableHeader } from '@/components/admin/table/AdminCreatorsTableHeader';
import { AdminCreatorsToolbar } from '@/components/admin/table/AdminCreatorsToolbar';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { useAdminTableKeyboardNavigation } from '@/components/admin/table/useAdminTableKeyboardNavigation';
import { useCreatorActions } from '@/components/admin/useCreatorActions';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import { DrawerLoadingSkeleton } from '@/components/molecules/drawer';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { TableEmptyState, useRowSelection } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import { useAvatarUploadMutation } from '@/lib/queries/useAvatarUploadMutation';
import type { Contact } from '@/types';
import type { AdminCreatorProfilesWithSidebarProps } from './types';
import { useContactHydration } from './useContactHydration';
import { useContactSave } from './useContactSave';
import { useDebouncedContactSave } from './useDebouncedContactSave';
import { useIngestRefresh } from './useIngestRefresh';

interface RowActionHandlers {
  onMenuOpenChange: (open: boolean) => void;
  onRefreshIngest: () => void;
  onToggleVerification: () => Promise<void>;
  onToggleFeatured: () => Promise<void>;
  onToggleMarketing: () => Promise<void>;
  onSendInvite?: () => void;
  onDelete: () => void;
}

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
    loading: () => (
      <DrawerLoadingSkeleton
        ariaLabel='Loading creator details'
        contentRows={5}
      />
    ),
    ssr: false,
  }
);

export function AdminCreatorProfilesWithSidebar({
  profiles: initialProfiles,
  pageSize,
  total,
  search,
  sort,
  mode = 'admin',
  basePath = APP_ROUTES.ADMIN_CREATORS,
}: Readonly<AdminCreatorProfilesWithSidebarProps>) {
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

  const handleSortChange = useCallback(
    (column: SortableColumnKey) => {
      const params = new URLSearchParams();
      params.set('sort', getNextSort(sort, column));
      if (search) {
        params.set('q', search);
      }
      params.set('pageSize', String(pageSize));
      router.push(`${basePath}?${params.toString()}`);
    },
    [basePath, pageSize, router, search, sort]
  );

  const filteredProfiles = profilesWithActions;
  const from = filteredProfiles.length > 0 ? 1 : 0;
  const to = filteredProfiles.length;

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

  const { mutateAsync: uploadAvatar } = useAvatarUploadMutation();
  const handleAvatarUpload = useCallback(
    async (file: File, contact: Contact): Promise<string> => {
      return uploadAvatar({ file, profileId: contact.id });
    },
    [uploadAvatar]
  );

  const { saveContact, isSaving } = useContactSave({
    onSaveSuccess: updatedContact => {
      setDraftContact(updatedContact);
    },
  });

  useDebouncedContactSave({
    effectiveContact,
    sidebarOpen,
    isSaving,
    saveContact,
  });

  const handleRowClick = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSidebarOpen(true);
      setDraftContact(null);
    },
    [setDraftContact]
  );

  // Extracted handlers to prevent creating new function instances on every render
  // These are used by CreatorProfileTableRow which is now memoized

  const handleMenuOpenChange = useCallback(
    (profileId: string, open: boolean) => {
      setOpenMenuProfileId(open ? profileId : null);
    },
    []
  );

  const handleRefreshIngest = useCallback(
    (profileId: string) => {
      refreshIngest(profileId);
    },
    [refreshIngest]
  );

  const handleToggleVerification = useCallback(
    async (profileId: string, currentIsVerified: boolean) => {
      const result = await toggleVerification(profileId, !currentIsVerified);
      if (!result.success) {
        console.error('Failed to toggle verification', result.error);
        const errorSuffix = result.error ? `: ${result.error}` : '';
        notifications.error(
          `Failed to update verification status${errorSuffix}`
        );
      }
    },
    [toggleVerification, notifications]
  );

  const handleToggleFeatured = useCallback(
    async (profileId: string, currentIsFeatured: boolean) => {
      const result = await toggleFeatured(profileId, !currentIsFeatured);
      if (!result.success) {
        console.error('Failed to toggle featured', result.error);
        const errorSuffix = result.error ? `: ${result.error}` : '';
        notifications.error(`Failed to update featured status${errorSuffix}`);
      }
    },
    [toggleFeatured, notifications]
  );

  const handleToggleMarketing = useCallback(
    async (profileId: string, currentMarketingOptOut: boolean) => {
      const result = await toggleMarketing(profileId, !currentMarketingOptOut);
      if (!result.success) {
        console.error('Failed to toggle marketing', result.error);
        const errorSuffix = result.error ? `: ${result.error}` : '';
        notifications.error(
          `Failed to update marketing preferences${errorSuffix}`
        );
      }
    },
    [toggleMarketing, notifications]
  );

  const handleSendInvite = useCallback(
    (profile: (typeof profilesWithActions)[number]) => {
      setProfileToInvite(profile);
      setInviteDialogOpen(true);
    },
    []
  );

  const handleDelete = useCallback(
    (profile: (typeof profilesWithActions)[number]) => {
      setProfileToDelete(profile);
      setDeleteDialogOpen(true);
    },
    []
  );

  // Social links are fetched automatically via TanStack Query
  // in useContactHydration when enabled && selectedId are truthy

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(open => !open);
  }, []);

  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const { setTableMeta } = useTableMeta();
  const filteredProfilesRef = React.useRef(filteredProfiles);
  filteredProfilesRef.current = filteredProfiles;

  React.useEffect(() => {
    const toggle = () => {
      if (sidebarOpen) {
        setSidebarOpen(false);
        return;
      }

      const nextProfile =
        filteredProfilesRef.current.find(
          profile => profile.id === selectedId
        ) ?? filteredProfilesRef.current[0];

      if (!nextProfile) return;

      setSelectedId(nextProfile.id);
      setSidebarOpen(true);
      setDraftContact(null);
    };

    setTableMeta({
      rowCount: filteredProfiles.length,
      toggle: filteredProfiles.length > 0 ? toggle : null,
      rightPanelWidth: sidebarOpen ? SIDEBAR_WIDTH : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTableMeta is a stable context setter
  }, [filteredProfiles.length, selectedId, setDraftContact, sidebarOpen]);

  const getProfileId = useCallback(
    (profile: (typeof filteredProfiles)[number]) => profile.id,
    []
  );

  const { handleKeyDown } = useAdminTableKeyboardNavigation({
    items: filteredProfiles,
    selectedId,
    onSelect: setSelectedId,
    onToggleSidebar: handleSidebarToggle,
    onCloseSidebar: handleSidebarClose,
    isSidebarOpen: sidebarOpen,
    getId: getProfileId,
  });

  const handleSidebarRefresh = useCallback(() => {
    router.refresh();
    refetchSocialLinks();
  }, [refetchSocialLinks, router]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!profileToDelete) return { success: false };
    const result = await deleteCreatorOrUser(profileToDelete.id);
    if (result.success) {
      setProfileToDelete(null);
    }
    return result;
  }, [deleteCreatorOrUser, profileToDelete]);

  const handleInviteSuccess = useCallback(() => {
    setProfileToInvite(null);
    notifications.success('Invite created successfully');
  }, [notifications]);

  const rowActionHandlers = useMemo(() => {
    const handlers = new Map<string, RowActionHandlers>();

    for (const profile of profilesWithActions) {
      handlers.set(profile.id, {
        onMenuOpenChange: open => handleMenuOpenChange(profile.id, open),
        onRefreshIngest: () => handleRefreshIngest(profile.id),
        onToggleVerification: () =>
          handleToggleVerification(profile.id, profile.isVerified),
        onToggleFeatured: () =>
          handleToggleFeatured(profile.id, profile.isFeatured),
        onToggleMarketing: () =>
          handleToggleMarketing(profile.id, profile.marketingOptOut),
        onSendInvite:
          !profile.isClaimed && profile.claimToken
            ? () => handleSendInvite(profile)
            : undefined,
        onDelete: () => handleDelete(profile),
      });
    }

    return handlers;
  }, [
    handleDelete,
    handleMenuOpenChange,
    handleRefreshIngest,
    handleSendInvite,
    handleToggleFeatured,
    handleToggleMarketing,
    handleToggleVerification,
    profilesWithActions,
  ]);

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
                from={from}
                to={to}
                total={total}
                profiles={profilesWithActions}
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
                    <TableEmptyState
                      colSpan={6}
                      icon={
                        <UserCircle2 className='h-6 w-6' aria-hidden='true' />
                      }
                      title='No creator profiles found'
                      description='Creator profiles will appear here once created.'
                      className='min-h-[220px] rounded-none border-x-0 border-b-0 shadow-none'
                    />
                  ) : (
                    profilesWithActions.map((profile, index) => {
                      const handlers = rowActionHandlers.get(profile.id);
                      if (!handlers) {
                        if (process.env.NODE_ENV === 'development') {
                          console.warn(
                            `Missing row action handlers for profile ${profile.id}`
                          );
                        }
                        return null;
                      }

                      return (
                        <CreatorProfileTableRow
                          key={profile.id}
                          profile={profile}
                          rowNumber={index + 1}
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
                          onMenuOpenChange={handlers.onMenuOpenChange}
                          onRefreshIngest={handlers.onRefreshIngest}
                          onToggleVerification={handlers.onToggleVerification}
                          onToggleFeatured={handlers.onToggleFeatured}
                          onToggleMarketing={handlers.onToggleMarketing}
                          onSendInvite={handlers.onSendInvite}
                          onDelete={handlers.onDelete}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </AdminTableShell>
        </QueryErrorBoundary>
      </div>
      {sidebarOpen && effectiveContact ? (
        <ContactSidebar
          contact={effectiveContact}
          mode={mode}
          isOpen={true}
          onClose={handleSidebarClose}
          onRefresh={handleSidebarRefresh}
          onContactChange={handleContactChange}
          onAvatarUpload={handleAvatarUpload}
        />
      ) : null}
      <DeleteCreatorDialog
        profile={profileToDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
      />
      <SendInviteDialog
        profile={profileToInvite}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSuccess={handleInviteSuccess}
      />
    </div>
  );
}
