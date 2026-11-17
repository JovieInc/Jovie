import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarNavItem } from './SidebarNavItem';

describe('SidebarNavItem certificate', () => {
  it('activates the row on click and keyboard through the design-system button', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const { container } = render(
      <SidebarNavItem
        collapsed={false}
        item={{ label: 'Inbox', icon: House, active: true, onActivate }}
      />
    );
    const row = screen.getByRole('button', { name: 'Inbox' });
    expect(row).toHaveAttribute('data-slot', 'plain-button');
    expect(row).toHaveAttribute('type', 'button');
    expect(row).toHaveAttribute('aria-pressed', 'true');

    await user.click(row);
    expect(onActivate).toHaveBeenCalledTimes(1);

    row.blur();
    await user.tab();
    expect(row).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('keeps its own focus ring rather than the default plain-button ring', () => {
    render(
      <SidebarNavItem
        collapsed={false}
        item={{ label: 'Inbox', icon: House }}
      />
    );
    const row = screen.getByRole('button', { name: 'Inbox' });
    expect(row).toHaveClass('focus-visible:ring-ring/55');
    expect(row).not.toHaveClass('focus-visible:ring-focus');
  });

  it('renders a visual-only nested row without a pressed state', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SidebarNavItem
        collapsed={false}
        nested
        item={{ label: 'Audience', icon: Users }}
      />
    );
    const row = screen.getByRole('button', { name: 'Audience' });
    expect(row).not.toHaveAttribute('aria-pressed');
    await user.click(row);
    expect(row).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('clips a long label on one line', async () => {
    const label = 'Release planning for the summer single and every remix';
    const { container } = render(
      <SidebarNavItem collapsed={false} item={{ label, icon: House }} />
    );
    expect(screen.getByText(label)).toHaveClass(
      'overflow-hidden',
      'whitespace-nowrap'
    );
    await expectNoA11yViolations(container);
  });

  it('names the collapsed icon-only row and renders in a right-to-left rail', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SidebarNavItem collapsed item={{ label: 'الرئيسية', icon: House }} />
      </div>
    );
    expect(
      screen.getByRole('button', { name: 'الرئيسية' })
    ).toBeInTheDocument();
    expect(screen.queryByText('الرئيسية')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
