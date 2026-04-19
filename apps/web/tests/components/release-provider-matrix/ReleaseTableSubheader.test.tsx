import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

function assertDocumentOrder(elements: HTMLElement[]) {
  for (let index = 1; index < elements.length; index += 1) {
    const previous = elements[index - 1];
    const current = elements[index];
    expect(
      previous.compareDocumentPosition(current) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  }
}

const drawerToggleButtonMock = vi.fn((props: Record<string, unknown>) => (
  <button type='button' data-testid='drawer-toggle-button'>
    {String(props.tooltipLabel ?? '')}
  </button>
));

vi.mock('@/features/dashboard/atoms/DrawerToggleButton', () => ({
  DrawerToggleButton: (props: Record<string, unknown>) =>
    drawerToggleButtonMock(props),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseFilterDropdown',
  () => ({
    ReleaseFilterDropdown: () => <button type='button'>Filters</button>,
  })
);

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => true,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/molecules/HeaderSearchAction', () => ({
  HeaderSearchAction: () => (
    <button type='button' data-testid='toolbar-search'>
      Search
    </button>
  ),
}));

vi.mock('@/components/atoms/AppSegmentControl', () => ({
  AppSegmentControl: () => <div data-testid='segment-control' />,
}));

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button type='button' {...props}>
      {children as ReactNode}
    </button>
  ),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTableDisplayMenu',
  () => ({
    ReleaseTableDisplayMenu: () => <button type='button'>Display</button>,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTableExportButton',
  () => ({
    ReleaseTableExportButton: () => <button type='button'>Export</button>,
  })
);

vi.mock('@/components/organisms/table', () => ({
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS: 'active',
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS: 'action-button',
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS: 'icon-only',
  PAGE_TOOLBAR_END_GROUP_CLASS: 'end-group',
  PAGE_TOOLBAR_ICON_CLASS: 'icon',
  PAGE_TOOLBAR_ICON_STROKE_WIDTH: 2,
  PageToolbar: ({
    start,
    end,
    className,
    topDivider,
  }: {
    start: ReactNode;
    end: ReactNode;
    className?: string;
    topDivider?: boolean;
  }) => (
    <div
      data-testid='page-toolbar'
      data-top-divider={topDivider ? 'true' : undefined}
      className={className}
    >
      <div>{start}</div>
      <div>{end}</div>
    </div>
  ),
  PageToolbarTabButton: ({
    label,
    onClick,
  }: {
    label: ReactNode;
    onClick?: () => void;
  }) => (
    <button type='button' onClick={onClick}>
      {label}
    </button>
  ),
  PageToolbarActionButton: ({
    label,
    onClick,
  }: {
    label: ReactNode;
    onClick?: () => void;
  }) => (
    <button type='button' onClick={onClick}>
      {label}
    </button>
  ),
}));

const { ReleaseTableSubheader, DEFAULT_RELEASE_FILTERS } = await import(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader'
);

describe('ReleaseTableSubheader', () => {
  it('renders the flattened subheader shell without a duplicated top divider', () => {
    render(
      <ReleaseTableSubheader
        releases={[] as ReleaseViewModel[]}
        allReleases={[] as ReleaseViewModel[]}
        selectedIds={new Set<string>()}
        filters={DEFAULT_RELEASE_FILTERS}
        onFiltersChange={() => undefined}
        releaseView='tracks'
        onReleaseViewChange={() => undefined}
        searchQuery=''
        onSearchQueryChange={() => undefined}
      />
    );

    expect(screen.getByTestId('page-toolbar')).not.toHaveAttribute(
      'data-top-divider'
    );
  });

  it('orders toolbar controls as search, filters, display, export, and preview', () => {
    render(
      <ReleaseTableSubheader
        releases={[] as ReleaseViewModel[]}
        allReleases={[] as ReleaseViewModel[]}
        selectedIds={new Set<string>()}
        filters={DEFAULT_RELEASE_FILTERS}
        onFiltersChange={() => undefined}
        releaseView='tracks'
        onReleaseViewChange={() => undefined}
        searchQuery=''
        onSearchQueryChange={() => undefined}
      />
    );

    const controls = [
      screen.getByTestId('toolbar-search'),
      screen.getByRole('button', { name: 'Filters' }),
      screen.getByRole('button', { name: /display/i }),
      screen.getByRole('button', { name: 'Export' }),
      screen.getByTestId('drawer-toggle-button'),
    ];

    assertDocumentOrder(controls);
  });
});
