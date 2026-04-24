'use client';

import { Button, CommonDropdown, type CommonDropdownItem } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  createColumnHelper,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Copy, Download, ExternalLink, Users } from 'lucide-react';
import * as React from 'react';
import { memo, useMemo } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { EmptyState } from '@/components/organisms/EmptyState';
import { PageShell } from '@/components/organisms/PageShell';
import {
  AudienceMobileCard,
  type ContextMenuItemType,
  convertToCommonDropdownItems,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import {
  DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS,
  DashboardHeaderActionButton,
} from '@/features/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/features/dashboard/atoms/DashboardHeaderActionGroup';
import {
  AnalyticsSidebar,
  StaticAnalyticsSidebar,
} from '@/features/dashboard/organisms/AnalyticsSidebar';
import { useAudiencePanel } from '@/features/dashboard/organisms/AudiencePanelContext';
import { AudienceMemberSidebar } from '@/features/dashboard/organisms/audience-member-sidebar';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { downloadBlob } from '@/lib/utils/download';
import {
  generateQrCodeDataUrl,
  qrCodeDataUrlToBlob,
} from '@/lib/utils/qr-code';
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
  renderSourceCell,
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

const PROFILE_QR_SOURCE_NAME = 'Profile QR';
const QR_DOWNLOAD_SIZE = 1024;

type SourceLinkPayload = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sourceType: string;
  readonly destinationKind: string;
  readonly shortUrl: string;
  readonly archivedAt?: string | null;
};

const profileQrSourceRequests = new Map<string, Promise<SourceLinkPayload>>();

function sanitizeQrFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

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
  memberColumnHelper.accessor('referrerHistory', {
    id: 'source',
    header: () => <span className='ml-auto'>Source</span>,
    cell: renderSourceCell,
    size: 48,
    enableSorting: false,
    meta: { className: 'text-right' },
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
    header: 'Last Activity',
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
        source: false,
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
    actionAdapter,
    analyticsMode = 'live',
    analyticsData,
    analyticsSidebarTestId,
    analyticsTabbedCardTestId,
    testId = 'dashboard-audience-table',
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
        source: columnVisibility.source === false,
        engagement: columnVisibility.engagement === false,
        lastSeen: columnVisibility.lastSeen === false,
      }),
      [columnVisibility]
    );

    const hasMetadataSubtitle =
      hiddenMetadataColumns.location ||
      hiddenMetadataColumns.source ||
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

    const defaultExportMember = React.useCallback((member: AudienceMember) => {
      downloadVCard(member);
      toast.success('Contact exported as vCard');
    }, []);

    const handleExportMember = React.useCallback(
      (member: AudienceMember) => {
        const callback = actionAdapter?.onExportMember ?? defaultExportMember;
        callback(member);
      },
      [actionAdapter, defaultExportMember]
    );

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

    const defaultViewProfile = React.useCallback(
      (member: AudienceMember) => {
        setSelectedMember(member);
        openPanel('contact');
      },
      [setSelectedMember, openPanel]
    );

    const handleViewProfile = React.useCallback(
      (member: AudienceMember) => {
        const callback = actionAdapter?.onViewProfile ?? defaultViewProfile;
        callback(member);
      },
      [actionAdapter, defaultViewProfile]
    );

    const defaultSendNotification = React.useCallback(
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

    const handleSendNotification = React.useCallback(
      (member: AudienceMember) => {
        const callback =
          actionAdapter?.onSendNotification ?? defaultSendNotification;
        callback(member);
      },
      [actionAdapter, defaultSendNotification]
    );

    const handleBlockMember = React.useCallback(
      (member: AudienceMember) => {
        const callback = actionAdapter?.onBlockMember;
        if (callback) {
          callback(member);
          return;
        }
        handleRemoveMember(member).catch(() => {});
      },
      [actionAdapter, handleRemoveMember]
    );

    const ensureProfileQrSource =
      React.useCallback(async (): Promise<SourceLinkPayload> => {
        if (!profileId) {
          throw new Error('Missing profile');
        }

        const existingRequest = profileQrSourceRequests.get(profileId);
        if (existingRequest) {
          return existingRequest;
        }

        const requestPromise = (async () => {
          const existingResponse = await fetch(
            `/api/dashboard/audience/source-links?profileId=${encodeURIComponent(profileId)}`,
            { cache: 'no-store' }
          );
          if (!existingResponse.ok && existingResponse.status !== 404) {
            void captureError(
              'Audience source links preload failed',
              new Error(
                `source-links preload failed with ${existingResponse.status}`
              ),
              {
                profileId,
                status: existingResponse.status,
              }
            );
          }
          if (existingResponse.ok) {
            const existingPayload = (await existingResponse.json()) as {
              links?: SourceLinkPayload[];
            };
            const existingLink = existingPayload.links?.find(
              link =>
                link.name === PROFILE_QR_SOURCE_NAME &&
                link.sourceType === 'qr' &&
                link.destinationKind === 'profile' &&
                !link.archivedAt &&
                Boolean(link.shortUrl)
            );
            if (existingLink) return existingLink;
          }

          const createResponse = await fetch(
            '/api/dashboard/audience/source-groups',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                profileId,
                name: PROFILE_QR_SOURCE_NAME,
                sourceType: 'qr',
                destinationKind: 'profile',
                destinationUrl: profileUrl,
              }),
            }
          );

          if (!createResponse.ok) {
            throw new Error('Failed to create QR source');
          }

          const createdPayload = (await createResponse.json()) as {
            links?: SourceLinkPayload[];
          };
          const link = createdPayload.links?.[0];
          if (!link?.shortUrl) {
            throw new Error('Source link create returned no link');
          }

          return link;
        })();

        profileQrSourceRequests.set(profileId, requestPromise);

        try {
          return await requestPromise;
        } finally {
          profileQrSourceRequests.delete(profileId);
        }
      }, [profileId, profileUrl]);

    const handleSourceLinkAction = React.useCallback(
      async (action: 'copy' | 'open' | 'download') => {
        if (!profileId) {
          toast.error('Profile is still loading');
          return;
        }

        try {
          if (actionAdapter?.onSourceLinkAction) {
            await actionAdapter.onSourceLinkAction(action);
            return;
          }

          const sourceLink = await ensureProfileQrSource();

          if (action === 'copy') {
            const copied = await copyTextToClipboard(sourceLink.shortUrl);
            if (!copied) {
              toast.error('Unable to copy source link');
              return;
            }
            toast.success('Source link copied');
            return;
          }

          if (action === 'open') {
            globalThis.open(
              sourceLink.shortUrl,
              '_blank',
              'noopener,noreferrer'
            );
            return;
          }

          const dataUrl = await generateQrCodeDataUrl(
            sourceLink.shortUrl,
            QR_DOWNLOAD_SIZE
          );
          const blob = qrCodeDataUrlToBlob(dataUrl);
          const filename =
            sanitizeQrFilename(sourceLink.name) || 'audience-source';
          downloadBlob(blob, `${filename}-qr.png`);
          toast.success('QR code downloaded');
        } catch {
          toast.error('Unable to load source link');
        }
      },
      [actionAdapter, ensureProfileQrSource, profileId]
    );

    const sourceShareItems = React.useMemo<CommonDropdownItem[]>(
      () => [
        {
          type: 'action',
          id: 'copy-source-link',
          label: 'Copy Link',
          icon: Copy,
          onClick: async () => {
            await handleSourceLinkAction('copy');
          },
        },
        {
          type: 'action',
          id: 'open-source-link',
          label: 'Open Link',
          icon: ExternalLink,
          onClick: async () => {
            await handleSourceLinkAction('open');
          },
        },
        {
          type: 'action',
          id: 'download-source-qr',
          label: 'Download QR Code',
          icon: Download,
          onClick: async () => {
            await handleSourceLinkAction('download');
          },
        },
      ],
      [handleSourceLinkAction]
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
          onExportVCard: handleExportMember,
          onBlock: m => {
            handleBlockMember(m);
          },
          canBlock: Boolean(profileId || actionAdapter?.onBlockMember),
        });
      },
      [
        actionAdapter?.onBlockMember,
        handleBlockMember,
        handleExportMember,
        handleSendNotification,
        profileId,
        setSelectedMember,
      ]
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
        if (analyticsMode === 'static') {
          if (!analyticsData) {
            return null;
          }

          return (
            <StaticAnalyticsSidebar
              isOpen
              onClose={handleClosePanel}
              data={analyticsData}
              testId={analyticsSidebarTestId}
              tabbedCardTestId={analyticsTabbedCardTestId}
            />
          );
        }

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
    }, [
      analyticsData,
      analyticsMode,
      analyticsSidebarTestId,
      analyticsTabbedCardTestId,
      getContextMenuItems,
      handleClosePanel,
      panelMode,
      selectedMember,
    ]);

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
          <CommonDropdown
            variant='dropdown'
            size='compact'
            align='end'
            items={sourceShareItems}
            trigger={
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label='Source link actions'
                title='Source link'
                className={DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS}
              >
                <Icon name='QrCode' className='h-4 w-4' strokeWidth={1.9} />
              </Button>
            }
          />
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
      [panelMode, sourceShareItems, toggle]
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
          <PageShell
            className='overflow-hidden'
            data-testid={testId}
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
                    testId='dashboard-audience-empty-state'
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
                            testId='dashboard-audience-empty-state'
                          />
                        }
                        getRowId={row => row.id}
                        enableVirtualization={true}
                        enableKeyboardNavigation={true}
                        sorting={sorting}
                        onSortingChange={handleSortingChange}
                        columnVisibility={columnVisibility}
                        minWidth={tableMinWidth}
                        className='text-app'
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
          </PageShell>
        </AudienceTableVolatileProvider>
      </AudienceTableStableProvider>
    );
  }
);
