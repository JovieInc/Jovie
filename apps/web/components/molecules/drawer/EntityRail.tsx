'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { InlineIconButton } from '@/components/atoms/InlineIconButton';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import { ActivityFeed, type EntityRailActivityItem } from './ActivityFeed';
import { DrawerPropertyRow } from './DrawerPropertyRow';
import { DrawerTabs } from './DrawerTabs';
import { EntityHeader } from './EntityHeader';
import { EntitySidebarShell } from './EntitySidebarShell';
import {
  ENTITY_RAIL_OVERVIEW_TAB_ID,
  type EntityRailEntityType,
  getEntityRailConfig,
  RAIL_WIDTH,
  RAIL_WIDTH_WIDE,
} from './entityRailConfig';
import { type EntityRailStatValue, StatRow } from './StatRow';

/** Fixed label column of the rail property list (one right gutter for copy). */
const RAIL_PROPERTY_LABEL_WIDTH = 96;
const ACTIVITY_PREVIEW_LIMIT = 3;

export interface EntityRailProperty {
  readonly label: string;
  readonly value: ReactNode;
  /** When provided, the row reveals a trailing copy control in the right gutter. */
  readonly copyValue?: string;
}

export interface EntityRailProps {
  readonly entityType: EntityRailEntityType;
  readonly isOpen: boolean;
  readonly title: ReactNode;
  readonly onClose: () => void;
  readonly id?: string;
  readonly eyebrow?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly thumbnail?: ReactNode;
  readonly statusGlyph?: ReactNode;
  readonly badge?: ReactNode;
  readonly primaryAction?: ReactNode;
  readonly contextMenuItems?: CommonDropdownItem[];
  /** Defaults to the entity table's 3 stats, unmeasured until wired. */
  readonly stats?: readonly EntityRailStatValue[];
  readonly overviewProperties?: readonly EntityRailProperty[];
  readonly activityItems?: readonly EntityRailActivityItem[];
  readonly activeTab?: string;
  readonly onTabChange?: (tabId: string) => void;
  /** `wide` (480px, documents) is the only width variant; default is 360. */
  readonly variant?: 'default' | 'wide';
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
  readonly isEmpty?: boolean;
  readonly 'data-testid'?: string;
}

function PropertyCopyButton({
  label,
  copyValue,
}: {
  readonly label: string;
  readonly copyValue: string;
}) {
  const { copy, isSuccess } = useClipboard();
  return (
    <InlineIconButton
      type='button'
      size='sm'
      fadeOnParentHover
      aria-label={`Copy ${label}`}
      onClick={() => {
        copy(copyValue).catch(() => {
          // Copy failures are non-critical; useClipboard reports the error.
        });
      }}
      className={cn(isSuccess && 'text-success')}
    >
      {isSuccess ? (
        <Check className='h-3.5 w-3.5' aria-hidden='true' />
      ) : (
        <Copy className='h-3.5 w-3.5' aria-hidden='true' />
      )}
    </InlineIconButton>
  );
}

function RailPropertyList({
  properties,
}: {
  readonly properties: readonly EntityRailProperty[];
}) {
  return (
    <div data-slot='entity-rail-properties' className='space-y-1'>
      {properties.map(property => (
        <div
          key={property.label}
          data-testid='entity-rail-property-row'
          className='group flex items-center gap-1'
        >
          <div className='min-w-0 flex-1'>
            <DrawerPropertyRow
              label={property.label}
              value={property.value}
              labelWidth={RAIL_PROPERTY_LABEL_WIDTH}
            />
          </div>
          {property.copyValue ? (
            <PropertyCopyButton
              label={property.label}
              copyValue={property.copyValue}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Canonical rail template; EntitySidebarShell owns its chrome and layout. */
export function EntityRail({
  entityType,
  isOpen,
  title,
  onClose,
  id,
  eyebrow,
  subtitle,
  thumbnail,
  statusGlyph,
  badge,
  primaryAction,
  contextMenuItems,
  stats,
  overviewProperties,
  activityItems,
  activeTab,
  onTabChange,
  variant = 'default',
  footer,
  children,
  isEmpty = false,
  'data-testid': testId,
}: EntityRailProps) {
  const [internalTab, setInternalTab] = useState(ENTITY_RAIL_OVERVIEW_TAB_ID);
  const config = getEntityRailConfig(entityType);
  const requestedTab = activeTab ?? internalTab;
  const activeTabId = config.tabs.some(tab => tab.id === requestedTab)
    ? requestedTab
    : ENTITY_RAIL_OVERVIEW_TAB_ID;
  const handleTabChange = (tabId: string) => {
    setInternalTab(tabId);
    onTabChange?.(tabId);
  };
  const resolvedStats: readonly EntityRailStatValue[] =
    stats ??
    config.stats.map(stat => ({
      label: stat.label,
      state: 'not-measured' as const,
      notMeasuredSource: stat.measuredBy,
    }));
  const hasActivityTab = config.tabs.some(tab => tab.id === 'activity');
  const overviewBody = (
    <div data-testid='entity-rail-overview' className='space-y-2'>
      {overviewProperties && overviewProperties.length > 0 ? (
        <RailPropertyList properties={overviewProperties} />
      ) : null}
      {activityItems && activityItems.length > 0 ? (
        <div className='space-y-1'>
          <ActivityFeed
            items={activityItems.slice(0, ACTIVITY_PREVIEW_LIMIT)}
          />
          {hasActivityTab ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => handleTabChange('activity')}
            >
              View All
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      id={id}
      width={variant === 'wide' ? RAIL_WIDTH_WIDE : RAIL_WIDTH}
      ariaLabel={`${config.label} details`}
      onClose={onClose}
      contextMenuItems={contextMenuItems}
      title={config.label}
      headerActions={
        <>
          {primaryAction}
          <DrawerHeaderActions
            primaryActions={[]}
            menuItems={contextMenuItems}
            onClose={onClose}
          />
        </>
      }
      scrollStrategy='shell'
      tabs={
        <DrawerTabs
          value={activeTabId}
          onValueChange={handleTabChange}
          options={config.tabs.map(tab => ({
            value: tab.id,
            label: tab.label,
          }))}
          ariaLabel={`${config.label} tabs`}
          overflowMode='scroll'
          distribution='fill'
        />
      }
      entityHeader={
        <EntityHeader
          layout='grid'
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          statusGlyph={statusGlyph}
          badge={badge}
          thumbnail={thumbnail}
          footer={<StatRow stats={resolvedStats} />}
        />
      }
      footer={footer}
      isEmpty={isEmpty}
      emptyMessage={`Select a ${config.label.toLowerCase()} to see details.`}
      data-testid={testId}
    >
      {isEmpty
        ? null
        : activeTabId === ENTITY_RAIL_OVERVIEW_TAB_ID
          ? overviewBody
          : children}
    </EntitySidebarShell>
  );
}

export type {
  EntityRailEntityConfig,
  EntityRailStat,
  EntityRailTab,
} from './entityRailConfig';
export { ENTITY_RAIL_ENTITY_TABLE } from './entityRailConfig';
