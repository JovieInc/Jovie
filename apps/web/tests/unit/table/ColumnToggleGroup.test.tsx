import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  type ColumnConfig,
  ColumnToggleGroup,
  createInitialVisibility,
} from '@/components/admin/table/molecules/ColumnToggleGroup';

const mockColumns: ColumnConfig[] = [
  { id: 'avatar', label: 'Creator', canToggle: false, defaultVisible: true },
  {
    id: 'social',
    label: 'Social Links',
    canToggle: true,
    defaultVisible: true,
  },
  { id: 'created', label: 'Created', canToggle: true, defaultVisible: true },
  { id: 'verified', label: 'Verified', canToggle: true, defaultVisible: false },
];

describe('ColumnToggleGroup', () => {
  it('renders all columns as toggles', () => {
    render(
      <ColumnToggleGroup
        columns={mockColumns}
        visibility={{
          avatar: true,
          social: true,
          created: true,
          verified: false,
        }}
        onVisibilityChange={vi.fn()}
      />
    );

    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(screen.getByText('Social Links')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('shows correct visibility state for each toggle', () => {
    render(
      <ColumnToggleGroup
        columns={mockColumns}
        visibility={{
          avatar: true,
          social: true,
          created: false,
          verified: false,
        }}
        onVisibilityChange={vi.fn()}
      />
    );

    const toggles = screen.getAllByRole('switch');

    // Avatar is always visible (non-toggleable)
    expect(toggles[0]).toHaveAttribute('aria-checked', 'true');
    // Social is visible
    expect(toggles[1]).toHaveAttribute('aria-checked', 'true');
    // Created is hidden
    expect(toggles[2]).toHaveAttribute('aria-checked', 'false');
    // Verified is hidden
    expect(toggles[3]).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onVisibilityChange when toggle is clicked', () => {
    const handleVisibilityChange = vi.fn();

    render(
      <ColumnToggleGroup
        columns={mockColumns}
        visibility={{
          avatar: true,
          social: true,
          created: true,
          verified: false,
        }}
        onVisibilityChange={handleVisibilityChange}
      />
    );

    // Click on Social Links toggle (to hide it)
    fireEvent.click(screen.getByText('Social Links'));

    expect(handleVisibilityChange).toHaveBeenCalledWith('social', false);
  });

  it('disables non-toggleable columns', () => {
    render(
      <ColumnToggleGroup
        columns={mockColumns}
        visibility={{
          avatar: true,
          social: true,
          created: true,
          verified: false,
        }}
        onVisibilityChange={vi.fn()}
      />
    );

    // Creator column should be disabled
    const creatorToggle = screen.getByText('Creator').closest('button');
    expect(creatorToggle).toBeDisabled();
  });

  it('has fieldset with aria-label and legend', () => {
    render(
      <ColumnToggleGroup
        columns={mockColumns}
        visibility={{
          avatar: true,
          social: true,
          created: true,
          verified: false,
        }}
        onVisibilityChange={vi.fn()}
        label='Test column visibility'
      />
    );

    // fieldset provides the group role semantically
    const fieldset = screen.getByRole('group');
    expect(fieldset).toHaveAttribute('aria-label', 'Test column visibility');
    // Legend is present but visually hidden (sr-only)
    expect(screen.getByText('Test column visibility')).toBeInTheDocument();
  });

  it('uses default visibility from config when not specified', () => {
    render(
      <ColumnToggleGroup
        columns={mockColumns}
        visibility={{}}
        onVisibilityChange={vi.fn()}
      />
    );

    const toggles = screen.getAllByRole('switch');

    // Should use defaultVisible from column config
    expect(toggles[0]).toHaveAttribute('aria-checked', 'true'); // avatar default true
    expect(toggles[1]).toHaveAttribute('aria-checked', 'true'); // social default true
    expect(toggles[2]).toHaveAttribute('aria-checked', 'true'); // created default true
    expect(toggles[3]).toHaveAttribute('aria-checked', 'false'); // verified default false
  });

  it('applies custom className', () => {
    render(
      <ColumnToggleGroup
        columns={mockColumns}
        visibility={{}}
        onVisibilityChange={vi.fn()}
        className='custom-class'
        data-testid='toggle-group'
      />
    );

    const group = screen.getByTestId('toggle-group');
    expect(group).toHaveClass('custom-class');
  });
});

describe('createInitialVisibility', () => {
  it('creates correct initial state from column config', () => {
    const result = createInitialVisibility(mockColumns);

    expect(result).toEqual({
      avatar: true,
      social: true,
      created: true,
      verified: false,
    });
  });

  it('sets non-toggleable columns to always visible', () => {
    const columns: ColumnConfig[] = [
      {
        id: 'required',
        label: 'Required',
        canToggle: false,
        defaultVisible: false,
      },
      {
        id: 'optional',
        label: 'Optional',
        canToggle: true,
        defaultVisible: false,
      },
    ];

    const result = createInitialVisibility(columns);

    // Required column should be true even with defaultVisible: false
    expect(result.required).toBe(true);
    // Optional column respects defaultVisible
    expect(result.optional).toBe(false);
  });

  it('defaults to visible when defaultVisible not specified', () => {
    const columns: ColumnConfig[] = [
      { id: 'no-default', label: 'No Default', canToggle: true },
    ];

    const result = createInitialVisibility(columns);

    expect(result['no-default']).toBe(true);
  });
});
