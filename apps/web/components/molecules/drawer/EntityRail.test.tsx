import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ACTIVITY_ITEMS as ACTIVITY } from './drawer.fixtures';
import { EntityRail } from './EntityRail';
import {
  ENTITY_RAIL_ENTITY_TABLE,
  RAIL_WIDTH,
  RAIL_WIDTH_WIDE,
} from './entityRailConfig';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    ariaLabel,
    id,
    width,
    onKeyDown,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly ariaLabel?: string;
    readonly id?: string;
    readonly width?: number;
    readonly onKeyDown?: (event: KeyboardEvent) => void;
    readonly 'data-testid'?: string;
  }) => (
    <aside
      id={id}
      data-testid={testId ?? 'right-drawer'}
      aria-label={ariaLabel}
      style={{ width }}
      onKeyDown={event => onKeyDown?.(event.nativeEvent)}
    >
      {children}
    </aside>
  ),
}));

const readSource = (file: string) =>
  readFileSync(
    resolve(process.cwd(), 'components/molecules/drawer', file),
    'utf8'
  );

const PROPERTIES = [
  { label: 'Status', value: 'Live' },
  { label: 'ISRC', value: 'USRC17607839', copyValue: 'USRC17607839' },
  { label: 'Release date', value: 'Apr 12, 2026' },
];

function renderReleaseRail(
  props: Partial<ComponentProps<typeof EntityRail>> = {}
) {
  return render(
    <EntityRail
      entityType='release'
      isOpen
      title='Lost in the Light'
      onClose={vi.fn()}
      overviewProperties={PROPERTIES}
      activityItems={ACTIVITY}
      {...props}
    />
  );
}

describe('EntityRail entity table', () => {
  it('gives every entity type exactly 3 key stats, Overview first, lowercase tab ids', () => {
    for (const [entityType, config] of Object.entries(
      ENTITY_RAIL_ENTITY_TABLE
    )) {
      expect(
        config.stats,
        `${entityType} must list exactly 3 stats`
      ).toHaveLength(3);
      expect(
        config.tabs.length,
        `${entityType} keeps max 4 tabs`
      ).toBeLessThanOrEqual(4);
      expect(config.tabs[0]?.label, `${entityType} first tab`).toBe('Overview');
      for (const stat of config.stats) {
        expect(stat.label).toBeTruthy();
        expect(
          stat.measuredBy,
          `${entityType} ${stat.label} names its source`
        ).toBeTruthy();
      }
      for (const tab of config.tabs) {
        expect(tab.id, `${entityType} tab ids equal labels lowercased`).toBe(
          tab.label.toLowerCase()
        );
      }
    }
  });

  it('fixes one rail width with wide as the only variant, never a numeric literal in the template', () => {
    expect(RAIL_WIDTH).toBe(360);
    expect(RAIL_WIDTH_WIDE).toBe(480);
    for (const file of ['EntityRail.tsx', 'StatRow.tsx', 'ActivityFeed.tsx']) {
      const source = readSource(file);
      expect(source, `${file} must not hardcode rail widths`).not.toMatch(
        /width=\{\d+\}/
      );
      expect(
        source,
        `${file} must not use arbitrary width classes`
      ).not.toMatch(/w-\[\d+px\]/);
    }
  });
});

describe('EntityRail', () => {
  it('renders tabs and stats in entity-table order for a release', async () => {
    const onClose = vi.fn();
    const { container } = renderReleaseRail({
      onClose,
      primaryAction: <button type='button'>Edit</button>,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    const rail = screen.getByTestId('right-drawer');
    expect(rail).toHaveAttribute('aria-label', 'Release details');
    expect(rail).toHaveStyle({ width: '360px' });
    expect(rail.querySelector('[data-scroll-strategy]')).toHaveAttribute(
      'data-scroll-strategy',
      'shell'
    );

    const tablist = screen.getByRole('tablist', { name: 'Release tabs' });
    const tabs = tablist.querySelectorAll('[role="tab"]');
    expect(Array.from(tabs).map(tab => tab.textContent)).toEqual([
      'Overview',
      'Links',
      'Activity',
      'Tasks',
    ]);
    expect(screen.getByTestId('drawer-tab-overview')).toHaveAttribute(
      'aria-selected',
      'true'
    );

    const statRow = screen.getByTestId('entity-rail-stat-row');
    expect(statRow.querySelectorAll('[data-slot="stat-tile"]')).toHaveLength(3);
    expect(statRow).toHaveTextContent('Total clicks');
    expect(statRow).toHaveTextContent('Not measured');
    await expectNoA11yViolations(container);
  });

  it('defaults unmeasured stats to "Not measured" with the missing source named', () => {
    renderReleaseRail();
    const streams = screen
      .getByText('Streams')
      .closest('[data-slot="stat-tile"]')
      ?.querySelector('[data-testid="stat-tile-value"]');
    expect(streams).toHaveAttribute('data-state', 'not-measured');
    expect(streams).toHaveAttribute(
      'title',
      'Not measured yet — waiting on streaming ingestion'
    );
  });

  it('reveals property copy controls in the same right gutter', () => {
    renderReleaseRail();
    const isrcRow = screen
      .getAllByTestId('entity-rail-property-row')
      .find(row => row.textContent?.includes('USRC17607839'));
    expect(isrcRow).toBeDefined();
    expect(isrcRow?.className).toContain('group');
    const copy = screen.getByRole('button', { name: 'Copy ISRC' });
    expect(isrcRow).toContainElement(copy);
    // Rows without a copyValue keep the gutter empty, aligned with the rest.
    const statusRow = screen
      .getAllByTestId('entity-rail-property-row')
      .find(row => row.textContent?.includes('Live'));
    expect(statusRow?.querySelector('button')).toBeNull();
  });

  it('previews the last 3 activity items and opens the Activity tab with View All', () => {
    const onTabChange = vi.fn();
    const { rerender } = renderReleaseRail({ onTabChange });
    const overview = screen.getByTestId('entity-rail-overview');
    expect(
      overview.querySelectorAll('[data-testid="entity-rail-activity-item"]')
    ).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'View All' }));
    expect(onTabChange).toHaveBeenCalledWith('activity');

    rerender(
      <EntityRail
        entityType='release'
        isOpen
        title='Lost in the Light'
        onClose={vi.fn()}
        overviewProperties={PROPERTIES}
        activityItems={ACTIVITY}
        activeTab='activity'
        onTabChange={onTabChange}
      >
        <div data-testid='activity-tab-body'>Full feed</div>
      </EntityRail>
    );
    expect(screen.getByTestId('activity-tab-body')).toBeInTheDocument();
    expect(screen.queryByTestId('entity-rail-overview')).toBeNull();
  });

  it('returns to Overview when the new entity lacks the selected tab', () => {
    const { rerender } = renderReleaseRail();
    fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }));
    rerender(
      <EntityRail
        entityType='link'
        isOpen
        title='Smart link'
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('entity-rail-overview')).toBeInTheDocument();
  });

  it('shows the quiet empty state naming the entity', () => {
    renderReleaseRail({ isEmpty: true });
    expect(
      screen.getByText(/select a release to see details/i)
    ).toBeInTheDocument();
  });

  it('applies the wide (480) variant for document editors', () => {
    renderReleaseRail({ variant: 'wide' });
    expect(screen.getByTestId('right-drawer')).toHaveStyle({
      width: '480px',
    });
  });

  it('accepts only entity types that exist in the entity table', () => {
    renderReleaseRail();
    expect(Object.keys(ENTITY_RAIL_ENTITY_TABLE)).toContain('release');
    expect(Object.keys(ENTITY_RAIL_ENTITY_TABLE)).toHaveLength(14);
    // @ts-expect-error unknown entity types must not typecheck
    expect(ENTITY_RAIL_ENTITY_TABLE.bogus).toBeUndefined();
  });
});
