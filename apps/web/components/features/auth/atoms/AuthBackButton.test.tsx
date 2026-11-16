import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { lightMock } = vi.hoisted(() => ({ lightMock: vi.fn() }));

vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({ light: lightMock }),
}));

import { AuthBackButton } from './AuthBackButton';

describe('AuthBackButton certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a button that fires haptics and the handler on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(<AuthBackButton onClick={onClick} inline />);

    const button = screen.getByRole('button', { name: 'Go back' });
    expect(button).toHaveTextContent('Back');
    expect(button).toHaveClass('relative');
    await user.click(button);

    expect(lightMock).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toHaveProperty('type', 'click');
    await expectNoA11yViolations(container);
  });

  it('renders a link when given an href and still runs the handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn(event => event?.preventDefault());
    const { container } = render(
      <AuthBackButton
        href='/signin'
        onClick={onClick}
        ariaLabel='Back to sign in'
      />
    );

    const link = screen.getByRole('link', { name: 'Back to sign in' });
    expect(link).toHaveAttribute('href', '/signin');
    expect(link).toHaveClass('fixed');
    await user.click(link);

    expect(lightMock).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('fires haptics without a handler and works from the keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <AuthBackButton inline ariaLabel='رجوع' />
      </div>
    );

    await user.tab();
    const button = screen.getByRole('button', { name: 'رجوع' });
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(lightMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
