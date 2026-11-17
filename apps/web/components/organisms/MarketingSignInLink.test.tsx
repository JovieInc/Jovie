import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingSignInLink } from './MarketingSignInLink';

// State and accessibility coverage for each MarketingSignInLink variant. The
// Button-contract source guard lives in
// tests/components/organisms/MarketingSignInLink.test.tsx.
describe('MarketingSignInLink states', () => {
  it('renders the ghost text link to the sign-in route and takes keyboard focus', async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingSignInLink />);

    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', APP_ROUTES.SIGNIN);
    expect(link).not.toHaveAttribute('data-variant');
    // Its colour comes from the header link tokens (light and dark), never a
    // raw neutral or white-alpha class.
    expect(link).toHaveClass(
      'text-header-text-link',
      'hover:text-header-text-link-hover'
    );
    expect(link.className).not.toMatch(/neutral-|white\//);

    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders the homepage Log in label on the same text link', async () => {
    const { container } = render(<MarketingSignInLink label='Log in' />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the pill on the primary Button and keeps it keyboard reachable', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarketingSignInLink variant='pill' label='Log in' />
    );

    const pill = screen.getByRole('link', { name: 'Log in' });
    expect(pill).toHaveAttribute('data-variant', 'primary');
    expect(pill).toHaveAttribute('href', APP_ROUTES.SIGNIN);

    await user.tab();
    expect(pill).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left header', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingSignInLink />
        <MarketingSignInLink variant='pill' label='Log in' />
      </div>
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
