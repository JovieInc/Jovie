/**
 * Tests for ReleaseFilterDropdown — filter toggle and clear logic.
 *
 * Covers:
 * - Type toggle: adds/removes release types
 * - Popularity toggle: adds/removes popularity levels
 * - Label toggle: adds/removes labels
 * - Clear handlers: reset each filter dimension
 * - Active filter pills rendering
 * - "Clear all" resets everything
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  PopularityLevel,
  ReleaseFilters,
} from '@/features/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader';
import type { ReleaseType } from '@/lib/discography/types';

// ── Mock dependencies ──

vi.mock('@jovie/ui', () => {
  // Simple passthrough mocks for Radix dropdown primitives
  const Slot = ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    // If children is a React element, clone with props
    if (
      children &&
      typeof children === 'object' &&
      'type' in (children as object)
    ) {
      const { asChild: _, ...rest } = props;
      return (
        <div data-testid='trigger-wrapper' {...rest}>
          {children}
        </div>
      );
    }
    return <div {...props}>{children}</div>;
  };

  return {
    Button: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <button {...props}>{children}</button>,
    DropdownMenu: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      // biome-ignore lint/a11y/useKeyWithClickEvents: test mock only
      // biome-ignore lint/a11y/noStaticElementInteractions: test mock only
      <div
        data-testid='dropdown-menu'
        data-open={open}
        onClick={() => onOpenChange?.(!open)}
      >
        {children}
      </div>
    ),
    DropdownMenuContent: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <div data-testid='dropdown-content'>{children}</div>,
    DropdownMenuTrigger: ({
      children,
      asChild: _,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
      [key: string]: unknown;
    }) => (
      <div data-testid='dropdown-trigger' {...props}>
        {children}
      </div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
      [key: string]: unknown;
    }) => (
      <button type='button' data-testid='dropdown-item' onClick={onSelect}>
        {children}
      </button>
    ),
    DropdownMenuSeparator: () => <hr data-testid='dropdown-separator' />,
    DropdownMenuSub: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <div data-testid='dropdown-sub'>{children}</div>,
    DropdownMenuSubTrigger: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <div data-testid='dropdown-sub-trigger'>{children}</div>,
    DropdownMenuSubContent: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <div data-testid='dropdown-sub-content'>{children}</div>,
    TooltipShortcut: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <>{children}</>,
    MENU_ITEM_BASE: 'menu-item-base',
    Slot,
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
  }),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className}>
      {name}
    </span>
  ),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/FilterSubmenu',
  () => ({
    FilterSubmenu: ({
      label,
      selectedIds,
      onToggle,
      options,
      isVisible,
    }: {
      label: string;
      selectedIds: string[];
      onToggle: (id: string) => void;
      options: Array<{ id: string; label: string }>;
      isVisible?: boolean;
    }) => {
      if (isVisible === false) return null;
      return (
        <div
          data-testid={`filter-submenu-${label.toLowerCase().replace(/ /g, '-')}`}
        >
          <span data-testid='selected-count'>{selectedIds.length}</span>
          {options.map(opt => (
            <button
              type='button'
              key={opt.id}
              data-testid={`toggle-${opt.id}`}
              onClick={() => onToggle(opt.id)}
              data-checked={selectedIds.includes(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      );
    },
  })
);

// ── Import after mocks ──

const { ReleaseFilterDropdown } = await import(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseFilterDropdown'
);

// ── Helpers ──

const DEFAULT_COUNTS = {
  byType: {
    album: 5,
    ep: 3,
    single: 10,
    compilation: 1,
    live: 0,
    mixtape: 0,
    other: 0,
  },
  byAvailability: { all: 19, complete: 12, incomplete: 7 },
  byPopularity: { low: 4, med: 8, high: 7 },
  byLabel: [
    { label: 'Republic', count: 6 },
    { label: 'Interscope', count: 3 },
  ],
};

function renderDropdown(
  filterOverrides: Partial<ReleaseFilters> = {},
  onFiltersChange = vi.fn()
) {
  const filters: ReleaseFilters = {
    releaseTypes: [],
    popularity: [],
    labels: [],
    ...filterOverrides,
  };

  return {
    onFiltersChange,
    ...render(
      <ReleaseFilterDropdown
        filters={filters}
        onFiltersChange={onFiltersChange}
        counts={DEFAULT_COUNTS}
      />
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReleaseFilterDropdown', () => {
  describe('type toggle', () => {
    it('calls onFiltersChange with added type when toggling on', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown();

      const toggleAlbum = screen.getByTestId('toggle-album');
      await user.click(toggleAlbum);

      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ releaseTypes: ['album'] as ReleaseType[] })
      );
    });

    it('calls onFiltersChange with removed type when toggling off', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown({
        releaseTypes: ['album', 'single'] as ReleaseType[],
      });

      const toggleAlbum = screen.getByTestId('toggle-album');
      await user.click(toggleAlbum);

      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ releaseTypes: ['single'] })
      );
    });
  });

  describe('popularity toggle', () => {
    it('adds popularity level when toggling on', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown();

      const toggleHigh = screen.getByTestId('toggle-high');
      await user.click(toggleHigh);

      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ popularity: ['high'] as PopularityLevel[] })
      );
    });

    it('removes popularity level when toggling off', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown({
        popularity: ['low', 'high'] as PopularityLevel[],
      });

      const toggleHigh = screen.getByTestId('toggle-high');
      await user.click(toggleHigh);

      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ popularity: ['low'] })
      );
    });
  });

  describe('active filter pills', () => {
    it('shows type filter pill when types are selected', () => {
      renderDropdown({ releaseTypes: ['album'] as ReleaseType[] });

      expect(screen.getByText('Release Type')).toBeInTheDocument();
    });

    it('shows popularity filter pill when levels are selected', () => {
      renderDropdown({ popularity: ['high'] as PopularityLevel[] });

      expect(screen.getByText('Popularity')).toBeInTheDocument();
    });

    it('shows label filter pill when labels are selected', () => {
      renderDropdown({ labels: ['Republic'] });

      // The pill has a clear button with "Clear Label filter" aria-label
      expect(screen.getByLabelText('Clear Label filter')).toBeInTheDocument();
    });

    it('shows no pills when no filters are active', () => {
      renderDropdown();

      // "Release Type" text only exists inside the submenu trigger, not as a pill
      const pills = screen.queryAllByLabelText(/Clear .* filter/);
      expect(pills).toHaveLength(0);
    });
  });

  describe('clear handlers', () => {
    it('clears type filter when pill X is clicked', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown({
        releaseTypes: ['album', 'single'] as ReleaseType[],
      });

      const clearButton = screen.getByLabelText('Clear Release Type filter');
      await user.click(clearButton);

      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ releaseTypes: [] })
      );
    });

    it('clears popularity filter when pill X is clicked', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown({
        popularity: ['low', 'med'] as PopularityLevel[],
      });

      const clearButton = screen.getByLabelText('Clear Popularity filter');
      await user.click(clearButton);

      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ popularity: [] })
      );
    });

    it('clears label filter when pill X is clicked', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown({
        labels: ['Republic'],
      });

      const clearButton = screen.getByLabelText('Clear Label filter');
      await user.click(clearButton);

      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ labels: [] })
      );
    });
  });

  describe('clear all', () => {
    it('shows "Clear all filters" when any filter is active', () => {
      renderDropdown({ releaseTypes: ['album'] as ReleaseType[] });

      expect(screen.getByText('Clear all filters')).toBeInTheDocument();
    });

    it('does not show "Clear all filters" when no filters are active', () => {
      renderDropdown();

      expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument();
    });

    it('resets all filters when "Clear all" is clicked', async () => {
      const user = userEvent.setup();
      const { onFiltersChange } = renderDropdown({
        releaseTypes: ['album'] as ReleaseType[],
        popularity: ['high'] as PopularityLevel[],
        labels: ['Republic'],
      });

      const clearAll = screen.getByText('Clear all filters');
      await user.click(clearAll);

      expect(onFiltersChange).toHaveBeenCalledWith({
        releaseTypes: [],
        popularity: [],
        labels: [],
      });
    });
  });
});
