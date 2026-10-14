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
  it('keeps each mounted search independently addressable for focus recovery', () => {
    render(
      <>
        <CmdKMainPlaneSearchInput {...baseProps} open={false} />
        <CmdKMainPlaneSearchInput
          {...baseProps}
          open={false}
          listId='second-results'
        />
      </>
    );
    const [first, second] = screen.getAllByRole('combobox', {
      name: 'Command Palette Search',
    });
    expect(first.id).not.toBe(second.id);
    for (const input of [first, second]) {
      const recovered = document.getElementById(
        `${input.getAttribute('aria-controls')}-input`
      );
      expect(recovered).toBe(input);
      recovered?.focus();
      expect(input).toHaveFocus();
    }
  });

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

  it('keeps every keystroke when the parent echoes the value a commit late', () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(
      <CmdKMainPlaneSearchInput {...baseProps} onQueryChange={onQueryChange} />
    );
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });

    // Header slot re-renders with stale values while the user keeps typing.
    let typed = '';
    for (const char of 'settings') {
      typed += char;
      fireEvent.change(input, { target: { value: typed } });
      rerender(
        <CmdKMainPlaneSearchInput
          {...baseProps}
          value={typed.slice(0, -1)}
          onQueryChange={onQueryChange}
        />
      );
      expect(input).toHaveValue(typed);
    }
    expect(onQueryChange).toHaveBeenLastCalledWith('settings');
  });

  it('accepts an external reset that the user never typed', () => {
    const { rerender } = render(
      <CmdKMainPlaneSearchInput {...baseProps} value='' />
    );
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'rel' } });
    rerender(<CmdKMainPlaneSearchInput {...baseProps} value='rel' />);
    rerender(<CmdKMainPlaneSearchInput {...baseProps} value='Releases' />);
    expect(input).toHaveValue('Releases');
  });
});
