import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AtSign } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarLinkRow } from './SidebarLinkRow';

const baseProps = {
  icon: <AtSign aria-hidden='true' />,
  label: 'Website',
  url: 'https://example.com',
};

describe('SidebarLinkRow keyboard menu', () => {
  it('opens with the keyboard, navigates actions and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(
      <main>
        <SidebarLinkRow {...baseProps} />
      </main>
    );
    const trigger = screen.getByRole('button', { name: 'Actions for Website' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const open = await screen.findByRole('menuitem', { name: 'Open' });
    expect(open).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Copy URL' })).toHaveFocus();
    await expectNoA11yViolations(screen.getByRole('menu'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('skips unavailable URL actions and can remove an empty link by keyboard', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <SidebarLinkRow {...baseProps} url='  ' isEditable onRemove={onRemove} />
    );
    screen.getByRole('button', { name: 'Actions for Website' }).focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('menuitem', { name: 'Open' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Copy URL' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    const remove = screen.getByRole('menuitem', { name: 'Delete' });
    expect(remove).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRemove).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('keeps pending removal unavailable in the dropdown', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <SidebarLinkRow
        {...baseProps}
        isEditable
        isRemoving
        onRemove={onRemove}
      />
    );
    screen.getByRole('button', { name: 'Actions for Website' }).focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('menuitem', { name: 'Delete' })
    ).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Copy URL' })).toHaveFocus();
    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe('SidebarLinkRow accessibility', () => {
  it.each([
    { state: 'default', props: {} },
    { state: 'editable', props: { isEditable: true, onRemove: vi.fn() } },
    {
      state: 'removing',
      props: { isEditable: true, isRemoving: true, onRemove: vi.fn() },
    },
    { state: 'empty URL', props: { url: '' } },
    { state: 'partial', props: { icon: null, badge: 'Custom' } },
    {
      state: 'long content',
      props: {
        label:
          'Official website with every release and all upcoming tour dates',
      },
    },
    {
      state: 'RTL',
      props: { label: 'الموقع الرسمي وجميع تواريخ الجولة القادمة' },
      dir: 'rtl',
    },
    { state: 'hidden link', props: { isVisible: false } },
    { state: 'track surface', props: { surfaceVariant: 'track' as const } },
  ])('has no axe violations in the $state state', async ({ props, dir }) => {
    const { container } = render(
      <div dir={dir}>
        <SidebarLinkRow {...baseProps} {...props} />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
