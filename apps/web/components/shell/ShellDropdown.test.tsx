import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    // Menu-role content keeps Radix's vertical orientation (valid on menu).
    expect(screen.getByRole('menu')).toHaveAttribute(
      'aria-orientation',
      'vertical'
    );
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
    // role="dialog" must not carry aria-orientation (aria-allowed-attr).
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-orientation');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    const filter = screen.getByLabelText('Filter Dropdown Items');
    fireEvent.change(filter, { target: { value: 'spot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filter' }));
    expect(filter).toHaveValue('');
  });

  it('shares the DS menu row geometry: concentric radius and 8px icon gap', () => {
    // Surface is --radius-xl with a --space-1 inset, so rows take the
    // matching inner radius, like OVERLAY_ITEM_RADIUS in packages/ui.
    const css = readFileSync(
      resolve(__dirname, '../../styles/system-b-app.css'),
      'utf8'
    );
    const row = /:where\(\.system-b-shell-dropdown-row\) \{[^}]*\}/.exec(
      css
    )?.[0];
    expect(row).toContain(
      'border-radius: var(--system-b-radius-overlay-inner);'
    );
    expect(row).toContain('gap: var(--space-2);');
  });
});
