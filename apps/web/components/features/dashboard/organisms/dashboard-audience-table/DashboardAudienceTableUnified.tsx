'use client';

import { Button } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  createColumnHelper,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Users } from 'lucide-react';
import * as React from 'react';
import { memo, useMemo } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { EmptyState } from '@/components/organisms/EmptyState';
import {
  AudienceMobileCard,
  type ContextMenuItemType,
  convertToCommonDropdownItems,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/features/dashboard/atoms/DashboardHeaderActionGroup';
import { AnalyticsSidebar } from '@/features/dashboard/organisms/AnalyticsSidebar';
import { useAudiencePanel } from '@/features/dashboard/organisms/AudiencePanelContext';
import { AudienceMemberSidebar } from '@/features/dashboard/organisms/audience-member-sidebar';
import { DashboardWorkspacePanel } from '@/features/dashboard/organisms/DashboardWorkspacePanel';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { queryKeys } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  buildTouringCityMap,
  matchTouringCity,
} from '@/lib/utils/touring-city-match';
import type { AudienceMember } from '@/types';
import {
  AudienceTableStableProvider,
  AudienceTableVolatileProvider,
} from './AudienceTableContext';
import { AudienceTableSubheader } from './AudienceTableSubheader';
import { buildAudienceActions } from './audience-actions';
import type { DashboardAudienceTableProps } from './types';
import { useDashboardAudienceTable } from './useDashboardAudienceTable';
import { copyTextToClipboard, downloadVCard } from './utils';
import {
  renderEngagementCell,
  renderLastSeenActionCell,
  renderLocationCellFromRow,
  renderLtvCell,
  SelectCell,
  UserCellWithTouring,
} from './utils/column-renderers';

const memberColumnHelper = createColumnHelper<AudienceMember>();

function getSrDescription(isEmpty: boolean): string {
  if (isEmpty) {
    return 'Track visitors and grow your fan base';
  }
  return 'Every visitor, anonymous or identified, lives in this table.';
}

/** Map column ID → server sort field for URL state bridge.
 * Note: Value sorts by engagement score (server proxy for LTV — no computed LTV column exists). */
const COLUMN_SORT_MAP: Record<string, string> = {
  engagement: 'visits',
  value: 'engagement',
  lastSeen: 'lastSeen',
};

/** Reverse map: server sort field → column ID.
 * Includes legacy mappings (intent, type) so bookmarked URLs degrade gracefully. */
const SORT_FIELD_TO_COLUMN: Record<string, string> = {
  visits: 'engagement',
  intent: 'engagement',
  type: 'engagement',
  engagement: 'value',
  lastSeen: 'lastSeen',
};

/**
 * Consolidated column layout — fewer, denser columns.
 *
 * Layout: Select | User (flex, with type dot) | Location | Engagement | Value | Last Seen
 */
const MEMBER_COLUMNS: ColumnDef<AudienceMember, any>[] = [
  memberColumnHelper.display({
    id: 'select',
    header: () => null,
    cell: SelectCell,
    size: 40,
    enableSorting: false,
  }),
  memberColumnHelper.accessor('displayName', {
    id: 'user',
    header: 'User',
    cell: UserCellWithTouring,
    size: 9999,
    minSize: 220,
    enableSorting: false,
  }),
  memberColumnHelper.accessor('locationLabel', {
    id: 'location',
    header: 'Location',
    cell: renderLocationCellFromRow,
    size: 140,
    enableSorting: false,
  }),
  memberColumnHelper.accessor('visits', {
    id: 'engagement',
    header: 'Engagement',
    cell: renderEngagementCell,
    size: 100,
    enableSorting: true,
  }),
  memberColumnHelper.accessor('tipAmountTotalCents', {
    id: 'value',
    header: 'Value',
    cell: renderLtvCell,
    size: 90,
    enableSorting: true,
  }),
  memberColumnHelper.accessor('latestActions', {
    id: 'lastSeen',
    header: 'Last Seen',
    cell: renderLastSeenActionCell,
    size: 180,
    enableSorting: true,
  }),
];

type AudienceTableLayout = 'narrow' | 'medium' | 'wide';

function getAudienceTableLayout(width: number): AudienceTableLayout {
  if (width < 720) {
    return 'narrow';
  }
  if (width < 960) {
    return 'medium';
  }
  return 'wide';
}

/** Responsive column visibility by viewport width.
 *
 * Progressive hiding is based on the measured desktop table container width,
 * not the window width, so the layout adapts correctly with the shell sidebar
 * and right drawer both open and closed.
 */
function getColumnVisibility(width: number): VisibilityState {
  switch (getAudienceTableLayout(width)) {
    case 'narrow':
      return {
        location: false,
        value: false,
        engagement: false,
        lastSeen: false,
      };
    case 'medium':
      return { location: false, value: false };
    case 'wide':
    default:
      return {};
  }
}

function getTableMinWidth(width: number): number {
  switch (getAudienceTableLayout(width)) {
    case 'narrow':
      return 480;
    case 'medium':
      return 640;
    case 'wide':
    default:
      return TABLE_MIN_WIDTHS.SMALL;
  }
}

/** Mobile card list — plain rendering (no virtualization needed for paginated data). */
const MobileCardList = memo(function MobileCardList({
  rows,
  selectedMemberId,
  onTap,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  rows: AudienceMember[];
  selectedMemberId: string | null;
  onTap: (member: AudienceMember) => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className='md:hidden h-full overflow-auto'>
      {rows.map(member => (
        <div
          key={member.id}
          className='border-b border-(--linear-app-frame-seam)'
        >
          <AudienceMobileCard
            member={member}
            mode='members'
            isSelected={selectedMemberId === member.id}
            onTap={onTap}
          />
        </div>
      ))}
      {hasNextPage ? (
        <div className='p-3'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='w-full'
            loading={isFetchingNextPage}
            onClick={() => onLoadMore?.()}
          >
            Load more members
          </Button>
        </div>
      ) : null}
    </div>
  );
});

export const DashboardAudienceTableUnified = memo(
  function DashboardAudienceTableUnified({
    mode,
    view,
    rows,
    total,
    sort,
    direction,
    onSortChange,
    onViewChange,
    onFiltersChange,
    profileUrl,
    profileId,
    subscriberCount,
    totalAudienceCount,
    filters,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    tourDates,
  }: DashboardAudienceTableProps) {
    const queryClient = useQueryClient();
    const {
      openMenuRowId,
      setOpenMenuRowId,
      selectedMember,
      setSelectedMember,
      copiedProfileLink,
      selectedIds,
      selectedCount,
      toggleSelect,
      handleCopyProfileLink,
    } = useDashboardAudienceTable({
      mode,
      rows,
      total,
      sort,
      direction,
      profileUrl,
    });

    const [desktopTableNode, setDesktopTableNode] =
      React.useState<HTMLDivElement | null>(null);
    const [desktopTableWidth, setDesktopTableWidth] = React.useState<number>(
      TABLE_MIN_WIDTHS.SMALL
    );

    React.useEffect(() => {
      const node = desktopTableNode;
      if (!node) {
        return;
      }

      const updateWidth = (nextWidth?: number) => {
        const measuredWidth = nextWidth ?? node.getBoundingClientRect().width;

        setDesktopTableWidth(currentWidth =>
          currentWidth === measuredWidth ? currentWidth : measuredWidth
        );
      };

      updateWidth();

      if (typeof ResizeObserver !== 'function') {
        const handleResize = () => updateWidth();
        globalThis.addEventListener('resize', handleResize);
        return () => {
          globalThis.removeEventListener('resize', handleResize);
        };
      }

      const resizeObserver = new ResizeObserver(entries => {
        updateWidth(entries[0]?.contentRect.width);
      });

      resizeObserver.observe(node);

      return () => {
        resizeObserver.disconnect();
      };
    }, [desktopTableNode]);

    const columnVisibility = React.useMemo(
      () => getColumnVisibility(desktopTableWidth),
      [desktopTableWidth]
    );

    const hiddenMetadataColumns = React.useMemo(
      () => ({
        location: columnVisibility.location === false,
        engagement: columnVisibility.engagement === false,
        lastSeen: columnVisibility.lastSeen === false,
      }),
      [columnVisibility]
    );

    const hasMetadataSubtitle =
      hiddenMetadataColumns.location ||
      hiddenMetadataColumns.engagement ||
      hiddenMetadataColumns.lastSeen;

    const tableMinWidth = React.useMemo(
      () => `${getTableMinWidth(desktopTableWidth)}px`,
      [desktopTableWidth]
    );

    // Bridge URL sort state ↔ TanStack SortingState
    const sorting: SortingState = useMemo(() => {
      const columnId = SORT_FIELD_TO_COLUMN[sort];
      if (!columnId) return [];
      return [{ id: columnId, desc: direction === 'desc' }];
    }, [sort, direction]);

    const handleSortingChange: OnChangeFn<SortingState> = React.useCallback(
      updater => {
        const next = typeof updater === 'function' ? updater(sorting) : updater;
        if (next.length > 0) {
          const sortField = COLUMN_SORT_MAP[next[0].id];
          if (sortField) onSortChange(sortField);
        }
      },
      [sorting, onSortChange]
    );

    const handleRemoveMember = React.useCallback(
      async (member: AudienceMember) => {
        if (!profileId) {
          toast.error('Unable to block member — profile not loaded');
          return;
        }
        try {
          const res = await fetch('/api/dashboard/audience/members', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId: member.id, profileId }),
          });
          if (!res.ok) {
            throw new Error('Failed to remove member');
          }
          toast.success('Member removed');
          if (selectedMember?.id === member.id) {
            setSelectedMember(null);
          }
          queryClient.invalidateQueries({
            queryKey: queryKeys.audience.all,
          });
        } catch {
          toast.error('Failed to remove member');
        }
      },
      [profileId, selectedMember, setSelectedMember, queryClient]
    );

    // Quick action: export member as vCard
    const handleExportMember = React.useCallback((member: AudienceMember) => {
      downloadVCard(member);
      toast.success('Contact exported as vCard');
    }, []);

    // Quick action: block/remove member
    const handleBlockMember = React.useCallback(
      (member: AudienceMember) => {
        handleRemoveMember(member).catch(() => {});
      },
      [handleRemoveMember]
    );

    // Quick action: view member profile (opens contact sidebar)
    const {
      mode: panelMode,
      toggle,
      open: openPanel,
      close: closePanel,
    } = useAudiencePanel();
    const { setHeaderActions } = useSetHeaderActions();

    // Auto-select first row when contact panel opens with no selection
    React.useEffect(() => {
      if (panelMode === 'contact' && !selectedMember && rows.length > 0) {
        setSelectedMember(rows[0]);
      }
    }, [panelMode, selectedMember, rows, setSelectedMember]);

    const handleViewProfile = React.useCallback(
      (member: AudienceMember) => {
        setSelectedMember(member);
        openPanel('contact');
      },
      [setSelectedMember, openPanel]
    );

    // Quick action: send notification (copies contact info for now)
    const handleSendNotification = React.useCallback(
      (member: AudienceMember) => {
        const contact = member.email ?? member.phone;
        if (!contact) {
          return;
        }

        void copyTextToClipboard(contact).then(success => {
          if (!success) {
            toast.error('Unable to copy contact details');
            return;
          }

          toast.success('Contact copied and ready for notification');
        });
      },
      []
    );

    // Build touring city map for O(1) lookup per member
    const touringCityMap = useMemo(
      () => buildTouringCityMap(tourDates ?? []),
      [tourDates]
    );

    const getTouringCity = React.useCallback(
      (member: AudienceMember) => matchTouringCity(member, touringCityMap),
      [touringCityMap]
    );

    // Context menu items for right-click — uses canonical builder
    const getContextMenuItems = React.useCallback(
      (member: AudienceMember): ContextMenuItemType[] => {
        return buildAudienceActions(member, {
          onViewDetails: setSelectedMember,
          onCopyEmail: m => {
            if (m.email) {
              void copyTextToClipboard(m.email).then(success => {
                if (success) {
                  toast.success('Email copied to clipboard');
                  return;
                }
                toast.error('Unable to copy email');
              });
            }
          },
          onCopyPhone: m => {
            if (m.phone) {
              void copyTextToClipboard(m.phone).then(success => {
                if (success) {
                  toast.success('Phone number copied to clipboard');
                  return;
                }
                toast.error('Unable to copy phone number');
              });
            }
          },
          onSendNotification: handleSendNotification,
          onExportVCard: m => {
            downloadVCard(m);
            toast.success('Contact exported as vCard');
          },
          onBlock: m => {
            handleRemoveMember(m).catch(() => {});
          },
          canBlock: Boolean(profileId),
        });
      },
      [setSelectedMember, profileId, handleRemoveMember, handleSendNotification]
    );

    const columns = MEMBER_COLUMNS;

    // Stable context: callbacks that rarely change — consumers won't re-render on selection/menu toggle
    const stableContextValue = useMemo(
      () => ({
        toggleSelect,
        setOpenMenuRowId,
        getContextMenuItems,
        onExportMember: handleExportMember,
        onBlockMember: handleBlockMember,
        onViewProfile: handleViewProfile,
        onSendNotification: handleSendNotification,
        getTouringCity,
        hiddenMetadataColumns,
      }),
      [
        toggleSelect,
        setOpenMenuRowId,
        getContextMenuItems,
        handleExportMember,
        handleBlockMember,
        handleViewProfile,
        handleSendNotification,
        getTouringCity,
        hiddenMetadataColumns,
      ]
    );

    // Volatile context: frequently-changing state — only SelectCell and LastSeenCell subscribe
    const volatileContextValue = useMemo(
      () => ({
        selectedIds,
        openMenuRowId,
      }),
      [selectedIds, openMenuRowId]
    );

    const emptyStateHeading = 'Grow Your Audience';
    const emptyStateDescription =
      'Share your profile link on social media to invite visitors. Most creators get their first audience member by sharing on X or IG bio.';
    const emptyStateIcon = <Users className='h-6 w-6' aria-hidden='true' />;
    const emptyStatePrimaryAction = profileUrl
      ? {
          label: copiedProfileLink ? 'Link copied' : 'Copy profile link',
          onClick: () => {
            void handleCopyProfileLink();
          },
        }
      : {
          label: 'Open profile settings',
          href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
        };
    const emptyStateSecondaryAction = {
      label: 'Learn about audience',
      href: '/support',
    };

    // Row className — compact Linear-style rows with subtle hover
    const getRowClassName = React.useCallback(
      (row: AudienceMember) => {
        const isSelected = selectedMember?.id === row.id;
        return cn(
          hasMetadataSubtitle ? 'h-12' : 'h-10',
          isSelected
            ? 'bg-(--linear-row-selected)'
            : 'bg-transparent hover:bg-(--linear-row-hover)'
        );
      },
      [hasMetadataSubtitle, selectedMember]
    );

    // Issue 4: Arrow keys update sidebar when panel is open
    const handleFocusedRowChange = React.useCallback(
      (index: number) => {
        if (panelMode === 'contact' && rows[index]) {
          setSelectedMember(rows[index]);
        }
      },
      [panelMode, rows, setSelectedMember]
    );

    // Close handler for the right panel
    const handleClosePanel = React.useCallback(() => {
      closePanel();
      setSelectedMember(null);
    }, [closePanel, setSelectedMember]);

    // Register unified right panel — shows contact or analytics based on mode
    const sidebarPanel = useMemo(() => {
      if (panelMode === 'contact') {
        return (
          <AudienceMemberSidebar
            member={selectedMember}
            isOpen
            onClose={handleClosePanel}
            contextMenuItems={
              selectedMember
                ? convertToCommonDropdownItems(
                    getContextMenuItems(selectedMember)
                  )
                : undefined
            }
          />
        );
      }
      if (panelMode === 'analytics') {
        return <AnalyticsSidebar isOpen onClose={handleClosePanel} />;
      }
      // Panel closed — render closed drawer to animate out
      return (
        <AudienceMemberSidebar
          member={null}
          isOpen={false}
          onClose={handleClosePanel}
        />
      );
    }, [panelMode, selectedMember, getContextMenuItems, handleClosePanel]);

    useRegisterRightPanel(sidebarPanel);

    const headerActions = useMemo(
      () => (
        <DashboardHeaderActionGroup
          trailing={
            <DashboardHeaderActionButton
              ariaLabel={
                panelMode === 'contact'
                  ? 'Close contact details'
                  : 'Open contact details'
              }
              pressed={panelMode === 'contact'}
              onClick={() => toggle('contact')}
              icon={<Icon name='User' className='h-4 w-4' strokeWidth={1.9} />}
              iconOnly
              tooltipLabel='Contact details'
            />
          }
        >
          <DashboardHeaderActionButton
            ariaLabel={
              panelMode === 'analytics'
                ? 'Close analytics panel'
                : 'Open analytics panel'
            }
            pressed={panelMode === 'analytics'}
            onClick={() => toggle('analytics')}
            icon={
              <Icon name='ChartBar' className='h-4 w-4' strokeWidth={1.9} />
            }
            iconOnly
            tooltipLabel='Analytics'
          />
        </DashboardHeaderActionGroup>
      ),
      [panelMode, toggle]
    );

    React.useEffect(() => {
      setHeaderActions(headerActions);

      return () => {
        setHeaderActions(null);
      };
    }, [headerActions, setHeaderActions]);

    return (
      <AudienceTableStableProvider value={stableContextValue}>
        <AudienceTableVolatileProvider value={volatileContextValue}>
          <DashboardWorkspacePanel
            className='overflow-hidden'
            data-testid='dashboard-audience-table'
            toolbar={
              <AudienceTableSubheader
                view={view}
                onViewChange={onViewChange}
                filters={filters}
                onFiltersChange={onFiltersChange}
                rows={rows}
                selectedIds={selectedIds}
                subscriberCount={subscriberCount}
                totalAudienceCount={totalAudienceCount}
                total={total}
              />
            }
          >
            <h1 className='sr-only'>
              {rows.length === 0 ? 'Audience' : 'Audience CRM'}
            </h1>
            <p className='sr-only'>{getSrDescription(rows.length === 0)}</p>

            <div className='flex-1 min-h-0 flex flex-col'>
              {/* Scrollable content area */}
              <div className='flex-1 min-h-0 overflow-auto'>
                {rows.length === 0 ? (
                  <EmptyState
                    icon={emptyStateIcon}
                    heading={emptyStateHeading}
                    description={emptyStateDescription}
                    action={emptyStatePrimaryAction}
                    secondaryAction={emptyStateSecondaryAction}
                  />
                ) : (
                  <>
                    {/* Mobile card list (virtualized) */}
                    <MobileCardList
                      rows={rows}
                      selectedMemberId={selectedMember?.id ?? null}
                      onTap={setSelectedMember}
                      hasNextPage={hasNextPage}
                      isFetchingNextPage={isFetchingNextPage}
                      onLoadMore={onLoadMore}
                    />

                    {/* Desktop table */}
                    <div
                      ref={setDesktopTableNode}
                      className='max-md:hidden h-full'
                    >
                      <UnifiedTable
                        data={rows}
                        columns={columns}
                        isLoading={false}
                        emptyState={
                          <EmptyState
                            icon={emptyStateIcon}
                            heading={emptyStateHeading}
                            description={emptyStateDescription}
                            action={emptyStatePrimaryAction}
                            secondaryAction={emptyStateSecondaryAction}
                          />
                        }
                        getRowId={row => row.id}
                        enableVirtualization={true}
                        enableKeyboardNavigation={true}
                        sorting={sorting}
                        onSortingChange={handleSortingChange}
                        columnVisibility={columnVisibility}
                        minWidth={tableMinWidth}
                        className='text-[13px]'
                        getRowClassName={getRowClassName}
                        onRowClick={row => handleViewProfile(row)}
                        onFocusedRowChange={handleFocusedRowChange}
                        getContextMenuItems={getContextMenuItems}
                        hasNextPage={hasNextPage}
                        isFetchingNextPage={isFetchingNextPage}
                        onLoadMore={onLoadMore}
                        containerClassName='h-full px-2.5 pb-2.5 pt-0.5 md:px-3 md:pb-3 md:pt-1'
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className='sr-only' aria-live='polite' aria-atomic='true'>
              {rows.length > 0 && `Showing ${rows.length} members`}
              {selectedCount > 0 &&
                `. ${selectedCount} ${selectedCount === 1 ? 'row' : 'rows'} selected`}
            </div>
          </DashboardWorkspacePanel>
        </AudienceTableVolatileProvider>
      </AudienceTableStableProvider>
    );
  }
);
