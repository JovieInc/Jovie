import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipShortcut: ({
    label,
    shortcut,
    children,
  }: {
    label: string;
    shortcut?: string;
    children: React.ReactNode;
  }) => (
    <div data-testid={`tooltip-${label}`} data-shortcut={shortcut}>
      {children}
    </div>
  ),
}));

vi.mock('@radix-ui/react-popover', () => ({
  Close: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/organisms/table', () => ({
  ExportCSVButton: ({ label }: { label: string }) => (
    <button type='button'>{label}</button>
  ),
}));

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/hooks/useReleaseFilterCounts',
  () => ({
    useReleaseFilterCounts: () => ({
      byType: {},
      byPopularity: {},
      byLabel: [],
    }),
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/ReleaseFilterDropdown',
  () => ({
    ReleaseFilterDropdown: () => <button type='button'>Filter</button>,
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/utils/exportReleases',
  () => ({
    getReleasesForExport: vi.fn(() => []),
    RELEASES_CSV_COLUMNS: [],
  })
);

const { ReleaseTableSubheader } = await import(
  '@/components/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader'
);

describe('ReleaseTableSubheader tooltip regression', () => {
  it('shows an Export tooltip with E shortcut alongside other toolbar actions', () => {
    render(
      <ReleaseTableSubheader
        releases={[]}
        selectedIds={new Set<string>()}
        columnVisibility={{}}
        onColumnVisibilityChange={() => {}}
        availableColumns={[]}
        filters={{ releaseTypes: [], popularity: [], labels: [] }}
        onFiltersChange={() => {}}
      />
    );

    expect(screen.getByTestId('tooltip-Display')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-Export')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-Export')).toHaveAttribute(
      'data-shortcut',
      'E'
    );
  });
});
