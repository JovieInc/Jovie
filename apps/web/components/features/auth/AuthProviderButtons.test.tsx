import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AuthProviderButtonSlot,
  AuthProviderButtonSlots,
} from './AuthProviderButtons';

// State and accessibility coverage for each provider pill state. The touch
// ownership and Pen geometry contract lives in
// tests/unit/auth/AuthProviderButtons.test.tsx.
describe('AuthProviderButtons states', () => {
  it('starts the provider from an enabled pill', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AuthProviderButtonSlot
        provider='google'
        disabled={false}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('draws the mono Apple glyph inside the hairline face', async () => {
    const { container } = render(
      <AuthProviderButtonSlot provider='apple' disabled={false} />
    );

    const button = screen.getByRole('button', { name: 'Continue with Apple' });
    const face = button.querySelector('[data-auth-provider-face]');
    expect(face?.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    expect(face?.querySelector('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('announces the pending provider and ignores further presses', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AuthProviderButtonSlot
        provider='google'
        disabled={false}
        pending
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', {
      name: 'Continue with Google loading',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-auth-provider-pending', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('holds the hydration slots disabled inside a busy group', async () => {
    const { container } = render(
      <AuthProviderButtonSlots providers={['google', 'apple']} />
    );

    const group = screen.getByRole('group', {
      name: 'Loading social sign-in options',
    });
    expect(group).toHaveAttribute('aria-busy', 'true');
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).not.toHaveAttribute('data-auth-provider-pending');
    }
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AuthProviderButtonSlot provider='google' disabled={false} />
        <AuthProviderButtonSlot provider='apple' disabled={false} />
      </div>
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
