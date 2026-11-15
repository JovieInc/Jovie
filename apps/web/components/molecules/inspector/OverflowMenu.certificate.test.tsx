import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OverflowMenu } from './OverflowMenu';

describe('OverflowMenu certificate', () => {
  it('disables the trigger when there are no verbs, axe-clean', async () => {
    const { container } = render(
      <OverflowMenu label='Share link actions' items={[]} />
    );
    expect(
      screen.getByRole('button', { name: 'Share link actions' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('disables the trigger when the caller disables it', () => {
    render(
      <OverflowMenu
        label='Share link actions'
        disabled
        items={[{ id: 'open', label: 'Open', onSelect: vi.fn() }]}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Share link actions' })
    ).toBeDisabled();
  });

  it('calls only the chosen verb and never a disabled one', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onCopy = vi.fn();
    const onRevoke = vi.fn();
    render(
      <OverflowMenu
        label='Share link actions'
        items={[
          { id: 'open', label: 'Open', onSelect: onOpen },
          { id: 'copy', label: 'Copy link', onSelect: onCopy, disabled: true },
          {
            id: 'revoke',
            label: 'Revoke private link',
            variant: 'destructive',
            separatorBefore: true,
            onSelect: onRevoke,
          },
        ]}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Share link actions' })
    );
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    await expectNoA11yViolations(screen.getByRole('menu'));
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(onCopy).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('menuitem', { name: 'Revoke private link' })
    );
    expect(onRevoke).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renders an RTL trigger with Arabic verbs axe-clean', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OverflowMenu
          label='إجراءات الرابط'
          items={[{ id: 'open', label: 'فتح', onSelect: onOpen }]}
        />
      </div>
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'إجراءات الرابط' }));
    await user.click(screen.getByRole('menuitem', { name: 'فتح' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
