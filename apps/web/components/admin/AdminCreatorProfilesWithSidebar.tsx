'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { CreatorProfileTableRow } from '@/components/admin/CreatorProfileTableRow';
import {
  getNextSort,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { AdminCreatorsFooter } from '@/components/admin/table/AdminCreatorsFooter';
import { AdminCreatorsTableHeader } from '@/components/admin/table/AdminCreatorsTableHeader';
import { AdminCreatorsToolbar } from '@/components/admin/table/AdminCreatorsToolbar';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
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
import type { Contact, ContactSidebarMode } from '@/types';

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
  const setTableMeta = React.useMemo(
    () => tableMetaCtx?.setTableMeta ?? (() => {}),
    [tableMetaCtx]
  );

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] =
    useState<AdminCreatorProfileRow | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [profileToInvite, setProfileToInvite] =
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
