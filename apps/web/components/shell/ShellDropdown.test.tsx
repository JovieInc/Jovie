import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShellDropdown } from './ShellDropdown';

describe('ShellDropdown', () => {
  it('renders a plain menu without a filter when not searchable', () => {
    render(
      <ShellDropdown
        trigger={<button type='button'>Actions</button>}
        defaultOpen
        modal={false}
      >
        <ShellDropdown.Item label='Rename' onSelect={vi.fn()} />
      </ShellDropdown>
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.queryByRole('textbox', { name: 'Filter Dropdown Items' })
    ).toBeNull();
  });

  it('wraps a searchable menu in a named dialog with a clearable named filter', () => {
    render(
      <ShellDropdown
        trigger={<button type='button'>Choose a platform</button>}
        defaultOpen
        modal={false}
        searchable
      >
        <ShellDropdown.Item label='Spotify' onSelect={vi.fn()} />
        <ShellDropdown.Item label='Apple Music' onSelect={vi.fn()} />
      </ShellDropdown>
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Filter Menu'
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
    const filter = screen.getByLabelText('Filter Dropdown Items');
    fireEvent.change(filter, { target: { value: 'spot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filter' }));
    expect(filter).toHaveValue('');
  });
});
