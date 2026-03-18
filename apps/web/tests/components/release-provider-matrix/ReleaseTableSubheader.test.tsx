import { render, screen } from '@testing-library/react';
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
  PageToolbar: ({ start, end }: { start: ReactNode; end: ReactNode }) => (
    <div>
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
}));

const { ReleaseTableSubheader, DEFAULT_RELEASE_FILTERS } = await import(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader'
);

describe('ReleaseTableSubheader', () => {
  it('renders the drawer toggle button in page-toolbar chrome', () => {
    render(
      <ReleaseTableSubheader
        releases={[] as ReleaseViewModel[]}
        selectedIds={new Set<string>()}
        filters={DEFAULT_RELEASE_FILTERS}
        onFiltersChange={() => undefined}
        releaseView='tracks'
        onReleaseViewChange={() => undefined}
      />
    );

    expect(screen.getByTestId('drawer-toggle-button')).toBeInTheDocument();
    expect(drawerToggleButtonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chrome: 'page-toolbar',
        tooltipLabel: 'Preview',
      })
    );
  });
});
