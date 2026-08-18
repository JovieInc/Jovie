import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CmdKMainPlaneSearchInput } from './CmdKMainPlaneSearchInput';

const baseProps = {
  value: '',
  open: true,
  onQueryChange: vi.fn(),
  onKeyDown: vi.fn(),
  listId: 'palette-results',
  activeRowId: 'palette-row-1',
  descriptionId: 'palette-description',
};

describe('CmdKMainPlaneSearchInput', () => {
  it('focuses on open and exposes the combobox relationships', () => {
    render(<CmdKMainPlaneSearchInput {...baseProps} />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-controls', 'palette-results');
    expect(input).toHaveAttribute('aria-activedescendant', 'palette-row-1');
    expect(input).toHaveAttribute('aria-describedby', 'palette-description');
  });

  it('renders the controlled value and delegates query changes', () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(
      <CmdKMainPlaneSearchInput {...baseProps} onQueryChange={onQueryChange} />
    );

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'Settings' } });
    expect(onQueryChange).toHaveBeenCalledWith('Settings');

    rerender(
      <CmdKMainPlaneSearchInput
        {...baseProps}
        value='Settings'
        onQueryChange={onQueryChange}
      />
    );
    expect(input).toHaveValue('Settings');
  });

  it('delegates keyboard commands without bubbling through the shell header', () => {
    const onKeyDown = vi.fn();
    const parentKeyDown = vi.fn();
    render(
      <form onKeyDown={parentKeyDown}>
        <CmdKMainPlaneSearchInput
          {...baseProps}
          activeRowId={null}
          onKeyDown={onKeyDown}
        />
      </form>
    );

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(parentKeyDown).not.toHaveBeenCalled();
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });
});
