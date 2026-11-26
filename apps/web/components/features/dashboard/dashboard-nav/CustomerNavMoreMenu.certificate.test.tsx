import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Music } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CustomerNavMoreMenu } from './CustomerNavMoreMenu';
import type { NavItem } from './types';

const items: NavItem[] = [
  {
    id: 'labs',
    name: 'Labs',
    href: '/app/labs',
    icon: Music,
    tier: 'experimental',
  },
];

describe('CustomerNavMoreMenu certificate', () => {
  it('has an accessible closed trigger', async () => {
    const { container } = render(
      <ul>
        <CustomerNavMoreMenu items={items} isItemActive={() => false} />
      </ul>
    );
    expect(screen.getByRole('button', { name: 'More options' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('opens, prefetches on hover and closes after choosing an item', async () => {
    const user = userEvent.setup();
    const onPrefetch = vi.fn();
    const { container } = render(
      <ul>
        <CustomerNavMoreMenu
          items={items}
          isItemActive={() => true}
          onPrefetch={onPrefetch}
        />
      </ul>
    );
    const trigger = screen.getByRole('button', { name: 'More options' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const item = screen.getByRole('menuitem', { name: 'Labs' });
    await user.hover(item);
    expect(onPrefetch).toHaveBeenCalledWith('labs');
    await expectNoA11yViolations(container);
  });
});
