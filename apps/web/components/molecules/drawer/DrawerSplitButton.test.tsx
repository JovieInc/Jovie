import type { CommonDropdownItem } from '@jovie/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pin } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  DrawerSplitButton,
  type DrawerSplitButtonAction,
} from './DrawerSplitButton';

function primary(
  extra: Partial<DrawerSplitButtonAction> = {}
): DrawerSplitButtonAction {
  return {
    ariaLabel: 'Pin',
    label: 'Pin',
    icon: <Pin aria-hidden='true' />,
    onClick: vi.fn(),
    ...extra,
  };
}

function menu(onShare = vi.fn(), onDelete = vi.fn()): CommonDropdownItem[] {
  return [
    { id: 'share', type: 'action', label: 'Share', onClick: onShare },
    {
      id: 'delete',
      type: 'action',
      label: 'Delete',
      onClick: onDelete,
      variant: 'destructive',
    },
  ];
}

describe('DrawerSplitButton', () => {
  it('renders nothing without a primary action or menu items (empty)', async () => {
    const { container } = render(<DrawerSplitButton />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders a single labelled button when there is no menu', async () => {
    const user = userEvent.setup();
    const action = primary({ testId: 'pin-button' });
    const { container } = render(<DrawerSplitButton primaryAction={action} />);

    const button = screen.getByRole('button', { name: 'Pin' });
    expect(button).toHaveAttribute('data-testid', 'pin-button');
    expect(button).toHaveClass('rounded-full', 'px-2.5');
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    await user.click(button);
    expect(action.onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders an icon-only primary as a square button', () => {
    render(<DrawerSplitButton primaryAction={primary({ label: undefined })} />);

    const button = screen.getByRole('button', { name: 'Pin' });
    expect(button).toHaveClass('w-7', 'px-0');
    expect(button).toHaveTextContent('');
  });

  it('keeps a disabled primary from firing', async () => {
    const user = userEvent.setup();
    const action = primary({ disabled: true });
    render(<DrawerSplitButton primaryAction={action} />);

    const button = screen.getByRole('button', { name: 'Pin' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(action.onClick).not.toHaveBeenCalled();
  });

  it('opens the menu from a menu-only trigger (partial)', async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    const { container } = render(
      <DrawerSplitButton
        menuItems={menu(onShare)}
        menuAriaLabel='Release actions'
      />
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Release actions' }));
    const list = await screen.findByRole('menu');
    expect(
      within(list)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Share', 'Delete']);
    await user.click(within(list).getByRole('menuitem', { name: 'Share' }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('splits a primary action and the menu in one pill', async () => {
    const user = userEvent.setup();
    const action = primary();
    const onDelete = vi.fn();
    const { container } = render(
      <DrawerSplitButton
        primaryAction={action}
        menuItems={menu(vi.fn(), onDelete)}
        className='ml-2'
      />
    );

    expect(container.firstElementChild).toHaveClass('rounded-full', 'ml-2');
    await user.click(screen.getByRole('button', { name: 'Pin' }));
    expect(action.onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const list = await screen.findByRole('menu');
    await user.click(within(list).getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps long and RTL labels axe-clean', async () => {
    const label = 'Pin this release to the top of the catalog';
    const { container } = render(
      <div dir='rtl'>
        <DrawerSplitButton
          primaryAction={primary({ ariaLabel: label, label })}
          menuItems={menu()}
          menuAriaLabel='إجراءات أخرى'
        />
      </div>
    );

    expect(screen.getByRole('button', { name: label })).toHaveTextContent(
      label
    );
    expect(screen.getByRole('button', { name: 'إجراءات أخرى' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
