import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  it('retains typed input and focus through rerender, Escape and blur recovery', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    const onKeyDown = vi.fn();
    const props = { ...baseProps, onQueryChange, onKeyDown };
    const { rerender } = render(<CmdKMainPlaneSearchInput {...props} />);
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });

    await user.type(input, 'Release plan');
    rerender(<CmdKMainPlaneSearchInput {...props} activeRowId={null} />);
    expect(input).toHaveValue('Release plan');
    expect(input).toHaveFocus();
    expect(onQueryChange).toHaveBeenLastCalledWith('Release plan');

    await user.keyboard('{Escape}');
    expect(onKeyDown.mock.lastCall?.[0].key).toBe('Escape');
    expect(input).toHaveValue('Release plan');
    expect(input).toHaveFocus();

    input.blur();
    expect(input).not.toHaveFocus();
    rerender(<CmdKMainPlaneSearchInput {...props} open={false} />);
    expect(input).toHaveValue('Release plan');
    expect(input).not.toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    rerender(<CmdKMainPlaneSearchInput {...props} open />);
    expect(input).toHaveValue('Release plan');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it.each([
    { state: 'empty', value: '', open: true, activeRowId: null, dir: 'ltr' },
    {
      state: 'active',
      value: 'Release plan',
      open: true,
      activeRowId: 'palette-row-1',
      dir: 'ltr',
    },
    {
      state: 'long content',
      value:
        'Find the release plan and all upcoming tasks for the next international tour',
      open: true,
      activeRowId: null,
      dir: 'ltr',
    },
    {
      state: 'RTL overflow',
      value: 'ابحث عن خطة الإصدار وجميع المهام القادمة للجولة الدولية التالية',
      open: true,
      activeRowId: null,
      dir: 'rtl',
    },
    {
      state: 'closed',
      value: 'Release plan',
      open: false,
      activeRowId: null,
      dir: 'ltr',
    },
  ])(
    'has no axe violations in the $state state',
    async ({ state: _state, dir, ...props }) => {
      const { container } = render(
        <div dir={dir}>
          <p id='palette-description'>Type to search every matching item.</p>
          <CmdKMainPlaneSearchInput {...baseProps} {...props} />
          <div id='palette-results' role='listbox' aria-label='Search Results'>
            <div
              id='palette-row-1'
              role='option'
              tabIndex={-1}
              aria-selected={props.activeRowId !== null}
            >
              Release plan
            </div>
          </div>
        </div>
      );
      await expectNoA11yViolations(container);
    }
  );

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
