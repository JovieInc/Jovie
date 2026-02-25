import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    className,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode;
    className?: string;
    'aria-label'?: string;
  }) => (
    <button type='button' className={className} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipShortcut: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SimpleTooltip: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@radix-ui/react-popover', () => ({
  Close: ({ children }: { children?: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: () => <span data-testid='icon' />,
}));

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/hooks/useReleaseFilterCounts',
  () => ({
    useReleaseFilterCounts: () => ({
      byType: {},
      byPopularity: {},
      byLabel: {},
    }),
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/ReleaseFilterDropdown',
  () => ({
    ReleaseFilterDropdown: ({
      buttonClassName,
    }: {
      buttonClassName?: string;
    }) => (
      <button
        type='button'
        data-testid='filter-trigger'
        className={buttonClassName}
        aria-label='Filter'
      >
        <span>Filter</span>
      </button>
    ),
  })
);

vi.mock('@/components/organisms/table', () => ({
  ExportCSVButton: ({
    className,
    ariaLabel,
  }: {
    className?: string;
    ariaLabel?: string;
  }) => (
    <button
      type='button'
      data-testid='export-trigger'
      className={className}
      aria-label={ariaLabel}
    >
      <span>Export</span>
    </button>
  ),
}));

const { ReleaseTableSubheader } = await import(
  '@/components/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader'
);

describe('ReleaseTableSubheader responsive toolbar controls', () => {
  it('renders filter, display, and export controls with accessible labels', () => {
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

    expect(screen.getByLabelText('Filter')).toBeInTheDocument();
    expect(screen.getByLabelText('Display')).toBeInTheDocument();
    expect(screen.getByLabelText('Export')).toBeInTheDocument();
  });

  it('applies mobile icon-only responsive classes to export button', () => {
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

    const exportButton = screen.getByTestId('export-trigger');
    expect(exportButton.className).toContain('[&_span]:sr-only');
    expect(exportButton.className).toContain('md:[&_span]:not-sr-only');
    expect(exportButton.className).toContain('w-7');
    expect(exportButton.className).toContain('md:w-auto');
  });
});
