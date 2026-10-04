import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DisplayMenuDropdown } from './DisplayMenuDropdown';

const COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'status', label: 'Status' },
];

describe('DisplayMenuDropdown', () => {
  it('opens the display menu from the default trigger', async () => {
    const user = userEvent.setup();
    render(<DisplayMenuDropdown />);

    expect(screen.queryByText('Display properties')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /display/i }));

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('closes the popover via the canonical close control', async () => {
    const user = userEvent.setup();
    render(<DisplayMenuDropdown />);

    await user.click(screen.getByRole('button', { name: /display/i }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByRole('button', { name: 'Close' })
    ).not.toBeInTheDocument();
  });

  it('switches view modes when list/board options are available', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(
      <DisplayMenuDropdown
        viewMode='list'
        availableViewModes={['list', 'board']}
        onViewModeChange={onViewModeChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('button', { name: 'Board View' }));

    expect(onViewModeChange).toHaveBeenCalledWith('board');
  });

  it('hides the view mode toggle with a single available mode', async () => {
    const user = userEvent.setup();
    render(
      <DisplayMenuDropdown
        viewMode='list'
        availableViewModes={['list']}
        onViewModeChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /display/i }));

    expect(
      screen.queryByRole('button', { name: 'Board View' })
    ).not.toBeInTheDocument();
  });

  it('toggles column visibility with the column id and next state', async () => {
    const user = userEvent.setup();
    const onColumnVisibilityChange = vi.fn();
    render(
      <DisplayMenuDropdown
        availableColumns={COLUMNS}
        columnVisibility={{ name: true, status: false }}
        onColumnVisibilityChange={onColumnVisibilityChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('button', { name: 'Hide Name column' }));
    await user.click(
      screen.getByRole('button', { name: 'Show Status column' })
    );

    expect(onColumnVisibilityChange).toHaveBeenCalledWith('name', false);
    expect(onColumnVisibilityChange).toHaveBeenCalledWith('status', true);
  });

  it('changes density through the density options', async () => {
    const user = userEvent.setup();
    const onDensityChange = vi.fn();
    render(
      <DisplayMenuDropdown density='normal' onDensityChange={onDensityChange} />
    );

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('button', { name: 'Compact' }));

    expect(onDensityChange).toHaveBeenCalledWith('compact');
  });

  it('toggles grouping with the inverted current state', async () => {
    const user = userEvent.setup();
    const onGroupingToggle = vi.fn();
    render(
      <DisplayMenuDropdown
        groupingEnabled={false}
        onGroupingToggle={onGroupingToggle}
      />
    );

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('switch', { name: 'Group rows' }));

    expect(onGroupingToggle).toHaveBeenCalledWith(true);
  });
});
