import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CookieActions } from './CookieActions';

function renderActions(
  props: Partial<Parameters<typeof CookieActions>[0]> = {}
) {
  const handlers = {
    onAcceptAll: vi.fn(),
    onRejectAll: vi.fn(),
    onCustomize: vi.fn(),
  };
  const view = render(<CookieActions {...handlers} {...props} />);
  return { ...view, ...handlers };
}

describe('CookieActions', () => {
  it('runs exactly the handler of the consent choice the visitor clicks', async () => {
    const user = userEvent.setup();
    const { container, onAcceptAll, onRejectAll, onCustomize } =
      renderActions();

    await user.click(screen.getByRole('button', { name: 'Reject all' }));
    expect(onRejectAll).toHaveBeenCalledTimes(1);
    expect(onAcceptAll).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Customize' }));
    expect(onCustomize).toHaveBeenCalledTimes(1);
    expect(onRejectAll).toHaveBeenCalledTimes(1);

    await expectNoA11yViolations(container);
  });

  it('keeps every action reachable by keyboard in reading order', async () => {
    const user = userEvent.setup();
    const { container, onRejectAll } = renderActions({ compact: true });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Reject all' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRejectAll).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Accept all' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Customize' })).toHaveFocus();

    await expectNoA11yViolations(container);
  });

  it('ignores clicks while a consent save is in flight', async () => {
    const user = userEvent.setup();
    const { container, onAcceptAll, onRejectAll, onCustomize } = renderActions({
      compact: true,
      disabled: true,
    });

    for (const name of ['Reject all', 'Accept all', 'Customize']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(onRejectAll).not.toHaveBeenCalled();
    expect(onAcceptAll).not.toHaveBeenCalled();
    expect(onCustomize).not.toHaveBeenCalled();

    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <CookieActions
          compact
          onAcceptAll={vi.fn()}
          onRejectAll={vi.fn()}
          onCustomize={vi.fn()}
        />
      </div>
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });
});
