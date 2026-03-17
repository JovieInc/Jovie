'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { useRowSelection } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import {
  getNextSort,
  type SortableColumnKey,
} from '@/features/admin/creator-sort-config';
import { useAdminTableKeyboardNavigation } from '@/features/admin/table/useAdminTableKeyboardNavigation';
import { useAdminTablePaginationLinks } from '@/features/admin/table/useAdminTablePaginationLinks';
import { useCreatorActions } from '@/features/admin/useCreatorActions';
import { useCreatorVerification } from '@/features/admin/useCreatorVerification';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAvatarUploadMutation } from '@/lib/queries';
import type { Contact } from '@/types';
import type { AdminCreatorProfilesWithSidebarProps } from './types';
import { useContactHydration } from './useContactHydration';
import { useIngestRefresh } from './useIngestRefresh';

export function useAdminCreatorProfiles({
  profiles: initialProfiles,
  page,
  pageSize,
  total,
  search,
  sort,
  basePath = APP_ROUTES.ADMIN_CREATORS,
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

  const { mutateAsync: uploadAvatar } = useAvatarUploadMutation();
  const handleAvatarUpload = useCallback(
    async (file: File, contact: Contact): Promise<string> => {
      return uploadAvatar({ file, profileId: contact.id });
    },
    [uploadAvatar]
  );

  const handleRowClick = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSidebarOpen(true);
      setDraftContact(null);
    },
    [setDraftContact]
  );

  // Contact hydration now happens automatically via TanStack Query
  // when selectedId changes and sidebarOpen is true (enabled prop)

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
    refetchSocialLinks,
    handleContactChange,
    ingestRefreshStatuses,
    refreshIngest,
    handleAvatarUpload,
    handleRowClick,
    handleKeyDown,
    handleSidebarClose,
  };
}
