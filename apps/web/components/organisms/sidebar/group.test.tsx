import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from './group';

describe('SidebarGroup', () => {
  it('runs the group action from pointer and keyboard input', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { container } = render(
      <SidebarGroup>
        <SidebarGroupLabel>Playlists</SidebarGroupLabel>
        <SidebarGroupAction aria-label='Add playlist' onClick={onAdd}>
          +
        </SidebarGroupAction>
        <SidebarGroupContent>
          <p>No playlists yet</p>
        </SidebarGroupContent>
      </SidebarGroup>
    );

    const action = screen.getByRole('button', { name: 'Add playlist' });
    await user.click(action);
    await user.keyboard('{Enter}');
    expect(action).toHaveFocus();
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-sidebar="group"]')).toContainElement(
      screen.getByText('No playlists yet')
    );
    await expectNoA11yViolations(container);
  });

  it('renders the label as a child element when asked', () => {
    render(
      <SidebarGroupLabel asChild>
        <h2>Library</h2>
      </SidebarGroupLabel>
    );
    const heading = screen.getByRole('heading', { name: 'Library' });
    expect(heading).toHaveAttribute('data-sidebar', 'group-label');
  });

  it.each([
    [
      'content only',
      <SidebarGroup key='group'>
        <SidebarGroupContent>
          <p>Group content</p>
        </SidebarGroupContent>
      </SidebarGroup>,
    ],
    [
      'long label',
      <SidebarGroup key='group'>
        <SidebarGroupLabel>
          Playlists for The Extraordinarily Long Album Title (Deluxe Anniversary
          Remastered Edition)
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <p>Group content</p>
        </SidebarGroupContent>
      </SidebarGroup>,
    ],
    [
      'right-to-left',
      <div key='group' dir='rtl' lang='ar'>
        <SidebarGroup>
          <SidebarGroupLabel>قوائم التشغيل</SidebarGroupLabel>
          <SidebarGroupAction aria-label='إضافة قائمة تشغيل'>
            +
          </SidebarGroupAction>
          <SidebarGroupContent>
            <p>محتوى المجموعة</p>
          </SidebarGroupContent>
        </SidebarGroup>
      </div>,
    ],
  ])('has no axe violations in the %s state', async (_label, ui) => {
    const { container } = render(ui);
    await expectNoA11yViolations(container);
  });
});
