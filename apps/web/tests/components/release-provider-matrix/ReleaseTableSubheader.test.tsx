import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

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

vi.mock('@/components/atoms/AppIconButton', () => ({
  AppIconButton: ({ children }: { children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@radix-ui/react-popover', () => ({
  Close: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button type='button' {...props}>
      {children as ReactNode}
    </button>
  ),
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipShortcut: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

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
  }: {
    start: ReactNode;
    end: ReactNode;
    className?: string;
  }) => (
    <div data-testid='page-toolbar' className={className}>
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
  ExportCSVButton: () => <button type='button'>Export</button>,
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
  it('attaches the divider to the top edge of the subheader shell', () => {
    render(
      <ReleaseTableSubheader
        releases={[] as ReleaseViewModel[]}
        selectedIds={new Set<string>()}
        filters={DEFAULT_RELEASE_FILTERS}
        onFiltersChange={() => undefined}
        releaseView='tracks'
        onReleaseViewChange={() => undefined}
        searchQuery=''
        onSearchQueryChange={() => undefined}
      />
    );

    const toolbar = screen.getByTestId('page-toolbar');
    expect(toolbar.className).toContain('border-t');
    expect(toolbar.className).toContain('border-b-0');
  });

  it('orders toolbar controls as search, filters, display, export, preview, and create', async () => {
    const user = userEvent.setup();
    const onCreateRelease = vi.fn();

    render(
      <ReleaseTableSubheader
        releases={[] as ReleaseViewModel[]}
        selectedIds={new Set<string>()}
        filters={DEFAULT_RELEASE_FILTERS}
        onFiltersChange={() => undefined}
        releaseView='tracks'
        onReleaseViewChange={() => undefined}
        searchQuery=''
        onSearchQueryChange={() => undefined}
        onCreateRelease={onCreateRelease}
        canCreateManualReleases
      />
    );

    const controls = [
      screen.getByTestId('toolbar-search'),
      screen.getByRole('button', { name: 'Filters' }),
      screen.getByRole('button', { name: /display/i }),
      screen.getByRole('button', { name: 'Export' }),
      screen.getByTestId('drawer-toggle-button'),
      screen.getByRole('button', { name: 'New Release' }),
    ];

    controls.reduce((previous, current) => {
      if (previous) {
        expect(
          previous.compareDocumentPosition(current) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
      }
      return current;
    });

    await user.click(screen.getByRole('button', { name: 'New Release' }));
    expect(onCreateRelease).toHaveBeenCalledTimes(1);
  });
});
