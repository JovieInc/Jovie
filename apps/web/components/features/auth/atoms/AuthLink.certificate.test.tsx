import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthLink } from './AuthLink';

describe('AuthLink certificate', () => {
  it('is a focusable link with a visible focus ring class', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthLink href='/signup'>Sign up</AuthLink>);

    await user.tab();
    const link = screen.getByRole('link', { name: 'Sign up' });
    expect(link).toHaveFocus();
    expect(link).toHaveClass('focus-ring-themed');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL link text whole', async () => {
    const long =
      'Create an account for your label and every artist on your roster';
    const { container } = render(
      <div dir='rtl'>
        <AuthLink href='/signup'>{long}</AuthLink>
        <AuthLink href='/signin'>سجّل الدخول</AuthLink>
      </div>
    );

    expect(screen.getByRole('link', { name: long })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(screen.getByRole('link', { name: 'سجّل الدخول' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expectNoA11yViolations(container);
  });
});
