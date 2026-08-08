import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Music } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerNavMoreMenu } from './CustomerNavMoreMenu';
import type { NavItem } from './types';

const moreItems: NavItem[] = [
  {
    id: 'labs',
    name: 'Labs',
    href: '/app/labs',
    icon: Music,
    tier: 'experimental',
  },
  {
    id: 'signals',
    name: 'Signals',
    href: '/app/signals',
    icon: Music,
    tier: 'experimental',
  },
];

describe('CustomerNavMoreMenu', () => {
  it('renders nothing when there are no overflow destinations', () => {
    const { container } = render(
      <ul>
        <CustomerNavMoreMenu items={[]} isItemActive={() => false} />
      </ul>
    );
    expect(container.querySelector('[data-customer-nav-more]')).toBeNull();
  });

  it('exposes one More trigger and keyboard-accessible overflow links', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();

    render(
      <ul>
        <CustomerNavMoreMenu
          items={moreItems}
          isItemActive={item => item.id === 'signals'}
          onActivate={onActivate}
        />
      </ul>
    );

    const trigger = screen.getByRole('button', { name: 'More options' });
    expect(trigger).toHaveAttribute('data-has-active-overflow', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('aria-label', 'More Navigation');
    const links = within(menu).getAllByRole('menuitem');
    expect(links.map(link => link.textContent?.trim())).toEqual([
      'Labs',
      'Signals',
    ]);
    expect(links[1]).toHaveAttribute('aria-current', 'page');

    links[0]!.addEventListener('click', event => event.preventDefault());
    await user.click(links[0]!);
    expect(onActivate).toHaveBeenCalledWith(
      moreItems[0],
      expect.stringMatching(/pointer|keyboard/)
    );
  });

  it('keeps its label in the full grid track with a right-edge fade', () => {
    render(
      <ul>
        <CustomerNavMoreMenu items={moreItems} isItemActive={() => false} />
      </ul>
    );

    const label = screen.getByText('More');
    expect(label.className).toContain('w-full');
    expect(label.className).toContain('justify-self-stretch');
    expect(label.className).toContain('overflow-hidden');
    expect(label.className).toContain('mask-image:linear-gradient');
    expect(label.className).not.toContain('justify-self-start');
  });
});
