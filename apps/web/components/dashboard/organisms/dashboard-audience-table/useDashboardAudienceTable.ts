'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import * as React from 'react';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { useRowSelection } from '@/components/organisms/table';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type {
  AudienceRow,
  BulkAction,
  DashboardAudienceTableProps,
} from './types';
import { copyTextToClipboard } from './utils';

export interface UseDashboardAudienceTableReturn {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  headerElevated: boolean;
  openMenuRowId: string | null;
  setOpenMenuRowId: (id: string | null) => void;
  selectedMember: AudienceRow | null;
  setSelectedMember: (member: AudienceRow | null) => void;
  copiedProfileLink: boolean;
  selectedIds: Set<string>;
  selectedCount: number;
  headerCheckboxState: boolean | 'indeterminate';
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  rowVirtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
  totalPages: number;
  bulkActions: BulkAction[];
  paginationLabel: () => string;
  handleCopyProfileLink: () => Promise<void>;
}

export function useDashboardAudienceTable({
  mode,
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  profileUrl,
}: Omit<
  DashboardAudienceTableProps,
  | 'onPageChange'
  | 'onPageSizeChange'
  | 'onSortChange'
  | 'onViewChange'
  | 'view'
  | 'subscriberCount'
>): UseDashboardAudienceTableReturn {
  const notifications = useNotifications();
  const { setTableMeta } = useTableMeta();
  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const [headerElevated, setHeaderElevated] = React.useState(false);
  const [openMenuRowId, setOpenMenuRowId] = React.useState<string | null>(null);
  const [selectedMember, setSelectedMember] =
    React.useState<AudienceRow | null>(null);
  const [copiedProfileLink, setCopiedProfileLink] = React.useState(false);
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const rowIds = React.useMemo(() => rows.map(row => row.id), [rows]);
  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useRowSelection(rowIds);

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

  React.useEffect(() => {
    clearSelection();
    setSelectedMember(null);
  }, [mode, page, pageSize, sort, direction, clearSelection]);

  React.useEffect(() => {
    const toggle = () => {
      if (rows.length === 0) return;
      setSelectedMember(current => (current ? null : (rows[0] ?? null)));
    };

    setTableMeta({
      rowCount: rows.length,
      toggle: rows.length > 0 ? toggle : null,
      rightPanelWidth: selectedMember ? SIDEBAR_WIDTH : 0,
    });

    return () => {
      setTableMeta({ rowCount: null, toggle: null, rightPanelWidth: null });
    };
  }, [rows, selectedMember, setTableMeta]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const selectedRows = React.useMemo(
    () => rows.filter(row => selectedIds.has(row.id)),
    [rows, selectedIds]
  );

  const copySelectedEmails = React.useCallback(async (): Promise<void> => {
    const emails = selectedRows
      .map(row => row.email)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      );

    if (emails.length === 0) {
      notifications.error('No emails available for selected rows');
      return;
    }

    const success = await copyTextToClipboard(emails.join('\n'));
    if (success) {
      notifications.success(`Copied ${emails.length} email(s)`);
      return;
    }

    notifications.error('Failed to copy emails');
  }, [selectedRows, notifications]);

  const copySelectedPhones = React.useCallback(async (): Promise<void> => {
    const phones = selectedRows
      .map(row => row.phone)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      );

    if (phones.length === 0) {
      notifications.error('No phone numbers available for selected rows');
      return;
    }

    const success = await copyTextToClipboard(phones.join('\n'));
    if (success) {
      notifications.success(`Copied ${phones.length} phone number(s)`);
      return;
    }

    notifications.error('Failed to copy phone numbers');
  }, [selectedRows, notifications]);

  const bulkActions: BulkAction[] = React.useMemo(
    () => [
      {
        label: 'Copy emails',
        onClick: () => {
          copySelectedEmails().catch(error => {
            console.error('[AudienceTable] Failed to copy emails:', error);
          });
        },
        disabled: selectedCount === 0,
      },
      {
        label: 'Copy phone numbers',
        onClick: () => {
          copySelectedPhones().catch(error => {
            console.error('[AudienceTable] Failed to copy phones:', error);
          });
        },
        disabled: selectedCount === 0,
      },
      {
        label: 'Clear selection',
        onClick: () => clearSelection(),
        disabled: selectedCount === 0,
      },
    ],
    [copySelectedEmails, copySelectedPhones, clearSelection, selectedCount]
  );

  const paginationLabel = React.useCallback(() => {
    if (total === 0) {
      return mode === 'members'
        ? 'No audience yet. Share your profile to invite visitors.'
        : 'No signups yet. Invite fans to tap the bell.';
    }

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `Showing ${start}–${end} of ${total} readers`;
  }, [mode, page, pageSize, total]);

  const handleCopyProfileLink = React.useCallback(async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      notifications.success('Profile link copied');
      setCopiedProfileLink(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedProfileLink(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy profile link', error);
      notifications.error('Unable to copy profile link');
    }
  }, [notifications, profileUrl]);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  return {
    tableContainerRef,
    headerElevated,
    openMenuRowId,
    setOpenMenuRowId,
    selectedMember,
    setSelectedMember,
    copiedProfileLink,
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    rowVirtualizer,
    totalPages,
    bulkActions,
    paginationLabel,
    handleCopyProfileLink,
  };
}
