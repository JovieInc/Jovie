import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthFooterLink } from './AuthFooterLink';

describe('AuthFooterLink certificate', () => {
  it('renders the prompt followed by its link', async () => {
    const { container } = render(
      <AuthFooterLink
        prompt="Don't have an account?"
        href='/signup'
        linkText='Sign up'
      />
    );

    expect(container.firstChild).toHaveTextContent(
      "Don't have an account? Sign up"
    );
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/signup'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the link reachable by keyboard with long and RTL copy', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <AuthFooterLink
          prompt='ليس لديك حساب؟ ابدأ ملفك الأول اليوم وشاركه مع جمهورك'
          href='/signup'
          linkText='سجّل الآن'
        />
      </div>
    );

    await user.tab();
    expect(screen.getByRole('link', { name: 'سجّل الآن' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });
});
