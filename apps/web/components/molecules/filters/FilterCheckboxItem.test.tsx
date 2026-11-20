import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FilterCheckboxItem } from './FilterCheckboxItem';

describe('FilterCheckboxItem', () => {
  it('renders both count and checkmark when a counted option is selected', async () => {
    const { container } = render(
      <div role='menu'>
        <FilterCheckboxItem
          label='Todo'
          count={2}
          checked
          onCheckedChange={vi.fn()}
        />
      </div>
    );

    const row = screen.getByRole('menuitemcheckbox', { name: /Todo/ });

    expect(row).toHaveAttribute('data-slot', 'plain-button');
    expect(row).toHaveAttribute('type', 'button');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row).toHaveAttribute('aria-checked', 'true');
    expect(row.querySelector('[data-menu-trailing]')).toHaveTextContent('2');
    expect(row.querySelector('svg')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('exposes checkbox menu semantics for assistive technology', async () => {
    const { container } = render(
      <div role='menu'>
        <FilterCheckboxItem
          label='Needs Review'
          checked={false}
          onCheckedChange={vi.fn()}
        />
      </div>
    );

    const row = screen.getByRole('menuitemcheckbox', { name: 'Needs Review' });

    expect(row).toHaveAttribute('aria-checked', 'false');
    await expectNoA11yViolations(container);
  });

  it('supports keyboard selection with Enter', () => {
    const onCheckedChange = vi.fn();

    render(
      <FilterCheckboxItem
        label='Todo'
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('menuitemcheckbox', { name: 'Todo' }), {
      key: 'Enter',
    });

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });

  it('preserves click and keyboard focus navigation', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const searchRef = createRef<HTMLInputElement>();
    const { container } = render(
      <>
        <input ref={searchRef} aria-label='Search filters' />
        <div role='menu'>
          <FilterCheckboxItem
            label='First'
            checked={false}
            onCheckedChange={onCheckedChange}
            searchInputRef={searchRef}
          />
          <FilterCheckboxItem
            label='Second'
            checked
            onCheckedChange={onCheckedChange}
            searchInputRef={searchRef}
          />
        </div>
      </>
    );
    const first = screen.getByRole('menuitemcheckbox', { name: 'First' });
    const second = screen.getByRole('menuitemcheckbox', { name: 'Second' });
    await user.click(first);
    expect(onCheckedChange).toHaveBeenCalledOnce();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(searchRef.current).toHaveFocus();
    first.focus();
    await user.keyboard('{Escape}');
    expect(searchRef.current).toHaveFocus();
    await expectNoA11yViolations(container);
  });
});
