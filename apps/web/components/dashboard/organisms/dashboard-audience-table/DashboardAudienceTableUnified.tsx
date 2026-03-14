'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Users } from 'lucide-react';
import * as React from 'react';
import { memo, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/components/dashboard/atoms/DashboardHeaderActionGroup';
import { AudienceMobileCard } from '@/components/dashboard/audience/table/atoms/AudienceMobileCard';
import { AnalyticsSidebar } from '@/components/dashboard/organisms/AnalyticsSidebar';
import { useAudiencePanel } from '@/components/dashboard/organisms/AudiencePanelContext';
import { AudienceMemberSidebar } from '@/components/dashboard/organisms/audience-member-sidebar';
import { EmptyState } from '@/components/organisms/EmptyState';
import {
  type ContextMenuItemType,
  convertToCommonDropdownItems,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { queryKeys } from '@/lib/queries/keys';
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
  QuickActionsCell,
  renderLastActionCell,
  renderLtvCell,
  renderPlatformsCell,
  renderUserCell,
  SelectCell,
  TouringCityCell,
} from './utils/column-renderers';

const memberColumnHelper = createColumnHelper<AudienceMember>();

function getSrDescription(isEmpty: boolean): string {
  if (isEmpty) {
    return 'Track visitors and grow your fan base';
  }
  return 'Every visitor, anonymous or identified, lives in this table.';
}

/**
 * Compact Linear-style column definitions for members mode.
 *
 * Layout: Select | User (primary label) | LTV ($) | Platforms (icon cluster) | Touring badge | Last Action | Quick Actions
 *
 * Headers are hidden via `hideHeader` on the table. Icon columns use fixed widths
 * so layout never shifts when content appears/disappears.
 */
const MEMBER_COLUMNS: ColumnDef<AudienceMember, any>[] = [
  memberColumnHelper.display({
    id: 'select',
    header: () => null,
    cell: SelectCell,
    size: 40,
  }),
  memberColumnHelper.accessor('displayName', {
    id: 'user',
    header: 'User',
    cell: renderUserCell,
    size: 260,
  }),
  memberColumnHelper.accessor('tipAmountTotalCents', {
    id: 'ltv',
    header: 'LTV',
    cell: renderLtvCell,
    size: 40,
    meta: {
      className: 'px-2',
    },
  }),
  memberColumnHelper.display({
    id: 'platforms',
    header: 'Platforms',
    cell: renderPlatformsCell,
    size: 44,
  }),
  memberColumnHelper.display({
    id: 'touringCity',
    header: 'Touring',
    cell: TouringCityCell,
    size: 110,
  }),
  memberColumnHelper.accessor('latestActions', {
    id: 'lastAction',
    header: 'Last Action',
    cell: renderLastActionCell,
    size: 160,
  }),
  memberColumnHelper.display({
    id: 'quickActions',
    header: '',
    cell: QuickActionsCell,
    size: 80,
  }),
];

/** Estimated height of each mobile card row in px. */
const MOBILE_CARD_HEIGHT = 72;

/** Virtualized mobile card list to avoid rendering all rows at once. */
const MobileCardList = memo(function MobileCardList({
  rows,
  mode,
  selectedMemberId,
  onTap,
}: {
  rows: AudienceMember[];
  mode: 'members';
  selectedMemberId: string | null;
  onTap: (member: AudienceMember) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => MOBILE_CARD_HEIGHT,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className='md:hidden h-full overflow-auto'>
      <div
        className='relative w-full'
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const member = rows[virtualRow.index];
          return (
            <div
              key={member.id}
              className='absolute left-0 w-full border-b border-subtle/60'
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <AudienceMobileCard
                member={member}
                mode='members'
                isSelected={selectedMemberId === member.id}
                onTap={onTap}
              />
            </div>
          );
        })}
      </div>
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
          'h-8',
          isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
        );
      },
      [selectedMember]
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
          <div
            className='flex h-full min-h-0 flex-col overflow-hidden'
            data-testid='dashboard-audience-table'
          >
            <h1 className='sr-only'>
              {rows.length === 0 ? 'Audience' : 'Audience CRM'}
            </h1>
            <p className='sr-only'>{getSrDescription(rows.length === 0)}</p>

            {/* Subheader with filter dropdown and export */}
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

            <div className='flex-1 min-h-0 flex flex-col bg-(--linear-app-content-surface)'>
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
                      mode='members'
                      selectedMemberId={selectedMember?.id ?? null}
                      onTap={setSelectedMember}
                    />

                    {/* Desktop table */}
                    <div className='hidden md:block h-full'>
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
                        hideHeader={true}
                        minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
                        className='text-[13px]'
                        getRowClassName={getRowClassName}
                        onRowClick={row => handleViewProfile(row)}
                        onFocusedRowChange={handleFocusedRowChange}
                        getContextMenuItems={getContextMenuItems}
                        hasNextPage={hasNextPage}
                        isFetchingNextPage={isFetchingNextPage}
                        onLoadMore={onLoadMore}
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
          </div>
        </AudienceTableVolatileProvider>
      </AudienceTableStableProvider>
    );
  }
);
