import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MobileProfileDrawer } from './MobileProfileDrawer';

describe('MobileProfileDrawer', () => {
  it('opens the profile panel when pressed', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(<MobileProfileDrawer onOpen={onOpen} />);
    const trigger = screen.getByRole('button', { name: 'Open Profile Panel' });
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('data-slot', 'plain-button');
    expect(trigger).toHaveClass('h-8', 'w-8', 'lg:hidden');

    await user.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('opens from the keyboard', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<MobileProfileDrawer onOpen={onOpen} />);
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Open Profile Panel' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('stays axe-clean right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MobileProfileDrawer onOpen={vi.fn()} />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
