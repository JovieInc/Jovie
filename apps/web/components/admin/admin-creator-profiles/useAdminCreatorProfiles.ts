'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import {
  getNextSort,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { useAdminTableKeyboardNavigation } from '@/components/admin/table/useAdminTableKeyboardNavigation';
import { useAdminTablePaginationLinks } from '@/components/admin/table/useAdminTablePaginationLinks';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { useCreatorActions } from '@/components/admin/useCreatorActions';
import { useCreatorVerification } from '@/components/admin/useCreatorVerification';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { AdminCreatorProfilesWithSidebarProps } from './types';
import { useAvatarUpload } from './useAvatarUpload';
import { useContactHydration } from './useContactHydration';
import { useIngestRefresh } from './useIngestRefresh';
import { CONTACT_PANEL_WIDTH } from './utils';

function useOptionalTableMeta() {
  try {
    return useTableMeta();
  } catch {
    return null;
  }
}

export function useAdminCreatorProfiles({
  profiles: initialProfiles,
  page,
  pageSize,
  total,
  search,
  sort,
  basePath = '/app/admin/creators',
}: Omit<AdminCreatorProfilesWithSidebarProps, 'mode'>) {
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
  const [openMenuProfileId, setOpenMenuProfileId] = useState<string | null>(
    null
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const tableMetaCtx = useOptionalTableMeta();
  const setTableMeta = React.useMemo(
    () => tableMetaCtx?.setTableMeta ?? (() => {}),
    [tableMetaCtx]
  );

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

  const handleRowClick = useCallback(
    (id: string) => {
      setSelectedId(id);
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

  return {
    router,
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
  };
}
