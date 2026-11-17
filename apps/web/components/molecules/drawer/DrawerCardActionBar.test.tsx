import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Check, Copy, ExternalLink, Pin, Share2, Star } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerCardActionBar } from './DrawerCardActionBar';

function action(
  id: string,
  label: string,
  extra: Partial<DrawerHeaderAction> = {}
): DrawerHeaderAction {
  return { id, label, icon: Pin, onClick: vi.fn(), ...extra };
}

async function openOverflow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  return screen.findByRole('menu');
}

describe('DrawerCardActionBar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing without actions, menu items or close', async () => {
    const { container } = render(<DrawerCardActionBar primaryActions={[]} />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('calls a primary action and shows at most three inline', async () => {
    const user = userEvent.setup();
    const pin = action('pin', 'Pin');
    const { container } = render(
      <DrawerCardActionBar
        primaryActions={[
          pin,
          action('share', 'Share', { icon: Share2 }),
          action('copy', 'Copy', { icon: Copy }),
          action('star', 'Star', { icon: Star }),
        ]}
      />
    );

    const bar = screen.getByTestId('drawer-card-action-bar');
    expect(bar).toHaveAttribute('data-overflow-placement', 'inline');
    expect(
      within(bar)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['Pin', 'Share', 'Copy']);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Pin' }));
    expect(pin.onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders href actions as links and disabled and active actions', async () => {
    const user = userEvent.setup();
    const disabled = action('share', 'Share', { disabled: true });
    const { container } = render(
      <DrawerCardActionBar
        primaryActions={[
          action('open', 'Open', { href: '/r/release', icon: ExternalLink }),
          disabled,
          action('copy', 'Copied', {
            icon: Copy,
            activeIcon: Check,
            isActive: true,
          }),
        ]}
      />
    );

    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/r/release'
    );
    const share = screen.getByRole('button', { name: 'Share' });
    expect(share).toBeDisabled();
    await user.click(share);
    expect(disabled.onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copied' })).toHaveClass(
      'text-primary-token'
    );
    await expectNoA11yViolations(container);
  });

  it('runs overflow actions and appends close to the inline menu', async () => {
    const user = userEvent.setup();
    const favorite = action('favorite', 'Favorite', { icon: Star });
    const onClose = vi.fn();
    render(
      <DrawerCardActionBar
        primaryActions={[action('pin', 'Pin')]}
        overflowActions={[favorite]}
        onClose={onClose}
      />
    );

    const menu = await openOverflow(user);
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map(item => item.textContent)).toEqual(['Favorite', 'Close']);
    await expectNoA11yViolations(menu);
    await user.click(within(menu).getByRole('menuitem', { name: 'Favorite' }));
    expect(favorite.onClick).toHaveBeenCalledTimes(1);

    const reopened = await openOverflow(user);
    await user.click(within(reopened).getByRole('menuitem', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens an href overflow action in a new tab', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    render(
      <DrawerCardActionBar
        primaryActions={[]}
        overflowActions={[
          {
            id: 'site',
            label: 'Open site',
            icon: ExternalLink,
            href: 'https://jov.ie',
          },
        ]}
      />
    );

    const menu = await openOverflow(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Open site' }));
    expect(open).toHaveBeenCalledWith(
      'https://jov.ie',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('prefers shared menu items over overflow actions', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <DrawerCardActionBar
        primaryActions={[action('pin', 'Pin')]}
        overflowActions={[action('favorite', 'Favorite')]}
        menuItems={[
          { type: 'action', id: 'rename', label: 'Rename', onClick: onRename },
        ]}
      />
    );

    const menu = await openOverflow(user);
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Rename']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('floats a close button at the card corner in card-top-right placement', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <DrawerCardActionBar
        primaryActions={[action('pin', 'Pin')]}
        onClose={onClose}
        overflowTriggerPlacement='card-top-right'
      />
    );

    const bar = screen.getByTestId('drawer-card-action-bar');
    expect(bar).toHaveAttribute('data-overflow-placement', 'card-top-right');
    expect(bar).toHaveClass('pr-11');
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    await user.click(screen.getByTestId('drawer-card-close-trigger'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('pairs the overflow trigger with the floating close in card-top-right', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DrawerCardActionBar
        primaryActions={[]}
        overflowActions={[action('favorite', 'Favorite')]}
        onClose={onClose}
        overflowTriggerPlacement='card-top-right'
      />
    );

    expect(screen.getByTestId('drawer-card-overflow-trigger')).toBeVisible();
    const menu = await openOverflow(user);
    // The floating close button replaces the menu's close row.
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Favorite']);
  });

  it('keeps long and RTL labels axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DrawerCardActionBar
          primaryActions={[
            action('copy', 'Copy smart link to clipboard', { icon: Copy }),
            action('share', 'مشاركة', { icon: Share2 }),
          ]}
          overflowActions={[action('favorite', 'المفضلة')]}
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'Copy smart link to clipboard' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'مشاركة' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
