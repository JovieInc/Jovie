import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const toggleSidebar = vi.hoisted(() => vi.fn());
vi.mock('./context', () => ({
  useSidebar: () => ({ state: 'open', toggleSidebar }),
}));

import { SidebarRail, SidebarShortcutHint, SidebarTrigger } from './controls';

describe('sidebar controls', () => {
  it('toggles the sidebar and calls the trigger handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(<SidebarTrigger onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(toggleSidebar).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps the rail focusable and toggles the open sidebar', async () => {
    toggleSidebar.mockClear();
    const user = userEvent.setup();
    const { container } = render(<SidebarRail />);
    const rail = screen.getByRole('button', { name: 'Toggle Sidebar' });
    expect(rail).toHaveAttribute('aria-expanded', 'true');
    expect(rail).toHaveAttribute('data-slot', 'plain-button');
    await user.tab();
    expect(rail).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(toggleSidebar).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps a long accessible label usable in RTL', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <SidebarTrigger aria-label='Toggle the navigation sidebar and return to your workspace' />
      </div>
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle the navigation sidebar and return to your workspace',
      })
    );
    await expectNoA11yViolations(container);
  });

  it('shows the shortcut hint', async () => {
    const { container } = render(<SidebarShortcutHint />);
    expect(screen.getByText(/.+/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
