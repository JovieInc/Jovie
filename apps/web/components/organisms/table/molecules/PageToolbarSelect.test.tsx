import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PAGE_TOOLBAR_ACTION_ACTIVE_CLASS } from '@/components/molecules/page-toolbar-classes';
import {
  PageToolbarSelect,
  type PageToolbarSelectOption,
} from './PageToolbarSelect';

const OPTIONS = [
  { value: 'all', label: 'All People', menuLabel: 'All People (1,204)' },
  { value: 'identified', label: 'Identified', menuLabel: 'Identified (312)' },
  {
    value: 'anonymous',
    label: 'Anonymous',
    menuLabel: 'Anonymous (892)',
    disabled: true,
  },
] as const satisfies readonly PageToolbarSelectOption<
  'all' | 'identified' | 'anonymous'
>[];

function renderSelect(
  props: Partial<{
    value: 'all' | 'identified' | 'anonymous';
    defaultValue: 'all' | undefined;
    onValueChange: (value: 'all' | 'identified' | 'anonymous') => void;
  }> = {}
) {
  const onValueChange = props.onValueChange ?? vi.fn();
  render(
    <PageToolbarSelect
      label='Identity'
      value={props.value ?? 'all'}
      defaultValue={
        'defaultValue' in props ? props.defaultValue : ('all' as const)
      }
      options={OPTIONS}
      onValueChange={onValueChange}
    />
  );
  return { onValueChange };
}

describe('PageToolbarSelect', () => {
  it('names the trigger with the group and the active label', () => {
    renderSelect();
    expect(
      screen.getByRole('button', { name: 'Identity: All People' })
    ).toBeVisible();
  });

  it('lists every option as a radio and checks the active one', async () => {
    const user = userEvent.setup();
    renderSelect({ value: 'identified' });
    await user.click(
      screen.getByRole('button', { name: 'Identity: Identified' })
    );

    const options = screen.getAllByRole('menuitemradio');
    expect(options.map(option => option.textContent)).toEqual([
      'All People (1,204)',
      'Identified (312)',
      'Anonymous (892)',
    ]);
    expect(
      screen.getByRole('menuitemradio', { name: 'Identified (312)' })
    ).toHaveAttribute('aria-checked', 'true');
    const trigger = screen.getByRole('button', {
      name: 'Identity: Identified',
      hidden: true,
    });
    expect(trigger).toBeVisible();
    expect(trigger).not.toHaveTextContent('1,204');
    expect(trigger).not.toHaveTextContent('312');
  });

  it('calls onValueChange once when an option is chosen', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderSelect();
    await user.click(
      screen.getByRole('button', { name: 'Identity: All People' })
    );
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Identified (312)' })
    );
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('identified');
  });

  it('applies the active class only when the value is not the default', () => {
    const { rerender } = render(
      <PageToolbarSelect
        label='Identity'
        value='all'
        defaultValue='all'
        options={OPTIONS}
        onValueChange={vi.fn()}
      />
    );
    const activeToken = PAGE_TOOLBAR_ACTION_ACTIVE_CLASS.split(' ').find(
      token => token === 'text-primary-token'
    );
    expect(activeToken).toBe('text-primary-token');
    expect(
      screen
        .getByRole('button', { name: 'Identity: All People' })
        .className.split(/\s+/)
    ).not.toContain('text-primary-token');

    rerender(
      <PageToolbarSelect
        label='Identity'
        value='identified'
        defaultValue='all'
        options={OPTIONS}
        onValueChange={vi.fn()}
      />
    );
    expect(
      screen
        .getByRole('button', { name: 'Identity: Identified' })
        .className.split(/\s+/)
    ).toContain('text-primary-token');

    rerender(
      <PageToolbarSelect
        label='Identity'
        value='identified'
        options={OPTIONS}
        onValueChange={vi.fn()}
      />
    );
    expect(
      screen
        .getByRole('button', { name: 'Identity: Identified' })
        .className.split(/\s+/)
    ).not.toContain('text-primary-token');
  });

  it('does not choose a disabled option', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderSelect();
    await user.click(
      screen.getByRole('button', { name: 'Identity: All People' })
    );
    const anonymous = screen.getByRole('menuitemradio', {
      name: 'Anonymous (892)',
    });
    expect(anonymous).toHaveAttribute('aria-disabled', 'true');
    await user.click(anonymous);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
