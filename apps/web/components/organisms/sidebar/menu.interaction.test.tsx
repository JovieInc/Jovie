import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidebarMenuButton } from './menu';

vi.mock('./context', () => ({
  useSidebar: () => ({ isMobile: false }),
}));

describe('SidebarMenuButton hover interactions', () => {
  it('uses the sidebar hover token and preserves selection through pointer and keyboard input', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <SidebarMenuButton isActive onClick={onClick}>
        Library
      </SidebarMenuButton>
    );
    const button = screen.getByRole('button', { name: 'Library' });

    await user.hover(button);
    expect(button).toHaveClass('hover:bg-sidebar-accent');
    expect(button).toHaveAttribute('data-active', 'true');
    await user.unhover(button);
    await user.tab();
    expect(button).toHaveFocus();
    expect(button).toHaveClass('focus-visible:bg-sidebar-accent');
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('data-active', 'true');
  });

  it('keeps unselected disabled rows inert under pointer input', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <SidebarMenuButton disabled onClick={onClick}>
        Library
      </SidebarMenuButton>
    );
    const button = screen.getByRole('button', { name: 'Library' });
    await user.hover(button);
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-active', 'false');
    expect(button).toHaveClass('disabled:pointer-events-none');
    expect(onClick).not.toHaveBeenCalled();
  });
});
