import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DesktopAuthTouchIdButton } from './DesktopAuthTouchIdButton';
import type { TouchIdState } from './desktop-auth-contract';

const NAME = 'Sign In With Touch ID';

describe('DesktopAuthTouchIdButton', () => {
  it.each<TouchIdState>(['idle', 'error'])(
    'starts Touch ID by click and keyboard while %s',
    async state => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const { container } = render(
        <DesktopAuthTouchIdButton state={state} onClick={onClick} />
      );

      const button = screen.getByRole('button', { name: NAME });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('data-auth-action', 'primary');
      await expectNoA11yViolations(container);

      await user.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledTimes(2);
    }
  );

  it.each<TouchIdState>(['working', 'signed-in'])(
    'cannot start a second prompt while %s',
    async state => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const { container } = render(
        <DesktopAuthTouchIdButton state={state} onClick={onClick} />
      );

      const button = screen.getByRole('button', { name: NAME });
      expect(button).toBeDisabled();
      await user.click(button);
      await user.tab();
      expect(onClick).not.toHaveBeenCalled();
      expect(button).not.toHaveFocus();
      await expectNoA11yViolations(container);
    }
  );

  it('forwards its ref so the client can focus the primary action', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement>();
    const { container, rerender } = render(
      <DesktopAuthTouchIdButton ref={ref} state='working' onClick={vi.fn()} />
    );
    expect(ref.current).toBe(screen.getByRole('button', { name: NAME }));

    // A failed prompt re-enables the same button without remounting it.
    rerender(
      <DesktopAuthTouchIdButton ref={ref} state='error' onClick={vi.fn()} />
    );
    await user.tab();
    expect(ref.current).toHaveFocus();
    await expectNoA11yViolations(container);
  });
});
